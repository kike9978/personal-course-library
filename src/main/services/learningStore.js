import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { normalizeChildIds, settleNesting } from '../../shared/playlistNest.js'

const STORE_FILE = 'learning-store.json'
const COMPLETE_THRESHOLD = 0.95
const RECENTLY_VIEWED_MS = 14 * 24 * 60 * 60 * 1000

function getStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function emptyStore() {
  return {
    version: 5,
    courses: {},
    playlists: []
  }
}

function emptyCourseState() {
  return {
    lastLessonRelativePath: null,
    lastLessonTitle: null,
    lastPositionSec: 0,
    lastOpenedAt: null,
    lastViewedAt: null,
    playableLessons: [],
    lessons: {},
    notes: [],
    bookmarks: [],
    projects: []
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function ensureArrays(course) {
  if (!Array.isArray(course.notes)) course.notes = []
  if (!Array.isArray(course.bookmarks)) course.bookmarks = []
  if (!Array.isArray(course.projects)) course.projects = []
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

function validTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 86400000 ? value : null
}

/**
 * Stable "date added" for each course. The first time a course is seen, the
 * folder creation time is kept (or its modification time when creation time
 * is unavailable). Later edits do not move that date.
 * @param {Array<{ path: string, folderBirthtimeMs?: number|null, folderMtimeMs?: number|null, isNew?: boolean }>} courses
 * @param {number} [recentMs]
 */
export function withAddedDates(courses, recentMs = RECENTLY_VIEWED_MS) {
  const store = readStore()
  if (!store.addedAt || typeof store.addedAt !== 'object') store.addedAt = {}
  const now = Date.now()
  let dirty = false
  const seen = new Set()

  const next = (courses || []).map((course) => {
    const key = courseKey(course.path)
    seen.add(key)
    let addedAt = validTimestamp(store.addedAt[key])
    if (addedAt == null) {
      addedAt =
        validTimestamp(course.folderBirthtimeMs) || validTimestamp(course.folderMtimeMs) || now
      store.addedAt[key] = addedAt
      dirty = true
    }
    return {
      ...course,
      addedAt,
      isNew: now - addedAt < recentMs
    }
  })

  for (const key of Object.keys(store.addedAt)) {
    if (!seen.has(key)) {
      delete store.addedAt[key]
      dirty = true
    }
  }

  if (dirty) writeStore(store)
  return next
}

function readStore() {
  try {
    const filePath = getStorePath()
    if (!fs.existsSync(filePath)) return emptyStore()
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !data.courses) return emptyStore()
    let dirty = false
    for (const key of ['paths', 'courseBriefs', 'learnerGoals', 'activePathId']) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        delete data[key]
        dirty = true
      }
    }
    if (!Array.isArray(data.playlists)) {
      data.playlists = []
      dirty = true
    }
    if (dirty) writeStore(data)
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

function resolveViewedAt(state) {
  const viewed = state?.lastViewedAt
  const opened = state?.lastOpenedAt
  if (typeof viewed === 'number' && typeof opened === 'number') return Math.max(viewed, opened)
  if (typeof viewed === 'number') return viewed
  if (typeof opened === 'number') return opened
  return null
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
    state.lastLessonTitle || lastMeta?.title || (lastPath ? lessonTitleFromPath(lastPath) : null)
  const viewedAt = resolveViewedAt(state)

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
    lastLessonTitle,
    isRecentlyViewed: typeof viewedAt === 'number' && Date.now() - viewedAt < RECENTLY_VIEWED_MS
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
    typeof update.positionSec === 'number' ? Math.max(0, update.positionSec) : existing.positionSec

  let durationSec =
    typeof update.durationSec === 'number' && update.durationSec > 0
      ? update.durationSec
      : existing.durationSec || 0

  let completed = typeof update.completed === 'boolean' ? update.completed : existing.completed

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

  const now = Date.now()
  course.lastViewedAt = now

  if (update.setAsLast !== false) {
    course.lastLessonRelativePath = relativePath
    course.lastLessonTitle = title
    course.lastPositionSec = next.positionSec
    course.lastOpenedAt = now
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

/**
 * Remember that the course was opened, without changing lesson progress.
 * @param {string} coursePath
 */
export function recordCourseView(coursePath) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  course.lastViewedAt = Date.now()
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
  const aProject = a.projectId || ''
  const bProject = b.projectId || ''
  const aIsCourseWide = !aLesson && !aProject && (a.timeSec == null || a.timeSec === undefined)
  const bIsCourseWide = !bLesson && !bProject && (b.timeSec == null || b.timeSec === undefined)

  // Course-wide notes after everything scoped
  if (aIsCourseWide !== bIsCourseWide) return aIsCourseWide ? 1 : -1

  // Project notes after file/lesson notes, grouped by project
  const aIsProject = Boolean(aProject) && !aLesson
  const bIsProject = Boolean(bProject) && !bLesson
  if (aIsProject !== bIsProject) return aIsProject ? 1 : -1
  if (aIsProject && bIsProject) {
    const projectCmp = String(aProject).localeCompare(String(bProject), undefined, {
      sensitivity: 'base'
    })
    if (projectCmp !== 0) return projectCmp
    return (a.createdAt || a.updatedAt || 0) - (b.createdAt || b.updatedAt || 0)
  }

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
 * @param {{ id?: string, title?: string|null, body?: string, bodyHtml?: string|null, bodyJson?: string|null, lessonRelativePath?: string|null, lessonTitle?: string|null, projectId?: string|null, projectTitle?: string|null, timeSec?: number|null, color?: string|null }} payload
 * `body` is markdown (canonical). `bodyHtml` / `bodyJson` are legacy and cleared on new saves.
 * Project notes use `projectId` (no path/time). File notes use `lessonRelativePath`.
 */
export function upsertNote(coursePath, payload) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  const now = Date.now()
  // Empty body allowed = pin on timeline / lesson without text yet
  const body = String(payload.body ?? '').trim()
  const title = payload.title === undefined ? undefined : String(payload.title ?? '').trim() || null
  const bodyHtml =
    payload.bodyHtml === undefined ? undefined : payload.bodyHtml ? String(payload.bodyHtml) : null
  const bodyJson =
    payload.bodyJson === undefined ? undefined : payload.bodyJson ? String(payload.bodyJson) : null

  const resolveTargets = (base = {}) => {
    const next = {
      lessonRelativePath:
        payload.lessonRelativePath !== undefined
          ? payload.lessonRelativePath
          : (base.lessonRelativePath ?? null),
      lessonTitle:
        payload.lessonTitle !== undefined ? payload.lessonTitle : (base.lessonTitle ?? null),
      projectId: payload.projectId !== undefined ? payload.projectId : (base.projectId ?? null),
      projectTitle:
        payload.projectTitle !== undefined ? payload.projectTitle : (base.projectTitle ?? null),
      timeSec:
        payload.timeSec !== undefined
          ? typeof payload.timeSec === 'number'
            ? Math.max(0, payload.timeSec)
            : null
          : (base.timeSec ?? null)
    }

    // Mutual exclusion: project notes vs file/video notes
    if (payload.projectId) {
      next.projectId = payload.projectId
      next.projectTitle = payload.projectTitle ?? next.projectTitle ?? null
      next.lessonRelativePath = null
      next.lessonTitle = null
      next.timeSec = null
    } else if (payload.lessonRelativePath !== undefined || payload.timeSec !== undefined) {
      next.projectId = null
      next.projectTitle = null
    }

    return next
  }

  if (payload.id) {
    const idx = course.notes.findIndex((n) => n.id === payload.id)
    if (idx === -1) throw new Error('Anotación no encontrada')
    const targets = resolveTargets(course.notes[idx])
    course.notes[idx] = {
      ...course.notes[idx],
      title: title !== undefined ? title : (course.notes[idx].title ?? null),
      body: payload.body !== undefined ? body : course.notes[idx].body,
      bodyHtml: bodyHtml !== undefined ? bodyHtml : (course.notes[idx].bodyHtml ?? null),
      bodyJson: bodyJson !== undefined ? bodyJson : (course.notes[idx].bodyJson ?? null),
      ...targets,
      color: payload.color !== undefined ? payload.color : course.notes[idx].color,
      updatedAt: now
    }
  } else {
    const targets = resolveTargets({})
    course.notes.push({
      id: makeId(),
      title: title ?? null,
      body,
      bodyHtml: bodyHtml ?? null,
      bodyJson: bodyJson ?? null,
      lessonRelativePath: targets.lessonRelativePath,
      lessonTitle: targets.lessonTitle,
      projectId: targets.projectId,
      projectTitle: targets.projectTitle,
      timeSec: targets.timeSec,
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

const PROJECT_STATUSES = new Set(['todo', 'in_progress', 'done'])

function linkStatus(linkedFolderPath) {
  if (!linkedFolderPath) {
    return { linkOk: false, linkMissing: true, linkIsFile: false }
  }
  try {
    if (!fs.existsSync(linkedFolderPath)) {
      return { linkOk: false, linkMissing: true, linkIsFile: false }
    }
    const stat = fs.statSync(linkedFolderPath)
    if (stat.isDirectory()) {
      return { linkOk: true, linkMissing: false, linkIsFile: false }
    }
    if (stat.isFile()) {
      return { linkOk: true, linkMissing: false, linkIsFile: true }
    }
    return { linkOk: false, linkMissing: true, linkIsFile: false }
  } catch {
    return { linkOk: false, linkMissing: true, linkIsFile: false }
  }
}

function decorateProject(project) {
  return {
    ...project,
    ...linkStatus(project.linkedFolderPath)
  }
}

export function listProjects(coursePath) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  return [...course.projects]
    .sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    )
    .map(decorateProject)
}

/**
 * Flatten projects across all courses for the global kanban board.
 */
export function listAllProjects() {
  const store = readStore()
  const items = []
  for (const [coursePath, value] of Object.entries(store.courses || {})) {
    const course = ensureArrays(value)
    for (const project of course.projects) {
      items.push({
        ...decorateProject(project),
        coursePath
      })
    }
  }
  return items.sort((a, b) => {
    const statusOrder = { in_progress: 0, todo: 1, done: 2 }
    const aStatus = statusOrder[a.status] ?? 1
    const bStatus = statusOrder[b.status] ?? 1
    if (aStatus !== bStatus) return aStatus - bStatus
    const updated = (b.updatedAt || 0) - (a.updatedAt || 0)
    if (updated !== 0) return updated
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

/**
 * @param {string} coursePath
 * @param {{
 *   id?: string,
 *   title?: string,
 *   linkedFolderPath?: string|null,
 *   notes?: string,
 *   status?: 'todo'|'in_progress'|'done',
 *   sectionId?: string|null
 * }} payload
 */
export function upsertProject(coursePath, payload) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  const now = Date.now()
  const title = String(payload.title ?? '').trim()
  if (!payload.id && !title) {
    throw new Error('El proyecto necesita un título')
  }

  const status = PROJECT_STATUSES.has(payload.status) ? payload.status : 'todo'
  const linkedFolderPath =
    payload.linkedFolderPath === undefined
      ? undefined
      : payload.linkedFolderPath
        ? String(payload.linkedFolderPath).trim() || null
        : null

  if (payload.id) {
    const idx = course.projects.findIndex((p) => p.id === payload.id)
    if (idx === -1) throw new Error('Proyecto no encontrado')
    course.projects[idx] = {
      ...course.projects[idx],
      title:
        payload.title !== undefined
          ? title || course.projects[idx].title
          : course.projects[idx].title,
      linkedFolderPath:
        linkedFolderPath !== undefined ? linkedFolderPath : course.projects[idx].linkedFolderPath,
      notes:
        payload.notes !== undefined
          ? String(payload.notes || '').trim()
          : course.projects[idx].notes,
      status: payload.status !== undefined ? status : course.projects[idx].status,
      sectionId:
        payload.sectionId !== undefined
          ? payload.sectionId || null
          : course.projects[idx].sectionId,
      updatedAt: now
    }
  } else {
    course.projects.push({
      id: makeId(),
      title,
      linkedFolderPath: linkedFolderPath ?? null,
      notes: String(payload.notes || '').trim(),
      status,
      sectionId: payload.sectionId || null,
      createdAt: now,
      updatedAt: now
    })
  }

  writeStore(store)
  return listProjects(coursePath)
}

export function deleteProject(coursePath, projectId) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  course.projects = course.projects.filter((p) => p.id !== projectId)
  writeStore(store)
  return listProjects(coursePath)
}

/** Resolve a stored project link for open/reveal (absolute path only if owned by this course). */
export function getProjectLinkedPath(coursePath, projectId) {
  const store = readStore()
  const { course } = getMutableCourse(store, coursePath)
  const project = course.projects.find((p) => p.id === projectId)
  if (!project) throw new Error('Proyecto no encontrado')
  if (!project.linkedFolderPath) throw new Error('Este proyecto no tiene carpeta vinculada')
  return project.linkedFolderPath
}

/**
 * Lowercased note title+body text keyed by course path — for library search.
 * @returns {Record<string, string>}
 */
export function getNotesSearchByCourse() {
  const store = readStore()
  const map = {}
  for (const [coursePath, value] of Object.entries(store.courses || {})) {
    const course = ensureArrays(value)
    const chunks = []
    for (const note of course.notes) {
      if (note.title) chunks.push(String(note.title))
      if (note.body) chunks.push(String(note.body))
    }
    map[coursePath] = chunks.join('\n').toLowerCase()
  }
  return map
}

function finiteNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clipText(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function normalizeCourseWhys(raw, coursePaths) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const notes = {}
  for (const coursePath of coursePaths) {
    const text = clipText(source[coursePath], 180)
    if (text) notes[coursePath] = text
  }
  return notes
}

function normalizePlaylistIntent(input) {
  const source = input && typeof input === 'object' ? input : {}
  const goal = clipText(source.goal, 180)
  const interests = []
  const seen = new Set()
  const raw = Array.isArray(source.interests) ? source.interests : []
  for (const item of raw) {
    const text = clipText(item, 80)
    const key = text.toLowerCase()
    if (text.length < 2 || seen.has(key)) continue
    seen.add(key)
    interests.push(text)
    if (interests.length >= 8) break
  }
  return { goal, interests }
}

function normalizePlaylist(input, existing) {
  const source = input && typeof input === 'object' ? input : {}
  const rawId = String(source.id || existing?.id || '').trim()
  const id = /^[a-zA-Z0-9_-]{1,80}$/.test(rawId) ? rawId : makeId()
  const title =
    String(source.title ?? existing?.title ?? 'Nueva lista')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Nueva lista'
  const position = {
    x: finiteNumber(source.position?.x, existing?.position?.x ?? 48),
    y: finiteNumber(source.position?.y, existing?.position?.y ?? 48)
  }
  const size = {
    width: clampNumber(finiteNumber(source.size?.width, existing?.size?.width ?? 320), 280, 960),
    height: clampNumber(finiteNumber(source.size?.height, existing?.size?.height ?? 220), 140, 8000)
  }
  const rawPaths = Array.isArray(source.coursePaths)
    ? source.coursePaths
    : existing?.coursePaths || []
  const coursePaths = []
  const seen = new Set()
  for (const item of rawPaths) {
    const name = path.basename(String(item || '').trim())
    if (!name || name === '.' || name === '..' || seen.has(name)) continue
    seen.add(name)
    coursePaths.push(name)
  }
  const why = clipText(source.why !== undefined ? source.why : existing?.why, 280)
  const childIds = normalizeChildIds(
    source.childIds !== undefined ? source.childIds : existing?.childIds,
    id
  )
  const courseWhys = normalizeCourseWhys(
    source.courseWhys !== undefined ? source.courseWhys : existing?.courseWhys,
    coursePaths
  )
  const now = Date.now()
  return {
    id,
    title,
    why,
    position,
    size,
    coursePaths,
    childIds,
    courseWhys,
    createdAt: existing?.createdAt || now,
    updatedAt: source === existing && existing?.updatedAt ? existing.updatedAt : now
  }
}

export function getPlaylistIntent() {
  const store = readStore()
  return normalizePlaylistIntent(store.playlistIntent)
}

export function savePlaylistIntent(payload) {
  const store = readStore()
  store.playlistIntent = normalizePlaylistIntent(payload)
  writeStore(store)
  return store.playlistIntent
}

export function listPlaylists() {
  const store = readStore()
  return settleNesting((store.playlists || []).map((playlist) => normalizePlaylist(playlist, playlist)))
}

export function upsertPlaylist(payload) {
  const store = readStore()
  if (!Array.isArray(store.playlists)) store.playlists = []
  const existing = store.playlists.find((playlist) => playlist.id === payload?.id)
  const next = normalizePlaylist(payload, existing)
  if (existing && existing.id === next.id) {
    const index = store.playlists.findIndex((playlist) => playlist.id === next.id)
    store.playlists[index] = next
  } else {
    store.playlists.push(next)
  }
  writeStore(store)
  return next
}

export function deletePlaylist(playlistId) {
  const store = readStore()
  if (!Array.isArray(store.playlists)) store.playlists = []
  const id = String(playlistId || '')
  const next = store.playlists
    .filter((playlist) => playlist.id !== id)
    .map((playlist) => ({
      ...playlist,
      childIds: (playlist.childIds || []).filter((childId) => childId !== id)
    }))
  if (next.length !== store.playlists.length) {
    store.playlists = next
    writeStore(store)
  }
  return { ok: true }
}

/** Absolute path to learning-store.json (notes, projects, progress). */
export function getLearningStorePath() {
  return getStorePath()
}

/** Ensure the store file exists on disk, then return its path. */
export function ensureLearningStoreFile() {
  writeStore(readStore())
  return getStorePath()
}

export { COMPLETE_THRESHOLD }
