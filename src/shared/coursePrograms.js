/**
 * Programs brief and paste parser.
 * The app packs what it already knows about each course (title, folder, school, lessons,
 * description, project files on disk) and the person's chat guesses which programs it teaches.
 * The app does not call a model. A broken reply writes nothing.
 */

import { extractJsonValue, nameKey, outlineForBrief } from './courseDescription.js'

const NOT_JSON = 'Ese texto no es JSON válido. No se guardó nada.'
const NO_ROWS = 'Ese texto no tiene programas que guardar. No se guardó nada.'
const SKIP_NOT_OBJECT = 'La fila no es un objeto.'
const SKIP_NO_MATCH = 'No coincide con ningún curso del encargo.'
const SKIP_DUPLICATE = 'Ese curso ya venía en otra fila. Se usó la primera.'
const SKIP_MISSING = 'No vino en la respuesta.'
const SKIP_EMPTY = 'La respuesta no propone programas nuevos.'
const EXAMPLE_ONLY = 'La respuesta sigue siendo el ejemplo del encargo.'

const EXAMPLE_EVIDENCE = 'What in the data points to it, in a few words.'
const EXAMPLE_PROGRAM = 'Program name'

export const CONFIDENCE = ['high', 'medium', 'low']
const MAX_PROGRAMS = 6
const MAX_NAME = 40
const MAX_EVIDENCE = 160
const MAX_FILE_EXTS = 10
const MAX_FILE_NAMES = 6

const OUTLINE_LIMITS = { maxSections: 6, maxLessonsPerSection: 5, maxLessons: 20 }

/** File types the person opens in a program. Media, subtitles and plain docs say nothing. */
const SILENT_EXTS = new Set([
  '.mp4',
  '.mkv',
  '.webm',
  '.mov',
  '.avi',
  '.m4v',
  '.ts',
  '.mts',
  '.m2ts',
  '.mp3',
  '.wav',
  '.aac',
  '.m4a',
  '.flac',
  '.ogg',
  '.srt',
  '.vtt',
  '.txt',
  '.md',
  '.html',
  '.htm',
  '.url',
  '.nfo',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.pdf'
])

const INJECTION_RE = /ignore (all )?(previous|above)|you are now/i

function fact(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(value, max) {
  return fact(value).slice(0, max).trim()
}

function listFacts(value) {
  return Array.isArray(value) ? value.map(fact).filter(Boolean) : []
}

/** "Cinema 4D", "cinema4d" and "Cinema-4D" are one program. */
export function programKey(value) {
  return nameKey(value).replace(/[^\p{L}\p{N}+#]/gu, '')
}

/** Program names already in the library, most used first, plus the default suggestions. */
export function programVocabulary(courses, suggestions = []) {
  const counts = new Map()
  const names = new Map()
  const add = (name, weight) => {
    const label = clip(name, MAX_NAME)
    const key = programKey(label)
    if (!key) return
    if (!names.has(key)) names.set(key, label)
    counts.set(key, (counts.get(key) || 0) + weight)
  }
  for (const course of Array.isArray(courses) ? courses : []) {
    for (const program of listFacts(course?.programs)) add(program, 1)
  }
  for (const program of Array.isArray(suggestions) ? suggestions : []) add(program, 0)
  return [...names.keys()]
    .sort((a, b) => counts.get(b) - counts.get(a) || names.get(a).localeCompare(names.get(b)))
    .map((key) => names.get(key))
}

function collectFiles(outline) {
  const files = []
  const walkResources = (list) => {
    for (const res of Array.isArray(list) ? list : []) {
      if (res?.name) files.push(res.name)
      else if (res?.relativePath) files.push(String(res.relativePath).split('/').pop())
      walkResources(res?.resources)
    }
  }
  const walkSections = (sections) => {
    for (const section of Array.isArray(sections) ? sections : []) {
      walkResources(section?.resources)
      for (const lesson of Array.isArray(section?.lessons) ? section.lessons : []) {
        walkResources(lesson?.resources)
      }
      walkSections(section?.sections)
    }
  }
  walkSections(outline?.sections)
  walkResources(outline?.courseResources)
  walkSections(outline?.courseResourceSections)
  return files
}

/** Project files in the course folder: the strongest hint of the program in use. */
export function fileHints(outline) {
  const counts = new Map()
  const samples = []
  for (const name of collectFiles(outline)) {
    const match = /\.[a-z0-9]{1,8}$/i.exec(name)
    if (!match) continue
    const ext = match[0].toLowerCase()
    if (SILENT_EXTS.has(ext)) continue
    counts.set(ext, (counts.get(ext) || 0) + 1)
    if (samples.length < MAX_FILE_NAMES && !INJECTION_RE.test(name)) samples.push(fact(name))
  }
  const exts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_FILE_EXTS)
    .map(([ext, count]) => `${ext} ×${count}`)
  return { exts, samples }
}

/** Courses for the encargo: those with no programs first, then the rest, both A→Z. */
export function coursesForProgramBatch(courses) {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const order = (a, b) =>
    fact(a.title || a.path).localeCompare(fact(b.title || b.path), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  const bare = list.filter((course) => !listFacts(course.programs).length).sort(order)
  const tagged = list.filter((course) => listFacts(course.programs).length).sort(order)
  return [...bare, ...tagged]
}

function courseBlock(entry, index) {
  const course = entry?.course || {}
  const lines = [`Course ${index + 1}`, `Folder: ${fact(course.path)}`]
  const title = fact(course.title)
  if (title && title !== fact(course.path)) lines.push(`Title: ${title}`)
  const institution = fact(course.institution)
  const instructor = fact(course.instructor)
  if (institution) lines.push(`Institution: ${institution}`)
  if (instructor) lines.push(`Instructor: ${instructor}`)
  const current = listFacts(course.programs)
  lines.push(`Programs already tagged: ${current.length ? current.join(', ') : '(none)'}`)
  const themes = listFacts(course.theme)
  if (themes.length) lines.push(`Themes: ${themes.join(', ')}`)
  const summary = clip(course.description?.summary, 400)
  if (summary && !INJECTION_RE.test(summary)) lines.push(`Description: ${summary}`)
  const outcomes = listFacts(course.description?.outcomes).filter((o) => !INJECTION_RE.test(o))
  if (outcomes.length) lines.push(`Outcomes: ${outcomes.slice(0, 4).join(' · ')}`)
  const hints = fileHints(entry?.outline)
  if (hints.exts.length) {
    lines.push(`Project files on disk: ${hints.exts.join(', ')}`)
    if (hints.samples.length) lines.push(`Sample files: ${hints.samples.join(', ')}`)
  }
  if (entry?.outlineUnreadable) {
    lines.push('Lessons: (could not be read)')
  } else {
    const packed = outlineForBrief(entry?.outline, OUTLINE_LIMITS)
    if (packed.kept) {
      lines.push('Lessons')
      lines.push(packed.text)
      if (packed.omitted > 0) lines.push(`(${packed.omitted} more lessons not listed)`)
    } else {
      lines.push('Lessons: (none found)')
    }
  }
  return lines.join('\n')
}

/**
 * Plain-text brief for several courses. Progress, ratings and notes are not included.
 * `vocabulary` is the list of program names the library already uses.
 */
export function buildProgramsBrief(entries, { vocabulary = [], omittedCount = 0 } = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => fact(entry?.course?.path))
  const known = listFacts(vocabulary)
  const first = list[0]?.course
  const example = {
    programs: [
      {
        folder: fact(first?.path) || 'Folder name',
        programs: [{ name: EXAMPLE_PROGRAM, confidence: 'high', evidence: EXAMPLE_EVIDENCE }]
      }
    ]
  }
  const omitted = Math.max(0, Number(omittedCount) || 0)
  return [
    'You are a course librarian. Reply with ONLY JSON (no intro). I will paste it back into the course library.',
    'For every course below, list the software programs it most likely teaches or uses (3D, design, video, code editors, game engines, plugins…). JSON only. Do not add a course that is not listed.',
    omitted
      ? `This brief covers ${list.length} courses. ${omitted} other courses are not listed. Do not answer for them.`
      : '',
    known.length
      ? `Program names this library already uses. Reuse the exact spelling when you mean one of them: ${known.join(', ')}`
      : '',
    'Courses',
    list.map(courseBlock).join('\n\n'),
    [
      'Base each guess on the data above: title, folder, lessons, description, and project file types (.blend is Blender, .psd is Photoshop, .c4d is Cinema 4D, .aep is After Effects, .ztl is ZBrush, .ma/.mb is Maya, .hip is Houdini, .spp is Substance Painter, and so on). You may use what you know about the instructor or school.',
      'confidence is "high" when the data names the program or its files, "medium" when the lessons clearly imply it, "low" for an educated guess. Prefer fewer, better answers: at most ' +
        MAX_PROGRAMS +
        ' per course. A course that teaches no software (drawing on paper, theory) gets an empty list.',
      'Do not repeat a program already tagged on that course. evidence is a few words in the language of the course title. Copy folder exactly.'
    ].join('\n'),
    JSON.stringify(example, null, 2)
  ]
    .filter(Boolean)
    .join('\n\n')
}

function replyRows(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value.programs) && value.programs.some((row) => row?.folder || row?.path))
    return value.programs
  if (Array.isArray(value.courses)) return value.courses
  if (Array.isArray(value.items)) return value.items
  if (value.folder || value.path) return [value]
  return null
}

function rowPrograms(row) {
  if (Array.isArray(row?.programs)) return row.programs
  if (Array.isArray(row?.suggestions)) return row.suggestions
  return []
}

function normalizeConfidence(value) {
  const text = fact(value).toLowerCase()
  if (CONFIDENCE.includes(text)) return text
  if (['alta', 'alto'].includes(text)) return 'high'
  if (['media', 'medio'].includes(text)) return 'medium'
  if (['baja', 'bajo'].includes(text)) return 'low'
  return 'low'
}

function matchCourse(row, courses) {
  const folder = fact(row.folder || row.path)
  if (folder) {
    const hits = courses.filter((course) => nameKey(course.path) === nameKey(folder))
    return hits.length === 1 ? hits[0] : null
  }
  const title = fact(row.course || row.title)
  if (!title) return null
  const hits = courses.filter((course) => nameKey(course.title) === nameKey(title))
  return hits.length === 1 ? hits[0] : null
}

/**
 * Parse one reply into suggestions for the courses the brief listed.
 * Names that match the vocabulary take its spelling. Programs already on the course are dropped.
 */
export function parseProgramsReply(text, courses, { vocabulary = [] } = {}) {
  const empty = (error) => ({ ok: false, error, items: [], skips: [] })
  if (!fact(text)) return empty(NOT_JSON)
  const value = extractJsonValue(text)
  if (value == null) return empty(NOT_JSON)
  const rows = replyRows(value)
  if (!rows) return empty(NO_ROWS)

  const canon = new Map()
  for (const name of listFacts(vocabulary)) {
    const key = programKey(name)
    if (key && !canon.has(key)) canon.set(key, clip(name, MAX_NAME))
  }

  const allow = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const items = []
  const seen = new Set()
  const strays = []
  const emptyRows = new Map()
  let sawExample = false

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      strays.push({ path: '', title: 'Fila vacía', reason: SKIP_NOT_OBJECT })
      continue
    }
    const course = matchCourse(row, allow)
    if (!course) {
      strays.push({
        path: '',
        title: fact(row.folder || row.path || row.course) || 'Sin nombre',
        reason: SKIP_NO_MATCH
      })
      continue
    }
    const key = nameKey(course.path)
    const title = fact(course.title) || course.path
    if (seen.has(key)) {
      strays.push({ path: '', title, reason: SKIP_DUPLICATE })
      continue
    }
    seen.add(key)

    const current = new Set(listFacts(course.programs).map(programKey))
    const taken = new Set()
    const suggestions = []
    for (const raw of rowPrograms(row)) {
      const entry = typeof raw === 'string' ? { name: raw } : raw
      if (!entry || typeof entry !== 'object') continue
      const name = clip(entry.name ?? entry.program, MAX_NAME)
      if (!name || INJECTION_RE.test(name)) continue
      const evidence = clip(entry.evidence ?? entry.why, MAX_EVIDENCE)
      if (name === EXAMPLE_PROGRAM && evidence === EXAMPLE_EVIDENCE) {
        sawExample = true
        continue
      }
      const pkey = programKey(name)
      if (!pkey || current.has(pkey) || taken.has(pkey)) continue
      taken.add(pkey)
      suggestions.push({
        name: canon.get(pkey) || name,
        known: canon.has(pkey),
        confidence: normalizeConfidence(entry.confidence),
        evidence: evidence === EXAMPLE_EVIDENCE || INJECTION_RE.test(evidence) ? '' : evidence
      })
      if (suggestions.length >= MAX_PROGRAMS) break
    }
    if (!suggestions.length) {
      emptyRows.set(key, { path: course.path, title, reason: SKIP_EMPTY })
      continue
    }
    const rank = (s) => CONFIDENCE.indexOf(s.confidence)
    suggestions.sort((a, b) => rank(a) - rank(b))
    items.push({ path: course.path, title, current: listFacts(course.programs), suggestions })
  }

  const skips = []
  for (const course of allow) {
    const key = nameKey(course.path)
    if (items.some((item) => nameKey(item.path) === key)) continue
    skips.push(
      emptyRows.get(key) || {
        path: course.path,
        title: fact(course.title) || course.path,
        reason: SKIP_MISSING
      }
    )
  }
  skips.push(...strays)

  if (!items.length) {
    return { ok: false, error: sawExample ? EXAMPLE_ONLY : NO_ROWS, items, skips }
  }
  return { ok: true, items, skips }
}

/** Suggestions checked by default: the ones the chat was sure about. */
export function defaultPicks(items) {
  const picks = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    for (const suggestion of item.suggestions || []) {
      if (suggestion.confidence !== 'low') picks.add(pickKey(item.path, suggestion.name))
    }
  }
  return picks
}

export function pickKey(path, name) {
  return `${path}\u0000${programKey(name)}`
}

/** Current programs plus the picked ones, without duplicates. Nothing is removed. */
export function mergePrograms(current, added) {
  const out = []
  const seen = new Set()
  for (const name of [...listFacts(current), ...listFacts(added)]) {
    const key = programKey(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}
