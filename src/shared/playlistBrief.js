/**
 * Playlist brief and paste parser.
 * The app writes the brief and stores listas. It does not call a model.
 */

import { extractJsonValue, nameKey } from './courseDescription.js'

const NOT_JSON = 'Ese texto no es JSON válido. No se guardó nada.'
const NO_LISTS = 'Ese texto no tiene listas que guardar. No se guardó nada.'
const GOAL_MISMATCH = 'Esa respuesta es para otra meta. No se guardó nada.'
const SKIP_NO_MATCH = 'No está en los cursos del encargo.'
const SKIP_DUPLICATE = 'Ya venía en esta lista. Se usó la primera.'
const SKIP_ALREADY = 'Ya está en la lista.'
const SKIP_NOT_OBJECT = 'La fila no es un objeto.'
const EXAMPLE_ONLY = 'La respuesta sigue siendo el ejemplo del encargo.'

const EXAMPLE_TITLE = 'A short path toward the goal'
const EXAMPLE_STEP = 'First step'
const EXAMPLE_WHY = 'Why these courses belong together, in one sentence.'
const EXAMPLE_COURSE_WHY = 'Why this course is next, in one sentence.'

export const MAX_LISTS = 6
export const MAX_COURSES = 12
const SKIP_COURSE_CAP = `Pasa del máximo de ${MAX_COURSES} cursos.`
const SKIP_LIST_CAP = `Pasa del máximo de ${MAX_LISTS} listas.`
const MAX_TITLE = 120
const MAX_WHY = 280
const MAX_COURSE_WHY = 180

const INJECTION_RE = /ignore (all )?(previous|above)|you are now/i

function fact(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(value, max) {
  return fact(value).slice(0, max).trim()
}

function usable(value, max) {
  const text = clip(value, max)
  if (!text || INJECTION_RE.test(text)) return ''
  return text
}

export function statusLabel(course) {
  const learning = course?.learning
  if (learning?.status === 'completed') return 'terminado'
  if (course?.isInProcess || learning?.status === 'in_progress') return 'en curso'
  return 'sin empezar'
}

/** One catalog row. The chat uses it to decide which courses belong. */
export function catalogLine(course) {
  const folder = fact(course?.path)
  const title = fact(course?.title)
  const institution = fact(course?.institution)
  const tags = [
    ...(Array.isArray(course?.programs) ? course.programs : []),
    ...(Array.isArray(course?.theme) ? course.theme : [])
  ]
    .map(fact)
    .filter(Boolean)
  const summary = clip(course?.description?.summary, 160)
  return [
    folder,
    title && title !== folder ? title : '',
    institution,
    tags.join(', '),
    statusLabel(course),
    summary
  ]
    .filter(Boolean)
    .join(' | ')
}

function listRows(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value.lists)) return value.lists
  if (Array.isArray(value.playlists)) return value.playlists
  if (value.title || Array.isArray(value.courses) || Array.isArray(value.coursePaths)) return [value]
  return null
}

function courseRows(list) {
  if (Array.isArray(list?.courses)) return list.courses
  if (Array.isArray(list?.coursePaths)) return list.coursePaths
  return null
}

function nestedRows(list) {
  if (Array.isArray(list?.lists)) return list.lists
  if (Array.isArray(list?.children)) return list.children
  return null
}

function matchCourse(folder, courses) {
  const key = nameKey(folder)
  if (!key) return null
  const hits = courses.filter((course) => nameKey(course.path) === key)
  return hits.length === 1 ? hits[0] : null
}

/**
 * Plain-text brief. Every course in the catalog is listed.
 * The chat filters that catalog and builds the listas. The app does not.
 * `mode` "extend" asks for courses to append to the lista already on the board.
 */
export function buildPlaylistBrief({
  courses,
  goal = '',
  interests = [],
  mode = 'create',
  existingPaths = []
} = {}) {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const goalText = fact(goal)
  const interestList = (Array.isArray(interests) ? interests : []).map(fact).filter(Boolean)
  const extend = mode === 'extend'
  const held = (Array.isArray(existingPaths) ? existingPaths : []).map(fact).filter(Boolean)
  const first = list[0]
  const exampleCourse = {
    folder: fact(first?.path) || 'Folder name',
    why: EXAMPLE_COURSE_WHY
  }
  const example = extend
    ? {
      ...(goalText ? { goal: goalText } : {}),
      courses: [exampleCourse]
    }
    : {
      ...(goalText ? { goal: goalText } : {}),
      lists: [
        {
          title: EXAMPLE_TITLE,
          why: EXAMPLE_WHY,
          lists: [
            {
              title: EXAMPLE_STEP,
              why: '',
              courses: [exampleCourse]
            }
          ]
        }
      ]
    }
  const extendBlock = extend
    ? [
      'This lista already contains these folders, in order. Keep them. Append new folders after them.',
      held.length ? held.map((folder, index) => `${index + 1}. ${folder}`).join('\n') : '(empty)'
    ].join('\n')
    : ''
  const filterJob = extend
    ? 'Filter the catalog yourself. Add only the courses that continue this lista. Leave out every course that does not. Two courses is enough. Stop when the next course would be a stretch. Do not pad the lista. Do not repeat a folder already in it.'
    : 'Filter the catalog yourself. Include a course only when it belongs in a path toward the goal and the interests. Leave every other course out. If there is no goal, group courses that teach the same thing and leave out courses that do not fit a path. Stop when the next course would be a stretch. Do not pad a lista so the counts match.'
  const shapeJob = extend
    ? 'Copy each folder exactly.'
    : 'Build only the paths the goal needs. One path is enough. Split a path into nested listas only where the subject changes. A nested lista holds the courses that belong together and no others. Two courses is a complete lista. Order the nested listas so a person could follow them. A lista with courses and no nested listas is also fine. Copy each folder exactly.'

  return [
    'You are a course librarian. Reply with ONLY JSON (no intro). I will paste it back into the course library.',
    'The catalog below is the whole library. You choose which courses belong. JSON only. Do not add a folder that is not in the catalog. Do not give one course the place of another. Do not mark a course finished.',
    goalText ? `Goal: ${goalText}` : '',
    interestList.length ? `Interests: ${interestList.join(', ')}` : '',
    extendBlock,
    `Catalog (${list.length} courses). Each row is folder | title | institution | tags | status | summary.`,
    list.map(catalogLine).join('\n'),
    [
      filterJob,
      shapeJob,
      'Write each title and why in the language of the goal. If there is no goal, use the language of the course titles.',
      'Leave why as an empty string when you have nothing to add.'
    ].join('\n'),
    JSON.stringify(example, null, 2)
  ]
    .filter(Boolean)
    .join('\n\n')
}

function isExampleStep(row) {
  const raw = courseRows(row) || []
  return (
    fact(row?.title) === EXAMPLE_STEP &&
    raw.length > 0 &&
    raw.every((item) => fact(item?.why) === EXAMPLE_COURSE_WHY)
  )
}

function isExampleList(row) {
  const nested = nestedRows(row) || []
  const raw = courseRows(row) || []
  const stepsAreExample = nested.length > 0 && nested.every(isExampleStep)
  const coursesAreExample =
    raw.length > 0 && raw.every((item) => fact(item?.why) === EXAMPLE_COURSE_WHY)
  return (
    fact(row?.title) === EXAMPLE_TITLE &&
    fact(row?.why) === EXAMPLE_WHY &&
    (stepsAreExample || coursesAreExample)
  )
}

function takeCourses(rows, courses, { existing = [], skips, label }) {
  const allow = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const held = new Set(existing.map((folder) => nameKey(folder)))
  const seen = new Set()
  const paths = []
  const notes = {}
  for (const row of rows) {
    const folder = fact(typeof row === 'string' ? row : row?.folder || row?.path)
    if (paths.length >= MAX_COURSES) {
      skips.push({ title: folder || label || 'Curso', reason: SKIP_COURSE_CAP })
      continue
    }
    const whyText = typeof row === 'string' ? '' : usable(row?.why, MAX_COURSE_WHY)
    const why = whyText === EXAMPLE_COURSE_WHY ? '' : whyText
    if (!row || (typeof row !== 'string' && (typeof row !== 'object' || Array.isArray(row)))) {
      skips.push({ title: label || 'Fila vacía', reason: SKIP_NOT_OBJECT })
      continue
    }
    const course = matchCourse(folder, allow)
    if (!course) {
      skips.push({ title: folder || 'Sin nombre', reason: SKIP_NO_MATCH })
      continue
    }
    const key = nameKey(course.path)
    if (held.has(key)) {
      skips.push({ title: fact(course.title) || course.path, reason: SKIP_ALREADY })
      continue
    }
    if (seen.has(key)) {
      skips.push({ title: fact(course.title) || course.path, reason: SKIP_DUPLICATE })
      continue
    }
    seen.add(key)
    paths.push(course.path)
    if (why) notes[course.path] = why
  }
  return { coursePaths: paths, courseWhys: notes }
}

/**
 * Parse one reply into listas whose folders are in `courses`.
 * A broken reply writes nothing. Unknown folders are returned in `skips`.
 */
export function parsePlaylistBrief(text, courses, { goal = '', mode = 'create', existingPaths = [] } = {}) {
  const empty = { ok: false, error: NOT_JSON, lists: [], skips: [], dropped: 0 }
  if (!fact(text)) return empty
  const value = extractJsonValue(text)
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return empty

  const expected = fact(goal)
  const named = fact(value.goal)
  if (expected && named && nameKey(named) !== nameKey(expected)) {
    return { ok: false, error: GOAL_MISMATCH, lists: [], skips: [], dropped: 0 }
  }

  const extend = mode === 'extend'
  const skips = []
  const lists = []
  let sawExample = false
  const held = (Array.isArray(existingPaths) ? existingPaths : []).map(fact).filter(Boolean)

  if (extend) {
    const rows = Array.isArray(value.courses) ? value.courses : courseRows(listRows(value)?.[0])
    if (!rows) return { ok: false, error: NO_LISTS, lists: [], skips: [], dropped: 0 }
    if (rows.length && rows.every((row) => fact(row?.why) === EXAMPLE_COURSE_WHY)) {
      return { ok: false, error: EXAMPLE_ONLY, lists: [], skips: [], dropped: rows.length }
    }
    const taken = takeCourses(rows, courses, { existing: held, skips, label: 'Seguir lista' })
    if (taken.coursePaths.length) {
      const whyText = usable(value.why || listRows(value)?.[0]?.why, MAX_WHY)
      lists.push({
        title: '',
        why: whyText === EXAMPLE_WHY ? '' : whyText,
        coursePaths: taken.coursePaths,
        courseWhys: taken.courseWhys
      })
    }
  } else {
    const rows = listRows(value)
    if (!rows) return { ok: false, error: NO_LISTS, lists: [], skips: [], dropped: 0 }
    for (const row of rows) {
      if (lists.length >= MAX_LISTS) {
        skips.push({ title: fact(row?.title) || 'Lista', reason: SKIP_LIST_CAP })
        continue
      }
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        skips.push({ title: 'Lista vacía', reason: SKIP_NOT_OBJECT })
        continue
      }
      const nested = nestedRows(row)
      const rawCourses = courseRows(row)
      if (!rawCourses && !nested) {
        skips.push({ title: fact(row.title) || 'Lista', reason: NO_LISTS })
        continue
      }
      if (isExampleList(row)) {
        sawExample = true
        continue
      }
      const children = []
      for (const step of nested || []) {
        if (children.length >= MAX_LISTS) {
          skips.push({ title: fact(step?.title) || 'Lista', reason: SKIP_LIST_CAP })
          continue
        }
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
          skips.push({ title: 'Lista vacía', reason: SKIP_NOT_OBJECT })
          continue
        }
        if (isExampleStep(step)) continue
        const stepCourses = courseRows(step)
        if (!stepCourses) {
          skips.push({ title: fact(step.title) || 'Lista', reason: NO_LISTS })
          continue
        }
        const stepTaken = takeCourses(stepCourses, courses, {
          existing: [],
          skips,
          label: fact(step.title)
        })
        if (!stepTaken.coursePaths.length) continue
        let stepTitle = usable(step.title, MAX_TITLE)
        if (stepTitle === EXAMPLE_STEP) stepTitle = ''
        const stepWhy = usable(step.why, MAX_WHY)
        children.push({
          title: stepTitle || 'Nuevo paso',
          why: stepWhy === EXAMPLE_WHY ? '' : stepWhy,
          coursePaths: stepTaken.coursePaths,
          courseWhys: stepTaken.courseWhys
        })
      }
      const taken = rawCourses
        ? takeCourses(rawCourses, courses, { existing: [], skips, label: fact(row.title) })
        : { coursePaths: [], courseWhys: {} }
      if (!taken.coursePaths.length && !children.length) continue
      let title = usable(row.title, MAX_TITLE)
      if (title === EXAMPLE_TITLE) title = ''
      const whyText = usable(row.why, MAX_WHY)
      lists.push({
        title: title || 'Nueva lista',
        why: whyText === EXAMPLE_WHY ? '' : whyText,
        coursePaths: taken.coursePaths,
        courseWhys: taken.courseWhys,
        children
      })
    }
  }

  const dropped = skips.length
  if (!lists.length) {
    return {
      ok: false,
      error: sawExample && skips.length === 0 ? EXAMPLE_ONLY : NO_LISTS,
      lists,
      skips,
      dropped
    }
  }
  return { ok: true, lists, skips, dropped }
}
