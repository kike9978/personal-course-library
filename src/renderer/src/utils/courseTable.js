export const EMPTY_COLUMN_FILTERS = {
  title: '',
  institution: '',
  instructor: '',
  program: '',
  theme: '',
  minRate: 0,
  status: '',
  added: '',
  modified: '',
  viewed: ''
}

const dateFormatter = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

export function courseViewedAt(course) {
  return Math.max(course?.learning?.lastViewedAt || 0, course?.learning?.lastOpenedAt || 0)
}

export function formatCourseDate(ms) {
  if (!ms) return '—'
  return dateFormatter.format(ms)
}

export function hasColumnFilters(filters) {
  if (!filters) return false
  return Boolean(
    filters.title ||
    filters.institution ||
    filters.instructor ||
    filters.program ||
    filters.theme ||
    filters.minRate ||
    filters.status ||
    filters.added ||
    filters.modified ||
    filters.viewed
  )
}

function includesText(value, query) {
  if (!query) return true
  return String(value || '')
    .toLowerCase()
    .includes(query.trim().toLowerCase())
}

function matchesPresence(flag, value) {
  if (flag === 'yes') return Boolean(value)
  if (flag === 'no') return !value
  return true
}

export function matchesColumnFilters(course, filters) {
  if (!filters) return true
  if (!includesText(course.title, filters.title)) return false
  if (filters.institution && course.institution !== filters.institution) return false
  if (!includesText(course.instructor, filters.instructor)) return false
  if (filters.program && !(course.programs || []).includes(filters.program)) return false
  if (filters.theme && !(course.theme || []).includes(filters.theme)) return false
  if (filters.minRate && (Number(course.rate) || 0) < Number(filters.minRate)) return false
  if (!matchesStatus(course, filters.status)) return false
  if (!matchesPresence(filters.added, course.addedAt)) return false
  if (!matchesPresence(filters.modified, course.folderMtimeMs)) return false
  if (!matchesPresence(filters.viewed, courseViewedAt(course))) return false
  return true
}

function matchesStatus(course, status) {
  if (!status) return true
  if (status === 'inProcess') return Boolean(course.isInProcess)
  if (status === 'recent') return Boolean(course.learning?.isRecentlyViewed)
  if (status === 'new') return Boolean(course.isNew)
  if (status === 'completed') return course.learning?.status === 'completed'
  if (status === 'missing') return Boolean(course.missingProps)
  return true
}

function textCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' })
}

export function compareCourses(a, b, key, dir) {
  const sign = dir === 'asc' ? 1 : -1
  let diff = 0
  if (key === 'title') diff = textCompare(a.title, b.title)
  else if (key === 'institution') diff = textCompare(a.institution, b.institution)
  else if (key === 'instructor') diff = textCompare(a.instructor, b.instructor)
  else if (key === 'programs') {
    diff = textCompare((a.programs || []).join(', '), (b.programs || []).join(', '))
  } else if (key === 'themes') {
    diff = textCompare((a.theme || []).join(', '), (b.theme || []).join(', '))
  } else if (key === 'rate') diff = (Number(a.rate) || 0) - (Number(b.rate) || 0)
  else if (key === 'progress') diff = (a.learning?.percent || 0) - (b.learning?.percent || 0)
  else if (key === 'added') diff = (a.addedAt || 0) - (b.addedAt || 0)
  else if (key === 'modified') diff = (a.folderMtimeMs || 0) - (b.folderMtimeMs || 0)
  else if (key === 'viewed') diff = courseViewedAt(a) - courseViewedAt(b)
  else if (key === 'status') diff = statusRank(a) - statusRank(b)
  if (diff !== 0) return diff * sign
  return textCompare(a.title, b.title)
}

function statusRank(course) {
  if (course.learning?.status === 'completed') return 5
  if (course.isInProcess) return 4
  if (course.learning?.isRecentlyViewed) return 3
  if (course.isNew) return 2
  if (course.missingProps) return 1
  return 0
}

export function nextColumnSort(current, key, kind) {
  const first = kind === 'text' ? 'asc' : 'desc'
  const second = first === 'asc' ? 'desc' : 'asc'
  if (!current || current.key !== key) return { key, dir: first }
  if (current.dir === first) return { key, dir: second }
  return null
}
