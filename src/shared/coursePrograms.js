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
const EXAMPLE_NAMES = new Set(['Program name', 'Medium name'])

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
export function programVocabulary(courses, suggestions = [], field = 'programs') {
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
    for (const program of listFacts(course?.[field])) add(program, 1)
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
export function coursesForProgramBatch(courses, field = 'programs') {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const order = (a, b) =>
    fact(a.title || a.path).localeCompare(fact(b.title || b.path), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  const bare = list.filter((course) => !listFacts(course[field]).length).sort(order)
  const tagged = list.filter((course) => listFacts(course[field]).length).sort(order)
  return [...bare, ...tagged]
}

function courseBlock(entry, index, field = 'programs') {
  const course = entry?.course || {}
  const lines = [`Course ${index + 1}`, `Folder: ${fact(course.path)}`]
  const title = fact(course.title)
  if (title && title !== fact(course.path)) lines.push(`Title: ${title}`)
  const institution = fact(course.institution)
  const instructor = fact(course.instructor)
  if (institution) lines.push(`Institution: ${institution}`)
  if (instructor) lines.push(`Instructor: ${instructor}`)
  const programs = listFacts(course.programs)
  lines.push(`Programs already tagged: ${programs.length ? programs.join(', ') : '(none)'}`)
  if (field === 'media') {
    const media = listFacts(course.media)
    lines.push(`Media already tagged: ${media.length ? media.join(', ') : '(none)'}`)
  }
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

const BRIEF = {
  programs: {
    noun: 'program',
    job: 'For every course below, list the software programs it most likely teaches or uses (3D, design, video, code editors, game engines, plugins, note and productivity apps…).',
    searched:
      'The app already searched these course folders: no program appears in the title, lesson names, or project files. So the answer is not in the data below. You have to look it up.',
    query: '"<institution> <title> software" or "<instructor> <title> tools"',
    section: 'a "Software", "Tools", "Requirements", "What you need" or "Materials" section',
    none: 'A course that teaches no software (drawing on paper, theory) gets an empty list.',
    example: 'Program name'
  },
  media: {
    noun: 'medium',
    job: 'For every course below, list the traditional media and physical materials it most likely uses: graphite, charcoal, ink, watercolor, gouache, acrylic, oil, pastel, colored pencils, markers, ballpoint, clay, printmaking, and so on. Photography counts as a medium: use "Photography" for courses shot with a camera, or "Film Photography" when they shoot on film (analog camera, darkroom). Use short English names.',
    searched:
      'The app already searched these course folders: no medium appears in the title or lesson names. So the answer is not in the data below. You have to look it up.',
    query: '"<institution> <title> materials" or "<instructor> <title> supplies"',
    section:
      'a "Materials", "Materiales", "Supplies", "What you need" or "Requirements" section (Domestika lists them under «Materiales»)',
    none: 'A course done only on a computer or tablet gets an empty list, even if it imitates watercolor or ink with digital brushes. Photo editing alone (retouching in Photoshop or Lightroom) is not photography unless the course also teaches shooting. Use the programs already tagged as a hint that a course is digital.',
    example: 'Medium name'
  }
}

/**
 * Plain-text brief for several courses. Progress, ratings and notes are not included.
 * `vocabulary` is the list of names the library already uses for `field`.
 * The courses reaching the chat are the ones the app could not place, so it is told to search the web.
 */
export function buildProgramsBrief(
  entries,
  { vocabulary = [], omittedCount = 0, field = 'programs' } = {}
) {
  const text = BRIEF[field] || BRIEF.programs
  const key = field === 'media' ? 'media' : 'programs'
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => fact(entry?.course?.path))
  const known = listFacts(vocabulary)
  const first = list[0]?.course
  const example = {
    [key]: [
      {
        folder: fact(first?.path) || 'Folder name',
        [key]: [
          {
            name: text.example,
            confidence: 'high',
            evidence: EXAMPLE_EVIDENCE,
            source: 'https://the-page-you-opened.example/course'
          }
        ]
      }
    ]
  }
  const omitted = Math.max(0, Number(omittedCount) || 0)
  return [
    'You are a course librarian. Reply with ONLY JSON (no intro). I will paste it back into the course library.',
    `${text.job} JSON only. Do not add a course that is not listed.`,
    text.searched,
    omitted
      ? `This brief covers ${list.length} courses. ${omitted} other courses are not listed. Do not answer for them.`
      : '',
    known.length
      ? `Names this library already uses. Reuse the exact spelling when you mean one of them: ${known.join(', ')}`
      : '',
    'Courses',
    list.map((entry, index) => courseBlock(entry, index, field)).join('\n\n'),
    [
      `Search the web for each course separately. Query with the institution, the course title, and the instructor (for example: ${text.query}). Open the official course page and look for ${text.section}; course pages on Domestika, Coloso, Skillshare, Udemy, Schoolism, CGMA, Gumroad and similar sites usually list it. If that page says nothing, check the instructor's site, a YouTube trailer description, or a review. Also check what the instructor is known to use in their other work.`,
      'Put the URL of the page that told you in source. If you found no page, leave source as an empty string and answer only from the data above.',
      `confidence is "high" when a page you opened names the ${text.noun} for this course, "medium" when the instructor clearly uses it in similar work, "low" for an educated guess with no page behind it. Prefer fewer, better answers: at most ${MAX_PROGRAMS} per course. ${text.none}`,
      `Do not repeat a ${text.noun} already tagged on that course. evidence is a few words in the language of the course title. Copy folder exactly.`
    ].join('\n'),
    JSON.stringify(example, null, 2)
  ]
    .filter(Boolean)
    .join('\n\n')
}

function replyRows(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  for (const key of ['programs', 'media']) {
    if (Array.isArray(value[key]) && value[key].some((row) => row?.folder || row?.path))
      return value[key]
  }
  if (Array.isArray(value.courses)) return value.courses
  if (Array.isArray(value.items)) return value.items
  if (value.folder || value.path) return [value]
  return null
}

function rowPrograms(row) {
  if (Array.isArray(row?.programs)) return row.programs
  if (Array.isArray(row?.media)) return row.media
  if (Array.isArray(row?.suggestions)) return row.suggestions
  return []
}

/** A public https page, or ''. The example URL from the brief does not count. */
function httpsSource(value) {
  const raw = fact(value)
  if (!raw || raw.length > 400) return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    return ''
  }
  if (url.protocol !== 'https:' || url.username || url.password) return ''
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host.endsWith('.example') || host.endsWith('.local')) return ''
  return url.href
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
export function parseProgramsReply(text, courses, { vocabulary = [], field = 'programs' } = {}) {
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

    const current = new Set(listFacts(course[field]).map(programKey))
    const taken = new Set()
    const suggestions = []
    for (const raw of rowPrograms(row)) {
      const entry = typeof raw === 'string' ? { name: raw } : raw
      if (!entry || typeof entry !== 'object') continue
      const name = clip(entry.name ?? entry.program, MAX_NAME)
      if (!name || INJECTION_RE.test(name)) continue
      const evidence = clip(entry.evidence ?? entry.why, MAX_EVIDENCE)
      if (EXAMPLE_NAMES.has(name) && evidence === EXAMPLE_EVIDENCE) {
        sawExample = true
        continue
      }
      const pkey = programKey(name)
      if (!pkey || current.has(pkey) || taken.has(pkey)) continue
      taken.add(pkey)
      const source = httpsSource(entry.source ?? entry.url)
      suggestions.push({
        name: canon.get(pkey) || name,
        known: canon.has(pkey),
        confidence: normalizeConfidence(entry.confidence),
        evidence: evidence === EXAMPLE_EVIDENCE || INJECTION_RE.test(evidence) ? '' : evidence,
        ...(source ? { source } : {})
      })
      if (suggestions.length >= MAX_PROGRAMS) break
    }
    if (!suggestions.length) {
      emptyRows.set(key, { path: course.path, title, reason: SKIP_EMPTY })
      continue
    }
    const rank = (s) => CONFIDENCE.indexOf(s.confidence)
    suggestions.sort((a, b) => rank(a) - rank(b))
    items.push({ path: course.path, title, current: listFacts(course[field]), suggestions })
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

/** Each proposed program with how many courses it was proposed for, most common first. */
export function programTally(items) {
  const byKey = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    for (const suggestion of item.suggestions || []) {
      const key = programKey(suggestion.name)
      const row = byKey.get(key) || { key, name: suggestion.name, count: 0 }
      row.count += 1
      byKey.set(key, row)
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Pick keys of every suggestion that passes `test(suggestion, item)`. */
export function picksWhere(items, test) {
  const picks = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    for (const suggestion of item.suggestions || []) {
      if (test(suggestion, item)) picks.add(pickKey(item.path, suggestion.name))
    }
  }
  return picks
}

/**
 * `count` random course paths for one encargo, so a big library is sent a slice at a time.
 * Courses with no programs go first; tagged ones only fill the rest. `random` is injectable for tests.
 */
export function randomCourseSample(
  courses,
  count,
  { random = Math.random, field = 'programs' } = {}
) {
  const list = (Array.isArray(courses) ? courses : []).filter((course) => fact(course?.path))
  const want = Math.max(0, Math.floor(Number(count) || 0))
  const shuffle = (rows) => {
    const out = [...rows]
    for (let index = out.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[out[index], out[swap]] = [out[swap], out[index]]
    }
    return out
  }
  const bare = shuffle(list.filter((course) => !listFacts(course[field]).length))
  const tagged = shuffle(list.filter((course) => listFacts(course[field]).length))
  return [...bare, ...tagged].slice(0, want).map((course) => course.path)
}
