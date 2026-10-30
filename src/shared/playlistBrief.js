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
const SKIP_UNKNOWN_LIST = 'Esa lista no está en el tablero.'
const EXAMPLE_ONLY = 'La respuesta sigue siendo el ejemplo del encargo.'

const EXAMPLE_TITLE = 'A short path toward the goal'
const EXAMPLE_PATH_2 = 'Another subject in the catalog'
const EXAMPLE_STEP = 'First step'
const EXAMPLE_STEP_2 = 'Next subject'
const EXAMPLE_WHY = 'Why these courses belong together, in one sentence.'
const EXAMPLE_COURSE_WHY = 'Why this course is next, in one sentence.'

export const MAX_LISTS = 40
export const MAX_COURSES = 40
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

/** Courses whose folder is not already on a lista. */
export function looseCourses(courses, playlists) {
  const placed = new Set()
  for (const playlist of Array.isArray(playlists) ? playlists : []) {
    for (const coursePath of playlist?.coursePaths || []) {
      const key = nameKey(coursePath)
      if (key) placed.add(key)
    }
  }
  return (Array.isArray(courses) ? courses : []).filter((course) => {
    const key = nameKey(course?.path)
    return key && !placed.has(key)
  })
}

function boardNode(playlist, byId) {
  const children = (playlist.childIds || []).map((id) => byId.get(id)).filter(Boolean)
  const courses = (playlist.coursePaths || []).map(fact).filter(Boolean)
  const row = {
    id: playlist.id,
    title: fact(playlist.title) || 'Nueva lista',
    why: fact(playlist.why)
  }
  if (children.length) row.lists = children.map((child) => boardNode(child, byId))
  if (courses.length || !children.length) row.courses = courses
  return row
}

/** Roots and their nested listas, with the folders already placed. */
export function boardTree(playlists) {
  const list = (Array.isArray(playlists) ? playlists : []).filter((playlist) => playlist?.id)
  const byId = new Map(list.map((playlist) => [playlist.id, playlist]))
  return list.filter((playlist) => !playlist.parentId).map((playlist) => boardNode(playlist, byId))
}

function firstListId(playlists) {
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node?.id) return node.id
      const nested = walk(node.lists || [])
      if (nested) return nested
    }
    return ''
  }
  return walk(boardTree(playlists)) || 'list-id'
}

function listRows(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value.lists)) return value.lists
  if (Array.isArray(value.playlists)) return value.playlists
  if (value.title || Array.isArray(value.courses) || Array.isArray(value.coursePaths))
    return [value]
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
 * `mode` "update" sends the current tree and only the courses that are on no lista.
 */
export function buildPlaylistBrief({
  courses,
  goal = '',
  interests = [],
  mode = 'create',
  existingPaths = [],
  board = []
} = {}) {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const goalText = fact(goal)
  const interestList = (Array.isArray(interests) ? interests : []).map(fact).filter(Boolean)
  const extend = mode === 'extend'
  const update = mode === 'update'
  const held = (Array.isArray(existingPaths) ? existingPaths : []).map(fact).filter(Boolean)
  const loose = update ? looseCourses(list, board) : list
  const pool = update ? loose : list
  const first = pool[0]
  const second = pool[1] || first
  const exampleCourse = {
    folder: fact(first?.path) || 'Folder name',
    why: EXAMPLE_COURSE_WHY
  }
  const exampleCourse2 = {
    folder: fact(second?.path) || 'Folder name',
    why: EXAMPLE_COURSE_WHY
  }
  const example = extend
    ? {
        ...(goalText ? { goal: goalText } : {}),
        courses: [exampleCourse]
      }
    : update
      ? {
          ...(goalText ? { goal: goalText } : {}),
          add: [{ id: firstListId(board), courses: [exampleCourse] }],
          create: [
            {
              title: EXAMPLE_TITLE,
              why: EXAMPLE_WHY,
              courses: [exampleCourse2]
            }
          ]
        }
      : {
          ...(goalText ? { goal: goalText } : {}),
          lists: [
            {
              title: EXAMPLE_TITLE,
              why: EXAMPLE_WHY,
              lists: [
                { title: EXAMPLE_STEP, why: '', courses: [exampleCourse] },
                { title: EXAMPLE_STEP_2, why: '', courses: [exampleCourse2] }
              ]
            },
            {
              title: EXAMPLE_PATH_2,
              why: EXAMPLE_WHY,
              courses: [exampleCourse2]
            }
          ]
        }
  const extendBlock = extend
    ? [
        'This lista already contains these folders, in order. Keep them. Append new folders after them.',
        held.length ? held.map((folder, index) => `${index + 1}. ${folder}`).join('\n') : '(empty)'
      ].join('\n')
    : ''
  const boardBlock = update
    ? [
        'Current listas. Do not move, remove, or rename a course already listed here. Copy each id exactly when you add to one.',
        JSON.stringify(boardTree(board), null, 2)
      ].join('\n')
    : ''
  const filterJob = update
    ? 'From the loose courses, place every one. Add it to an existing lista when it continues that subject. Create a lista only when it fits none. Do not repeat a folder already on the board. Do not return a sample of the matches.'
    : extend
      ? 'From the catalog, add every course that continues this lista. Leave out courses that do not. Do not repeat a folder already in it. Do not return a sample of the matches.'
      : goalText
        ? 'From the catalog, take every course that serves the goal or the interests. Leave out courses that do not. Do not return a sample of the matches. Do not stop after the first handful.'
        : 'Organize the catalog. Leave a course out only when it fits no subject. Do not return a sample.'
  const shapeJob = update
    ? 'Reply with add and create. Each add entry is an id from the current listas plus its new courses. Each create entry is a new lista. Nest listas inside create only when that new subject has two or more steps. A new lista with one step puts its courses directly on that lista. Copy each folder exactly.'
    : extend
      ? 'Copy each folder exactly.'
      : 'Group the courses you kept by subject. One path per subject. Inside a path, nested listas are the steps of that subject, in the order a person would follow them. Nest only when a path has two or more steps. A path with one step is a single lista: put its courses directly on that lista and do not wrap them. Put every kept course into exactly one lista. A single lista of only a few courses means you stopped early. Do not pad a lista with courses that do not fit. Do not make the counts match. Copy each folder exactly.'
  const catalogLabel = update
    ? `Loose courses (${loose.length}). Each row is folder | title | institution | tags | status | summary. A row with no summary has no saved description.`
    : `Catalog (${list.length} courses). Each row is folder | title | institution | tags | status | summary.`
  const intro = update
    ? 'The loose courses below are the only ones still off the board. JSON only. Do not add a folder that is not in the loose courses. Do not give one course the place of another. Do not mark a course finished.'
    : 'The catalog below is the whole library. You choose which courses belong. JSON only. Do not add a folder that is not in the catalog. Do not give one course the place of another. Do not mark a course finished.'

  return [
    'You are a course librarian. Reply with ONLY JSON (no intro). I will paste it back into the course library.',
    intro,
    goalText ? `Goal: ${goalText}` : '',
    interestList.length ? `Interests: ${interestList.join(', ')}` : '',
    extendBlock,
    boardBlock,
    catalogLabel,
    (update ? loose : list).map(catalogLine).join('\n'),
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
    (fact(row?.title) === EXAMPLE_STEP || fact(row?.title) === EXAMPLE_STEP_2) &&
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
    (fact(row?.title) === EXAMPLE_TITLE || fact(row?.title) === EXAMPLE_PATH_2) &&
    fact(row?.why) === EXAMPLE_WHY &&
    (stepsAreExample || coursesAreExample)
  )
}

/** A path with one step is that step. Nesting starts at two. */
export function flattenSingleNest(list) {
  const children = Array.isArray(list?.children) ? list.children : []
  if (children.length !== 1) return { ...list, children }
  const only = children[0]
  const coursePaths = []
  const seen = new Set()
  const courseWhys = { ...(list.courseWhys || {}) }
  for (const coursePath of [...(list.coursePaths || []), ...(only.coursePaths || [])]) {
    if (!coursePath || seen.has(coursePath)) continue
    seen.add(coursePath)
    coursePaths.push(coursePath)
  }
  Object.assign(courseWhys, only.courseWhys || {})
  const title = fact(list.title) && list.title !== 'Nueva lista' ? list.title : only.title
  return {
    title: title || only.title || 'Nueva lista',
    why: fact(list.why) || fact(only.why),
    coursePaths,
    courseWhys,
    children: []
  }
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

function isExampleCourses(rows) {
  return (
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every((item) => fact(item?.why) === EXAMPLE_COURSE_WHY)
  )
}

function acceptLists(rows, courses, { skips, hold = null }) {
  const lists = []
  let sawExample = false
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
        existing: hold || [],
        skips,
        label: fact(step.title)
      })
      if (hold) hold.push(...stepTaken.coursePaths)
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
      ? takeCourses(rawCourses, courses, {
          existing: hold || [],
          skips,
          label: fact(row.title)
        })
      : { coursePaths: [], courseWhys: {} }
    if (hold) hold.push(...taken.coursePaths)
    if (!taken.coursePaths.length && !children.length) continue
    let title = usable(row.title, MAX_TITLE)
    if (title === EXAMPLE_TITLE) title = ''
    const whyText = usable(row.why, MAX_WHY)
    lists.push(
      flattenSingleNest({
        title: title || 'Nueva lista',
        why: whyText === EXAMPLE_WHY ? '' : whyText,
        coursePaths: taken.coursePaths,
        courseWhys: taken.courseWhys,
        children
      })
    )
  }
  return { lists, sawExample }
}

function keptWhys(whys, paths) {
  const notes = {}
  for (const coursePath of paths) {
    if (whys?.[coursePath]) notes[coursePath] = whys[coursePath]
  }
  return notes
}

/**
 * Parse one reply into listas whose folders are in `courses`.
 * A broken reply writes nothing. Unknown folders are returned in `skips`.
 * `mode` "update" reads `add` into existing ids and `create` into new listas.
 */
export function parsePlaylistBrief(
  text,
  courses,
  { goal = '', mode = 'create', existingPaths = [], board = [] } = {}
) {
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
  const update = mode === 'update'
  const skips = []
  const lists = []
  const adds = []
  let sawExample = false
  const held = (Array.isArray(existingPaths) ? existingPaths : []).map(fact).filter(Boolean)

  if (extend) {
    const rows = Array.isArray(value.courses) ? value.courses : courseRows(listRows(value)?.[0])
    if (!rows) return { ok: false, error: NO_LISTS, lists: [], skips: [], dropped: 0 }
    if (isExampleCourses(rows)) {
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
  } else if (update) {
    if (!Array.isArray(value.add) && !Array.isArray(value.create)) {
      return { ok: false, error: NO_LISTS, lists: [], adds: [], skips: [], dropped: 0 }
    }
    const byId = new Map(
      (Array.isArray(board) ? board : [])
        .filter((playlist) => playlist?.id)
        .map((playlist) => [playlist.id, playlist])
    )
    const hold = []
    for (const playlist of byId.values()) {
      for (const coursePath of playlist.coursePaths || []) {
        if (fact(coursePath)) hold.push(coursePath)
      }
    }
    const merged = new Map()
    for (const row of value.add || []) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        skips.push({ title: 'Lista', reason: SKIP_NOT_OBJECT })
        continue
      }
      const id = fact(row.id)
      const target = byId.get(id)
      if (!target) {
        skips.push({ title: id || 'Lista', reason: SKIP_UNKNOWN_LIST })
        continue
      }
      const raw = courseRows(row)
      if (!raw) {
        skips.push({ title: fact(target.title) || id, reason: NO_LISTS })
        continue
      }
      if (isExampleCourses(raw)) {
        sawExample = true
        continue
      }
      const taken = takeCourses(raw, courses, {
        existing: hold,
        skips,
        label: fact(target.title) || id
      })
      hold.push(...taken.coursePaths)
      if (!taken.coursePaths.length) continue
      const prev = merged.get(id)
      if (prev) {
        prev.coursePaths.push(...taken.coursePaths)
        Object.assign(prev.courseWhys, taken.courseWhys)
        continue
      }
      merged.set(id, {
        id,
        title: fact(target.title) || 'Lista',
        coursePaths: [...taken.coursePaths],
        courseWhys: { ...taken.courseWhys }
      })
    }
    adds.push(...merged.values())
    const created = acceptLists(Array.isArray(value.create) ? value.create : [], courses, {
      skips,
      hold
    })
    lists.push(...created.lists)
    if (created.sawExample) sawExample = true
  } else {
    const rows = listRows(value)
    if (!rows) return { ok: false, error: NO_LISTS, lists: [], skips: [], dropped: 0 }
    const accepted = acceptLists(rows, courses, { skips })
    lists.push(...accepted.lists)
    sawExample = accepted.sawExample
  }

  const dropped = skips.length
  const placed = lists.length + adds.length
  if (!placed) {
    return {
      ok: false,
      error: sawExample && skips.length === 0 ? EXAMPLE_ONLY : NO_LISTS,
      lists,
      adds,
      skips,
      dropped
    }
  }
  return { ok: true, lists, adds, skips, dropped }
}

/** Groups the update reply into rows the dialog can check off. */
export function placementGroups(parsed) {
  const groups = []
  for (const add of parsed?.adds || []) {
    const rows = (add.coursePaths || []).map((path) => ({
      path,
      why: add.courseWhys?.[path] || '',
      check: `add:${add.id}:${path}`
    }))
    if (!rows.length) continue
    groups.push({
      key: `add:${add.id}`,
      kind: 'add',
      title: add.title || 'Lista',
      courses: rows
    })
  }
  for (const [index, list] of (parsed?.lists || []).entries()) {
    const own = (list.coursePaths || []).map((path) => ({
      path,
      why: list.courseWhys?.[path] || '',
      check: `create:${index}:${path}`
    }))
    if (own.length) {
      groups.push({
        key: `create:${index}`,
        kind: 'create',
        title: list.title || 'Nueva lista',
        courses: own
      })
    }
    for (const [childIndex, child] of (list.children || []).entries()) {
      const rows = (child.coursePaths || []).map((path) => ({
        path,
        why: child.courseWhys?.[path] || '',
        check: `create:${index}:${childIndex}:${path}`
      }))
      if (!rows.length) continue
      groups.push({
        key: `create:${index}:${childIndex}`,
        kind: 'create',
        title: `${list.title || 'Nueva lista'} / ${child.title || 'Nuevo paso'}`,
        courses: rows
      })
    }
  }
  return groups
}

/** Drop unchecked courses. A new path with one step left becomes a single lista. */
export function selectedPlacement(parsed, checked) {
  const keep = (key) => (checked instanceof Set ? checked.has(key) : Boolean(checked?.[key]))
  const adds = []
  for (const add of parsed?.adds || []) {
    const coursePaths = (add.coursePaths || []).filter((path) => keep(`add:${add.id}:${path}`))
    if (!coursePaths.length) continue
    adds.push({
      id: add.id,
      title: add.title,
      coursePaths,
      courseWhys: keptWhys(add.courseWhys, coursePaths)
    })
  }
  const lists = []
  for (const [index, list] of (parsed?.lists || []).entries()) {
    const coursePaths = (list.coursePaths || []).filter((path) => keep(`create:${index}:${path}`))
    const children = (list.children || [])
      .map((child, childIndex) => {
        const paths = (child.coursePaths || []).filter((path) =>
          keep(`create:${index}:${childIndex}:${path}`)
        )
        if (!paths.length) return null
        return {
          ...child,
          coursePaths: paths,
          courseWhys: keptWhys(child.courseWhys, paths)
        }
      })
      .filter(Boolean)
    if (!coursePaths.length && !children.length) continue
    lists.push(
      flattenSingleNest({
        ...list,
        coursePaths,
        courseWhys: keptWhys(list.courseWhys, coursePaths),
        children
      })
    )
  }
  return { adds, lists }
}
