export const LEVELS = [
  { level: 1, name: 'Beginner', threshold: 0 },
  { level: 2, name: 'Explorer', threshold: 25 },
  { level: 3, name: 'Achiever', threshold: 150 },
  { level: 4, name: 'Master', threshold: 500 }
]

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function localDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  const next = startOfDay(date)
  next.setDate(next.getDate() + days)
  return next
}

function parseLocalDate(key) {
  const [y, m, d] = String(key || '').split('-').map((part) => Number(part))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/**
 * Seconds the playhead advanced during real playback.
 * A forward jump larger than about two seconds times the rate is a seek.
 */
export function watchedDelta(previous, current, { playing, seeking, scrubbing, rate } = {}) {
  if (!playing || seeking || scrubbing) return 0
  if (previous == null || current == null) return 0
  const prev = Number(previous)
  const next = Number(current)
  if (!Number.isFinite(prev) || !Number.isFinite(next)) return 0
  const delta = next - prev
  if (delta <= 0) return 0
  const playbackRate = Number(rate) > 0 ? Number(rate) : 1
  const cap = Math.max(2, playbackRate * 2)
  if (delta > cap) return 0
  return delta
}

/** Keep local watch time when a Notion-shaped lesson omits it. */
export function keepWatchedSec(previous, incoming) {
  if (incoming && Object.prototype.hasOwnProperty.call(incoming, 'watchedSec')) {
    return Math.max(0, Number(incoming.watchedSec) || 0)
  }
  return Math.max(0, Number(previous?.watchedSec) || 0)
}

export function levelFromCompleted(completed) {
  const count = Math.max(0, Math.floor(Number(completed) || 0))
  let current = LEVELS[0]
  for (const level of LEVELS) {
    if (count >= level.threshold) current = level
  }
  const next = LEVELS.find((level) => level.threshold > count) || null
  return {
    level: current.level,
    name: current.name,
    lessonsToNext: next ? next.threshold - count : 0,
    nextName: next ? next.name : null,
    steps: LEVELS.map((level) => ({
      level: level.level,
      name: level.name,
      threshold: level.threshold,
      reached: count >= level.threshold,
      current: level.level === current.level
    }))
  }
}

export function currentStreak(dates, now) {
  const set = new Set(dates || [])
  let cursor = startOfDay(now)
  if (!set.has(localDateKey(cursor))) return 0
  let streak = 0
  while (set.has(localDateKey(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function longestStreak(dates) {
  const unique = [...new Set(dates || [])].filter((key) => parseLocalDate(key)).sort()
  let longest = 0
  let run = 0
  let prev = null
  for (const key of unique) {
    if (!prev) run = 1
    else run = localDateKey(addDays(parseLocalDate(prev), 1)) === key ? run + 1 : 1
    if (run > longest) longest = run
    prev = key
  }
  return longest
}

export function weekActivity(dates, now) {
  const set = new Set(dates || [])
  const today = startOfDay(now)
  const days = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    days.push(set.has(localDateKey(addDays(today, -offset))))
  }
  return days
}

function monthShort(key) {
  const date = parseLocalDate(key)
  if (!date) return ''
  return MONTHS[date.getMonth()] || ''
}

export function heatmapModel(dates, now) {
  const set = new Set(dates || [])
  const today = startOfDay(now)
  const weekday = (today.getDay() + 6) % 7
  const thisMonday = addDays(today, -weekday)
  const start = addDays(thisMonday, -52 * 7)
  const weeks = []
  for (let week = 0; week < 53; week += 1) {
    const days = []
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day)
      const key = localDateKey(date)
      const future = date.getTime() > today.getTime()
      days.push({
        date: key,
        active: !future && set.has(key),
        future
      })
    }
    weeks.push(days)
  }
  const months = weeks.map((week, index) => {
    const firstOfMonth = week.find((day) => day.date.endsWith('-01'))
    if (firstOfMonth) return monthShort(firstOfMonth.date)
    if (index === 0) return monthShort(week[0].date)
    return ''
  })
  return { weeks, months }
}

function lessonTotals(course) {
  const learning = course?.learning || {}
  const playable = Array.isArray(learning.playableLessons) ? learning.playableLessons : []
  const lessons = learning.lessons && typeof learning.lessons === 'object' ? learning.lessons : {}
  let completed = 0
  let watchedSec = 0
  for (const lesson of playable) {
    const row = lessons[lesson?.relativePath]
    if (row?.completed) completed += 1
    watchedSec += Math.max(0, Number(row?.watchedSec) || 0)
  }
  return { total: playable.length, completed, watchedSec }
}

export function formatWatchTime(seconds) {
  const mins = Math.round(Math.max(0, Number(seconds) || 0) / 60)
  if (mins < 60) {
    return { value: String(mins), unit: mins === 1 ? 'minuto' : 'minutos' }
  }
  const hours = mins / 60
  const value =
    hours < 10 ? String(Math.round(hours * 10) / 10).replace(/\.0$/, '') : String(Math.round(hours))
  return { value, unit: Number(value) === 1 ? 'hora' : 'horas' }
}

function summarySentence(completed, watchedSec) {
  const lessons = `${completed} ${completed === 1 ? 'lección' : 'lecciones'}`
  const mins = Math.round(Math.max(0, watchedSec) / 60)
  const hours = Math.round(Math.max(0, watchedSec) / 3600)
  const time =
    hours >= 1
      ? `${hours} ${hours === 1 ? 'hora' : 'horas'}`
      : `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`
  return `${lessons} y ${time} de estudio hasta ahora.`
}

function themeLabels(course) {
  const raw = Array.isArray(course?.theme) ? course.theme : []
  const labels = raw.map((theme) => String(theme || '').trim()).filter(Boolean)
  return labels.length ? labels : ['Otros']
}

export function buildProgressPage(courses, activityDates, now = new Date()) {
  const dates = Array.isArray(activityDates) ? activityDates : []
  let completedLessons = 0
  let totalLessons = 0
  let watchedSec = 0
  let inProgressCourses = 0
  let completedCourses = 0
  const courseRows = []
  const themes = new Map()

  for (const course of courses || []) {
    const totals = lessonTotals(course)
    if (totals.total <= 0) continue
    completedLessons += totals.completed
    totalLessons += totals.total
    watchedSec += totals.watchedSec
    const status = course.learning?.status
    if (status === 'completed') completedCourses += 1
    else if (status === 'in_progress') inProgressCourses += 1
    const percent = Math.round((totals.completed / totals.total) * 100)
    courseRows.push({
      path: course.path,
      title: course.title || course.path,
      instructor: course.instructor || '',
      totalLessons: totals.total,
      completedLessons: totals.completed,
      percent
    })
    for (const label of themeLabels(course)) {
      const bucket = themes.get(label) || {
        theme: label,
        courses: 0,
        totalLessons: 0,
        completedLessons: 0
      }
      bucket.courses += 1
      bucket.totalLessons += totals.total
      bucket.completedLessons += totals.completed
      themes.set(label, bucket)
    }
  }

  courseRows.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
  const themeRows = [...themes.values()]
    .map((theme) => ({
      ...theme,
      percent: theme.totalLessons ? Math.round((theme.completedLessons / theme.totalLessons) * 100) : 0
    }))
    .sort((a, b) => b.totalLessons - a.totalLessons || a.theme.localeCompare(b.theme, 'es'))

  const level = levelFromCompleted(completedLessons)
  const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
  const watch = formatWatchTime(watchedSec)
  const watchDetail =
    completedLessons > 0
      ? `Unos ${Math.max(1, Math.round(watchedSec / 60 / completedLessons))} min por lección`
      : ''

  return {
    summary:
      completedLessons === 0
        ? 'Termina tu primera lección y esta página empieza a llenarse.'
        : summarySentence(completedLessons, watchedSec),
    level,
    stats: {
      currentStreak: currentStreak(dates, now),
      longestStreak: longestStreak(dates),
      watchedSec,
      watch,
      watchDetail,
      completedLessons,
      totalLessons,
      percent,
      weekActivity: weekActivity(dates, now),
      inProgressCourses,
      completedCourses
    },
    heatmap: heatmapModel(dates, now),
    courses: courseRows,
    themes: themeRows
  }
}
