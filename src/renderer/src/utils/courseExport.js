import { storedDescription } from '../../../shared/courseDescription.js'

/**
 * Portable JSON snapshot of the course catalog and its metadata.
 * Notes bodies and lesson maps stay out of the file.
 */

function stringList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function clampRate(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(5, Math.round(n)))
}

function isoOrNull(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 86400000) return null
  const date = new Date(n)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function compactProgress(learning) {
  if (!learning || typeof learning !== 'object') return null
  const viewedAt = isoOrNull(learning.lastViewedAt) || isoOrNull(learning.lastOpenedAt)
  return {
    status: learning.status || 'not_started',
    percent: Number.isFinite(Number(learning.percent)) ? Number(learning.percent) : 0,
    completedCount: Number(learning.completedCount) || 0,
    playableCount: Number(learning.playableCount) || 0,
    lastLessonTitle: learning.lastLessonTitle || null,
    lastViewedAt: viewedAt,
    noteCount: Number(learning.noteCount) || 0
  }
}

export function courseToExportRecord(course = {}) {
  const folder = String(course.path || '').trim()
  return {
    folder,
    title: course.title || folder,
    institution: course.institution || '',
    instructor: course.instructor || '',
    programs: stringList(course.programs),
    theme: stringList(course.theme),
    rate: clampRate(course.rate),
    isInProcess: Boolean(course.isInProcess),
    isIncomplete: Boolean(course.isIncomplete),
    description: storedDescription(course.description),
    hasCover: Boolean(course.hasCover),
    hasProps: course.hasProps !== false && !course.missingProps,
    addedAt: isoOrNull(course.addedAt),
    modifiedAt: isoOrNull(course.folderMtimeMs),
    isNew: Boolean(course.isNew),
    progress: compactProgress(course.learning)
  }
}

export function buildCourseCatalogDocument(
  courses,
  { exportedAt = new Date().toISOString() } = {}
) {
  const list = (Array.isArray(courses) ? courses : []).map(courseToExportRecord)
  return {
    exportedAt,
    count: list.length,
    courses: list
  }
}

export function stringifyCourseCatalog(courses, options) {
  return `${JSON.stringify(buildCourseCatalogDocument(courses, options), null, 2)}\n`
}
