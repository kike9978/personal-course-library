import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const STORE_FILE = 'learning-store.json'
const COMPLETE_THRESHOLD = 0.95

function getStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function emptyStore() {
  return {
    version: 3,
    courses: {}
  }
}

function emptyCourseState() {
  return {
    lastLessonRelativePath: null,
    lastLessonTitle: null,
    lastPositionSec: 0,
    lastOpenedAt: null,
    playableLessons: [],
    lessons: {},
    notes: [],
    bookmarks: []
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function ensureArrays(course) {
  if (!Array.isArray(course.notes)) course.notes = []
  if (!Array.isArray(course.bookmarks)) course.bookmarks = []
  migrateBookmarksIntoNotes(course)
  return course
}

/**
 * One-time merge: bookmarks become notes (same thing as timed notes with text).
 */
function migrateBookmarksIntoNotes(course) {
  if (course.bookmarksMigrated || !course.bookmarks?.length) {
    if (!course.bookmarksMigrated && (!course.bookmarks || course.bookmarks.length === 0)) {
      course.bookmarksMigrated = true
    }
    return
  }

  for (const bm of course.bookmarks) {
    const body = String(bm.note || bm.label || '').trim()
    const id = `bm-${bm.id}`
    if (course.notes.some((n) => n.id === id)) continue
    // Skip near-duplicates already saved as notes
    const dup = course.notes.some(
      (n) =>
        n.lessonRelativePath === bm.lessonRelativePath &&
        ((n.timeSec == null && bm.timeSec == null) ||
          (typeof n.timeSec === 'number' &&
            typeof bm.timeSec === 'number' &&
            Math.abs(n.timeSec - bm.timeSec) < 0.5)) &&
        (n.body || '') === body
    )
    if (dup) continue

    course.notes.push({
      id,
      body: body || '',
      lessonRelativePath: bm.lessonRelativePath || null,
      lessonTitle: bm.lessonTitle || null,
      timeSec: typeof bm.timeSec === 'number' ? bm.timeSec : null,
      color: bm.color || null,
      createdAt: bm.createdAt || Date.now(),
      updatedAt: bm.updatedAt || bm.createdAt || Date.now()
    })
  }

  course.bookmarks = []
  course.bookmarksMigrated = true
}

function readStore() {
  try {
    const filePath = getStorePath()
    if (!fs.existsSync(filePath)) return emptyStore()
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !data.courses) return emptyStore()
    return data
  } catch {
    return emptyStore()
  }
}

function writeStore(store) {
  const filePath = getStorePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8')
}

function courseKey(coursePath) {
  return path.basename(coursePath)
}

function lessonTitleFromPath(relativePath) {
  const base = path.basename(relativePath || '', path.extname(relativePath || ''))
  return (
    base
      .replace(/^[\[\(]?\d+[\]\)]?[.\-_\s]+/g, '')
      .replace(/^(\d+[.\-_])+/g, '')
      .replace(/\s+/g, ' ')
      .trim() || base
  )
}

/**
 * Derive summary fields from raw course state.
 */
export function summarizeCourseState(courseState) {
  const state = ensureArrays(courseState || emptyCourseState())
  const playable = Array.isArray(state.playableLessons) ? state.playableLessons : []
  const playableCount = playable.length
  const lessonMap = state.lessons || {}

  let completedCount = 0
  if (playableCount > 0) {
    for (const lesson of playable) {
      if (lessonMap[lesson.relativePath]?.completed) completedCount += 1
    }
  } else {
    completedCount = Object.values(lessonMap).filter((l) => l?.completed).length
  }

  const percent =
    playableCount > 0
      ? Math.round((completedCount / playableCount) * 100)
      : completedCount > 0
        ? 100
        : 0

  let status = 'not_started'
  if (playableCount > 0 && completedCount >= playableCount) {
    status = 'completed'
  } else if (state.lastOpenedAt || completedCount > 0 || state.lastLessonRelativePath) {
    status = 'in_progress'
  }

  const lastPath = state.lastLessonRelativePath
  const lastMeta = playable.find((l) => l.relativePath === lastPath)
  const lastLessonTitle =
    state.lastLessonTitle ||
    lastMeta?.title ||
    (lastPath ? lessonTitleFromPath(lastPath) : null)

  return {
    ...state,
    notes: state.notes,
    bookmarks: state.bookmarks,
    noteCount: state.notes.length,
    bookmarkCount: 0,
    playableCount,
    completedCount,
    percent,
    status,
    lastLessonTitle
  }
}

export function getCourseProgress(coursePath) {
  const store = readStore()
  const key = courseKey(coursePath)
  return summarizeCourseState(store.courses[key] || emptyCourseState())
}

/**
 * Cache playable lesson list from a scan so library % can be computed.
 * @param {string} coursePath
 * @param {{ relativePath: string, title: string }[]} playableLessons
 */
export function setCourseCurriculum(coursePath, playableLessons) {
  const store = readStore()
  const key = courseKey(coursePath)
  const course = store.courses[key] || emptyCourseState()
  course.playableLessons = (playableLessons || []).map((l) => ({
    relativePath: l.relativePath,
    title: l.title || lessonTitleFromPath(l.relativePath)
  }))
  store.courses[key] = course
  writeStore(store)
  return summarizeCourseState(course)
}

/**
 * Update progress for a lesson and optionally set as last watched.
 * @param {string} coursePath
 * @param {{ relativePath: string, title?: string, positionSec?: number, durationSec?: number, completed?: boolean, setAsLast?: boolean }} update
 */
export function setLessonProgress(coursePath, update) {
  const store = readStore()
  const key = courseKey(coursePath)
  const course = store.courses[key] || emptyCourseState()
  const relativePath = update.relativePath
  if (!relativePath) {
    throw new Error('relativePath is required')
  }

  const existing = course.lessons[relativePath] || {
    positionSec: 0,
    durationSec: 0,
    completed: false,
    lastOpenedAt: null
  }

  let positionSec =
    typeof update.positionSec === 'number'
      ? Math.max(0, update.positionSec)
      : existing.positionSec

  let durationSec =
    typeof update.durationSec === 'number' && update.durationSec > 0
      ? update.durationSec
      : existing.durationSec || 0

  let completed =
    typeof update.completed === 'boolean' ? update.completed : existing.completed

  // Auto-complete near the end
  if (
    !completed &&
    durationSec > 0 &&
    typeof update.positionSec === 'number' &&
    update.positionSec / durationSec >= COMPLETE_THRESHOLD
  ) {
    completed = true
  }

  if (completed && durationSec > 0) {
    positionSec = durationSec
  }

  const title =
    update.title ||
    course.playableLessons?.find((l) => l.relativePath === relativePath)?.title ||
    lessonTitleFromPath(relativePath)

  const next = {
    ...existing,
    positionSec,
    durationSec,
    completed,
    lastOpenedAt: Date.now()
  }

  course.lessons[relativePath] = next

  if (update.setAsLast !== false) {
    course.lastLessonRelativePath = relativePath
    course.lastLessonTitle = title
    course.lastPositionSec = next.positionSec
    course.lastOpenedAt = Date.now()
  }

  // Ensure curriculum knows about this lesson
  if (!Array.isArray(course.playableLessons)) course.playableLessons = []
  if (!course.playableLessons.some((l) => l.relativePath === relativePath)) {
    course.playableLessons.push({ relativePath, title })
  }

  store.courses[key] = course
  writeStore(store)
  return summarizeCourseState(course)
}

export function getLessonProgress(coursePath, relativePath) {
  const course = getCourseProgress(coursePath)
  return (
    course.lessons[relativePath] || {
      positionSec: 0,
      durationSec: 0,
      completed: false,
      lastOpenedAt: null
    }
  )
}

/**
 * Map of course basename -> summarized progress (for library enrichment).
 */
export function getAllCourseProgress() {
  const store = readStore()
  const out = {}
  for (const [key, value] of Object.entries(store.courses || {})) {
    out[key] = summarizeCourseState(value)
  }
  return out
}

function getMutableCourse(store, coursePath) {
  const key = courseKey(coursePath)
  const course = ensureArrays(store.courses[key] || emptyCourseState())
  store.courses[key] = course
  return { key, course }
}

export function listNotes(coursePath) {
  const store = readStore()
  const key = courseKey(coursePath)
  const hadMigrated = Boolean(store.courses[key]?.bookmarksMigrated)
  const course = ensureArrays(store.courses[key] || emptyCourseState())
  store.courses[key] = course
  if (!hadMigrated && course.bookmarksMigrated) writeStore(store)
  return [...course.notes].sort(compareStudyItems)
}

/**
 * Sort: by lesson, then by time ascending; course-wide / no-time items last within group.
 */
function compareStudyItems(a, b) {
  const aLesson = a.lessonRelativePath || ''
  const bLesson = b.lessonRelativePath || ''
  const aIsCourseWide = !aLesson && (a.timeSec == null || a.timeSec === undefined)
  const bIsCourseWide = !bLesson && (b.timeSec == null || b.timeSec === undefined)

  // Course-wide notes after everything lesson-scoped
  if (aIsCourseWide !== bIsCourseWide) return aIsCourseWide ? 1 : -1

  const lessonCmp = String(aLesson).localeCompare(String(bLesson), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
  if (lessonCmp !== 0) return lessonCmp

  const aHasTime = typeof a.timeSec === 'number'
  const bHasTime = typeof b.timeSec === 'number'
  if (aHasTime && bHasTime) return a.timeSec - b.timeSec
  // Lesson-level pins (no time) after timed marks in the same lesson
  if (aHasTime && !bHasTime) return -1
  if (!aHasTime && bHasTime) return 1

  return (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0)
}

/** @deprecated Merged into notes. */
export function listBookmarks(coursePath) {
  listNotes(coursePath)
  return []
}

/**
 * @param {string} coursePath
 * @param {{ id?: string, body?: string, lessonRelativePath?: string|null, lessonTitle?: string|null, timeSec?: number|null, color?: string|null }} payload
 */
export function upsertNote(coursePath, payload) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  const now = Date.now()
  // Empty body allowed = pin on timeline / lesson without text yet
  const body = String(payload.body ?? '').trim()

  if (payload.id) {
    const idx = course.notes.findIndex((n) => n.id === payload.id)
    if (idx === -1) throw new Error('Anotación no encontrada')
    course.notes[idx] = {
      ...course.notes[idx],
      body: payload.body !== undefined ? body : course.notes[idx].body,
      lessonRelativePath:
        payload.lessonRelativePath !== undefined
          ? payload.lessonRelativePath
          : course.notes[idx].lessonRelativePath,
      lessonTitle:
        payload.lessonTitle !== undefined ? payload.lessonTitle : course.notes[idx].lessonTitle,
      timeSec: payload.timeSec !== undefined ? payload.timeSec : course.notes[idx].timeSec,
      color: payload.color !== undefined ? payload.color : course.notes[idx].color,
      updatedAt: now
    }
  } else {
    course.notes.push({
      id: makeId(),
      body,
      lessonRelativePath: payload.lessonRelativePath ?? null,
      lessonTitle: payload.lessonTitle ?? null,
      timeSec: typeof payload.timeSec === 'number' ? Math.max(0, payload.timeSec) : null,
      color: payload.color ?? null,
      createdAt: now,
      updatedAt: now
    })
  }

  writeStore(store)
  return listNotes(coursePath)
}

export function deleteNote(coursePath, noteId) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  course.notes = course.notes.filter((n) => n.id !== noteId)
  writeStore(store)
  return listNotes(coursePath)
}

/** @deprecated Use upsertNote — bookmarks are notes. */
export function upsertBookmark(coursePath, payload) {
  return upsertNote(coursePath, {
    id: payload.id,
    body: payload.note || payload.label || '',
    lessonRelativePath: payload.lessonRelativePath,
    lessonTitle: payload.lessonTitle,
    timeSec: payload.timeSec,
    color: payload.color
  })
}

/** @deprecated Use deleteNote. */
export function deleteBookmark(coursePath, bookmarkId) {
  return deleteNote(coursePath, bookmarkId)
}

/**
 * Flatten notes/bookmarks across all courses for global pages.
 */
export function listAllNotes() {
  const store = readStore()
  // Ensure migration runs for every course
  let dirty = false
  for (const value of Object.values(store.courses || {})) {
    const before = value.bookmarksMigrated
    ensureArrays(value)
    if (!before && value.bookmarksMigrated) dirty = true
  }
  if (dirty) writeStore(store)

  const items = []
  for (const [coursePath, value] of Object.entries(store.courses || {})) {
    const course = ensureArrays(value)
    for (const note of course.notes) {
      items.push({
        ...note,
        coursePath
      })
    }
  }
  return items.sort((a, b) => {
    const courseCmp = String(a.coursePath || '').localeCompare(String(b.coursePath || ''))
    if (courseCmp !== 0) return courseCmp
    return compareStudyItems(a, b)
  })
}

/** @deprecated Bookmarks merged into notes; kept for IPC compat. */
export function listAllBookmarks() {
  return []
}

export { COMPLETE_THRESHOLD }
