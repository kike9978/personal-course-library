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
    version: 2,
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
    lessons: {}
  }
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
  const state = courseState || emptyCourseState()
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

export { COMPLETE_THRESHOLD }
