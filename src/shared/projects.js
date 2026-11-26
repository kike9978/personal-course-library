/** Board helpers for projects: ordering inside a column, completion dates, month groups. */

export const PROJECT_STATUSES = ['todo', 'in_progress', 'paused', 'done']

/** En curso with no changes for this many days counts as stale. */
export const STALE_DAYS = 14
/** Above this many projects en curso, the board suggests finishing or pausing one. */
export const WIP_LIMIT = 3

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Position inside a column, ascending.
 * Projects never reordered by hand fall back to most recently changed first.
 */
export function projectSortKey(project) {
  const index = project?.sortIndex
  if (typeof index === 'number' && Number.isFinite(index)) return index
  return -(project?.updatedAt || 0)
}

export function sortColumn(projects) {
  return [...(projects || [])].sort((a, b) => projectSortKey(a) - projectSortKey(b))
}

/** sortIndex for a card dropped between `before` and `after` (either may be missing). */
export function sortIndexBetween(before, after) {
  const lo = before ? projectSortKey(before) : null
  const hi = after ? projectSortKey(after) : null
  if (lo == null && hi == null) return 0
  if (lo == null) return hi - 1
  if (hi == null) return lo + 1
  return (lo + hi) / 2
}

/** When the project last entered `status` (defaults to its current one). */
export function statusEnteredAt(project, status = project?.status || 'todo') {
  const history = Array.isArray(project?.statusHistory) ? project.statusHistory : []
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.status === status) return history[i].at || null
  }
  return null
}

export function completedAt(project) {
  return statusEnteredAt(project, 'done') || project?.updatedAt || project?.createdAt || null
}

export function daysSince(timestamp, now = Date.now()) {
  if (!timestamp) return null
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS))
}

export function isStale(project, now = Date.now()) {
  if ((project?.status || 'todo') !== 'in_progress') return false
  const days = daysSince(project?.updatedAt, now)
  return days != null && days >= STALE_DAYS
}

function monthKey(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(timestamp, now) {
  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  const text = date.toLocaleDateString('es', {
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Finished projects grouped by the month they were completed, newest month first. */
export function groupByCompletionMonth(projects, now = Date.now()) {
  const groups = new Map()
  for (const project of projects || []) {
    const at = completedAt(project) || now
    const key = monthKey(at)
    if (!groups.has(key)) groups.set(key, { key, label: monthLabel(at, now), items: [] })
    groups.get(key).items.push(project)
  }
  return [...groups.values()]
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => (completedAt(b) || 0) - (completedAt(a) || 0))
    }))
}
