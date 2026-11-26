/**
 * Flashcard brief and paste parser.
 * The app writes the brief and stores the deck. It does not call a model.
 *
 * A brief lists sources, each with a short ref (S1, S2 …):
 * - notes the person wrote (priority: they chose to write them down)
 * - lesson transcripts from subtitles, in chunks with clock marks
 * Big scopes are split into parts. Each reply is parsed against every source
 * of the brief, so parts can be pasted in any order.
 */

import { extractJsonValue } from './courseDescription.js'
import { isDefaultNoteTitle, plainNoteText } from './knowledgeGraph.js'
import { courseMediaNoteFile, markdownImageDestination } from './noteMedia.js'
import {
  CARD_TYPES,
  cardKey,
  cardType,
  checkCardFields,
  cleanCardText,
  clozePlain,
  hasCode,
  formatClock,
  parseClock,
  sourceSupport
} from './flashcardCards.js'

const NOT_JSON = 'Ese texto no es JSON válido. No se guardó nada.'
const NO_CARDS = 'Ese texto no tiene tarjetas que guardar. No se guardó nada.'
const NO_CONCEPTS = 'Ese texto no tiene conceptos. No se guardó nada.'
const GOAL_MISMATCH = 'Esa respuesta es para otra meta. No se guardó nada.'
const SKIP_NO_MATCH = 'Esa fuente no está en el encargo.'
const SKIP_DUPLICATE = 'Esa tarjeta ya venía. Se usó la primera.'
const SKIP_EXISTING = 'Ya está en el mazo.'
const SKIP_NOT_OBJECT = 'La fila no es un objeto.'
const SKIP_CARD_CAP = 'Pasa del máximo de tarjetas.'
const SKIP_TYPE = 'Ese tipo de tarjeta no se pidió.'
const SKIP_META = 'No se entiende sola: pregunta por la nota, no por la idea.'
const EXAMPLE_ONLY = 'La respuesta sigue siendo el ejemplo del encargo.'

const EXAMPLE_TITLE = 'A short deck from these sources'
const EXAMPLE_FRONT = 'Question the source can answer'
const EXAMPLE_BACK = 'Answer in the source, in one or two sentences.'
const EXAMPLE_CLOZE = 'A sentence from the source with {{c1::the key words}} blanked.'
const EXAMPLE_CONCEPT = 'Concept name'

export const MAX_NOTES = 60
export const MAX_CARDS = 120
export const MAX_CONCEPTS = 60
export const PART_BUDGET = 40000
const MAX_TITLE = 120
const MAX_NOTE_TEXT = 1500
const MAX_GOAL = 180
const MAX_EXISTING = 200
const MAX_EXISTING_PER_SOURCE = 12
const MAX_IMAGES = 6
const MAX_IMAGE_LABEL = 80
const MAX_IMAGE_NEAR = 100
const MAX_CONCEPT_NAME = 100
const MAX_CODE = 1500
const THIN_WORDS = 4
const FILE_LABEL_RE =
  /^(image|imagen|screenshot|captura|pasted)?[\w .-]*\.(png|jpe?g|webp|gif|bmp|svg)$/i
const CAPTION_CLOCK_RE =
  /(?:^|\s)(?:captura|screenshot|frame|at|en|a las)?\s*((?:\d+:)?\d{1,2}:\d{2})\b/i

/**
 * Words that make a card lean on the note instead of the idea: "this note",
 * "noted as", "according to the source". Such a card cannot be answered in Anki.
 */
const META_RE =
  /\b(this|that|these) (note|notes|source|transcript)\b|\bthe (note|notes|transcript)\b|\b(noted|mentioned|named|listed) (as|in|by)\b|\bspecifically noted\b|\baccording to (the|this) (note|source|transcript)\b|\b(esta|esa|estas|la|las) notas?\b|\besta fuente\b|\bseg[uú]n (la|esta) (nota|fuente|transcripci[oó]n)\b|\bse (menciona|nombra) en\b/i
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
const SAFE_FILE_RE = /^[a-z0-9-]+\.[a-z0-9]+$/i

const INJECTION_RE = /ignore (all )?(previous|above)|you are now/i

const TYPE_GUIDE = {
  basic:
    'basic: front is a short question, back the answer in one or two sentences. Best for why and how.',
  reverse:
    'reverse: front is a term, back its definition. The person studies it both ways, so use it only when recalling the term from the definition is useful too.',
  typein:
    'typein: front is a question with exactly one right answer: one word, number, name or short snippet (60 characters at most), in back. The person types it and it must match. If several answers would be right, use basic instead.',
  cloze:
    'cloze: no front/back. "text" is one or two sentences from the source with 1 to 3 key parts blanked as {{c1::words}}, {{c2::words}}. Each number becomes its own card. Optional "extra" adds context shown after the answer. Good for key values and for the important part of a code snippet.'
}

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

/** A card field from a reply. Code in ``` keeps its lines; prose collapses to one line. */
function cardField(value, max) {
  const raw = String(value ?? '')
  if (!hasCode(raw)) return usable(raw, max)
  const text = cleanCardText(raw)
  if (!text || INJECTION_RE.test(text)) return ''
  return text
}

function goalKey(value) {
  return fact(value).toLowerCase()
}

function courseName(coursePath) {
  return (
    String(coursePath || '')
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() || ''
  )
}

/**
 * Images attached to a note body, in order. The chat cannot see them, so each one
 * comes with its label and the words just before it.
 * @returns {{ ref: string, file: string, alt: string, near: string }[]}
 */
export function noteImagesForCards(markdown) {
  const text = String(markdown || '')
  const images = []
  const seen = new Set()
  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)\n]*)\)/g)) {
    if (images.length >= MAX_IMAGES) break
    let file = courseMediaNoteFile(match[2])
    try {
      file = decodeURIComponent(file)
    } catch {
      // Keep the raw name.
    }
    if (!file || !SAFE_FILE_RE.test(file) || !IMAGE_EXT_RE.test(file) || seen.has(file)) continue
    seen.add(file)
    const caption = markdownImageDestination(match[2]).title.replace(/^"|"$/g, '')
    const rawLabel = fact(caption || match[1])
    const label = FILE_LABEL_RE.test(rawLabel) ? '' : rawLabel
    const before = noteSourceText(text.slice(0, match.index))
    const after = noteSourceText(text.slice(match.index + match[0].length))
    const clock = CAPTION_CLOCK_RE.exec(label)
    images.push({
      ref: `img${images.length + 1}`,
      file,
      alt: clip(label, MAX_IMAGE_LABEL),
      near: before.length > MAX_IMAGE_NEAR ? before.slice(-MAX_IMAGE_NEAR).trim() : before,
      next: after.slice(0, MAX_IMAGE_NEAR).trim(),
      timeSec: clock ? parseClock(clock[1]) : null
    })
  }
  return images
}

/** Fenced and indented code blocks of a note, as plain code text. */
export function noteCodeBlocks(markdown) {
  const blocks = []
  for (const match of String(markdown || '').matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    const code = match[1].replace(/\s+$/, '')
    if (code.trim()) blocks.push(code)
  }
  return blocks
}

function countWords(text) {
  return fact(text)
    .split(' ')
    .filter((word) => /[\p{L}\p{N}]{2,}/u.test(word)).length
}

/** Private-use stand-ins so escaped Markdown survives the plain-text cleaner. */
const ESCAPE_MARKS = {
  '*': '\uE000',
  _: '\uE001',
  '~': '\uE002',
  '`': '\uE003',
  '[': '\uE004',
  ']': '\uE005',
  '#': '\uE006'
}

/**
 * Note text for a brief. Like the note list's plain text, but an escaped `\*`
 * stays a `*` (notes write multiplication that way) and inline video stamps
 * `{t:109.6}` become clocks `[1:49]` the chat can read.
 */
export function noteSourceText(markdown) {
  const body = String(markdown || '')
    .replace(/\{t:(\d+(?:\.\d+)?)\}/g, (_, sec) => ` [${formatClock(Number(sec))}] `)
    .replace(/\\([*_~`[\]#])/g, (_, ch) => ESCAPE_MARKS[ch])
  let text = plainNoteText(body)
  for (const [ch, mark] of Object.entries(ESCAPE_MARKS)) text = text.split(mark).join(ch)
  return text
}

/** One source per note that has words or code. */
export function sourcesFromNotes(notes) {
  const out = []
  let empty = 0
  for (const note of Array.isArray(notes) ? notes : []) {
    const id = fact(note?.id)
    if (!id) continue
    const stored = fact(note?.title)
    const title = stored && !isDefaultNoteTitle(stored) ? clip(stored, MAX_TITLE) : ''
    const text = clip(noteSourceText(note?.body), MAX_NOTE_TEXT)
    const code = noteCodeBlocks(note?.body).join('\n\n').slice(0, MAX_CODE)
    if (!title && !text && !code) {
      empty += 1
      continue
    }
    const images = noteImagesForCards(note?.body)
    const captionTime = images.find((image) => typeof image.timeSec === 'number')?.timeSec
    out.push({
      kind: 'note',
      noteId: id,
      coursePath: note.coursePath || null,
      course: fact(note.courseTitle || courseName(note.coursePath)),
      lessonPath: note.lessonRelativePath || null,
      lesson: fact(note.lessonTitle || note.lesson),
      title,
      text,
      code,
      thin: !code && countWords(`${title} ${text}`) < THIN_WORDS,
      images,
      timeSec: typeof note.timeSec === 'number' ? note.timeSec : (captionTime ?? null)
    })
  }
  return { sources: out, empty }
}

/** One source per transcript chunk of a lesson. */
export function sourcesFromLesson({ coursePath, course, lessonPath, lesson, section, chunks }) {
  return (chunks || [])
    .filter((chunk) => fact(chunk?.text))
    .map((chunk) => ({
      kind: 'lesson',
      noteId: null,
      coursePath: coursePath || null,
      course: fact(course || courseName(coursePath)),
      lessonPath: lessonPath || null,
      lesson: fact(lesson),
      section: fact(section),
      title: fact(lesson),
      text: String(chunk.text).trim(),
      images: [],
      start: Number(chunk.start) || 0,
      end: Number(chunk.end) || 0,
      timeSec: Math.floor(Number(chunk.start) || 0)
    }))
}

/** Give each source its ref (S1, S2 …), in order. */
export function numberSources(list) {
  return (list || []).map((source, index) => ({ ...source, ref: `S${index + 1}` }))
}

/** Source label shown under the answer once the card leaves the app. */
export function sourceLabel(source, timeSec = null) {
  if (!source) return ''
  const clock = typeof timeSec === 'number' && source.kind === 'lesson' ? formatClock(timeSec) : ''
  const own =
    source.kind === 'note' && source.title && source.title !== source.lesson ? source.title : ''
  return [source.course, source.lesson, own, clock].filter(Boolean).join(' · ')
}

function existingText(card) {
  if (typeof card === 'string') return clip(card, 160)
  const front = cardType(card?.type) === 'cloze' ? clozePlain(card?.front) : card?.front
  return clip(front, 160)
}

/**
 * Cards already in the deck, grouped by the brief source they came from:
 * a note by its id, a transcript chunk by lesson and time. Cards that match no
 * source here (or plain strings) land in `other`.
 * @returns {{ byRef: Map<string, string[]>, other: { text: string, coursePath: string|null }[] }}
 */
export function existingBySource(sources, cards) {
  const byRef = new Map()
  const other = []
  const byNote = new Map(
    (sources || []).filter((source) => source.noteId).map((source) => [source.noteId, source.ref])
  )
  const lessonSources = (sources || []).filter((source) => source.kind === 'lesson')
  for (const card of cards || []) {
    const text = existingText(card)
    if (!text) continue
    const object = card && typeof card === 'object' ? card : null
    let ref = object?.noteId ? byNote.get(object.noteId) : null
    if (!ref && object?.lessonPath) {
      const time = object.timeSec
      ref = lessonSources.find(
        (source) =>
          source.lessonPath === object.lessonPath &&
          (typeof time !== 'number' || (time >= source.start - 5 && time <= source.end + 5))
      )?.ref
    }
    if (ref) {
      if (!byRef.has(ref)) byRef.set(ref, [])
      byRef.get(ref).push(text)
    } else {
      other.push({ text, coursePath: object?.coursePath || null })
    }
  }
  return { byRef, other }
}

function sourceBlock(source, existing = []) {
  const head =
    source.kind === 'note'
      ? `${source.ref} · note the person wrote (priority${source.thin ? ', only a heading' : ''})`
      : source.aroundNote
        ? `${source.ref} · lesson transcript ${formatClock(source.start)}–${formatClock(source.end)}, around note ${source.aroundNote}`
        : `${source.ref} · lesson transcript ${formatClock(source.start)}–${formatClock(source.end)}`
  const lines = [
    head,
    source.course ? `course: ${source.course}` : '',
    source.section ? `section: ${source.section}` : '',
    source.lesson ? `lesson: ${source.lesson}` : '',
    source.kind === 'note' && source.title && source.title !== source.lesson
      ? `title: ${source.title}`
      : '',
    source.text ? `text: ${source.text}` : '',
    source.code ? `code:\n\`\`\`\n${source.code}\n\`\`\`` : '',
    existing.length
      ? [
          'already in the deck:',
          ...existing.slice(0, MAX_EXISTING_PER_SOURCE).map((text) => `  - ${text}`),
          existing.length > MAX_EXISTING_PER_SOURCE
            ? `  - and ${existing.length - MAX_EXISTING_PER_SOURCE} more`
            : ''
        ]
          .filter(Boolean)
          .join('\n')
      : ''
  ]
  if (source.images?.length) {
    lines.push('images:')
    for (const image of source.images) {
      lines.push(
        [
          `  ${image.ref}`,
          image.alt ? `label "${image.alt}"` : '',
          image.near ? `after "${image.near}"` : '',
          !image.near && image.next ? `before "${image.next}"` : ''
        ]
          .filter(Boolean)
          .join(' · ')
      )
    }
  }
  return lines.filter(Boolean).join('\n')
}

/**
 * Split sources into parts that each fit `budget` characters, in order.
 * A source bigger than the budget gets a part of its own.
 * @returns {string[][]} refs per part
 */
export function planParts(sources, budget = PART_BUDGET) {
  const parts = []
  let current = []
  let size = 0
  for (const source of sources || []) {
    const cost = sourceBlock(source).length + 2
    if (current.length && size + cost > budget) {
      parts.push(current)
      current = []
      size = 0
    }
    current.push(source.ref)
    size += cost
  }
  if (current.length) parts.push(current)
  return parts
}

export function allowedTypes(types) {
  const list = (Array.isArray(types) ? types : []).map((type) => String(type).toLowerCase())
  const unique = CARD_TYPES.filter((type) => list.includes(type))
  return unique.length ? unique : ['basic']
}

/**
 * How to turn a code block into cards: one card that asks for the whole thing,
 * and cards that each ask about one part of it with the rest in view.
 */
function codeRules(allowed) {
  return [
    'Some notes include code. Code goes on a card inside a ``` block, exactly as written, line by line (use \\n in the JSON string). Do not paraphrase code into prose.',
    allowed.includes('basic')
      ? '- Whole code: for each code block, one basic card whose front says what the code does or when to use it (not how), and whose back is the complete code block. The person writes it from memory.'
      : '',
    allowed.includes('cloze')
      ? '- Parts of the code: one cloze card whose "text" is the complete code block, with each part that carries the idea blanked as its own number: {{c1::…}}, {{c2::…}}, up to 5. Each number becomes a card that shows the rest of the code. Blank an operator, a function call, an argument or a value that matters (like "time % loopTime" or "t - loopTime"), never a whole line, a comment or a name you could guess. Put what that part does in "extra".'
      : '',
    allowed.includes('basic')
      ? '- Why a part: a basic card whose front shows the complete code block and asks about one part of it, quoted in `backticks` (like "Why is the second wiggle given `t - loopTime`?"). The back answers for that part only.'
      : '',
    allowed.includes('typein')
      ? '- Exact names: a typein card for a function or method name the code needs (like "wiggle" or "linear").'
      : ''
  ].filter(Boolean)
}

function exampleFor({ goalText, mode, types, firstRef }) {
  const ref = firstRef || 'S1'
  if (mode === 'concepts') {
    return {
      ...(goalText ? { goal: goalText } : {}),
      concepts: [{ name: EXAMPLE_CONCEPT, sources: [ref], why: 'Why it is worth a card.' }]
    }
  }
  const cards = []
  const nonCloze = types.find((type) => type !== 'cloze')
  if (nonCloze) {
    cards.push({ source: ref, type: nonCloze, front: EXAMPLE_FRONT, back: EXAMPLE_BACK })
  }
  if (types.includes('cloze')) cards.push({ source: ref, type: 'cloze', text: EXAMPLE_CLOZE })
  return { ...(goalText ? { goal: goalText } : {}), title: EXAMPLE_TITLE, cards }
}

/**
 * Plain-text brief for one part.
 * @param {object} options
 * @param {object[]} options.sources every numbered source of the brief
 * @param {string[]} [options.refs] refs in this part (default: all)
 * @param {number} [options.part] 1-based part number
 * @param {number} [options.parts] part count
 * @param {'cards'|'concepts'} [options.mode]
 * @param {{ name: string, sources: string[] }[]} [options.concepts] concepts to cover
 * @param {(object|string)[]} [options.existing] cards already in the deck (or their fronts)
 * @param {string} [options.outline] course outline for context
 * @param {number} [options.perSource] cards to aim for per source (0: no target)
 */
export function buildFlashcardBrief({
  sources = [],
  refs = null,
  part = 1,
  parts = 1,
  goal = '',
  types = ['basic'],
  mode = 'cards',
  concepts = [],
  existing = [],
  outline = '',
  perSource = 0
} = {}) {
  const goalText = clip(goal, MAX_GOAL)
  const allowed = allowedTypes(types)
  const wanted = refs ? new Set(refs) : null
  const list = sources.filter((source) => !wanted || wanted.has(source.ref))
  const hasLessons = list.some((source) => source.kind === 'lesson')
  const known =
    mode === 'cards' ? existingBySource(sources, existing) : { byRef: new Map(), other: [] }
  const partCourses = new Set(list.map((source) => source.coursePath).filter(Boolean))
  const otherCards = known.other.filter(
    (card) => !card.coursePath || partCourses.has(card.coursePath)
  )
  const hasNotes = list.some((source) => source.kind === 'note')
  const partLine =
    parts > 1
      ? `This is part ${part} of ${parts}. Only use the sources listed in this part. The other parts come in separate messages.`
      : ''

  const intro =
    mode === 'concepts'
      ? 'You are listing the key concepts in study material, so flashcards can be written for them later. Reply with ONLY JSON (no intro). I will paste it back into the course library.'
      : 'You are making flashcards from study material. Reply with ONLY JSON (no intro). I will paste it back into the course library.'

  const rules = [
    'The sources below are the only facts. Do not invent a fact that is not in the source you cite. Copy each source ref exactly (like "S3").',
    hasNotes && hasLessons
      ? 'Notes marked "priority" are what the person chose to write down; cover them first. Transcripts give the rest of what the lesson says.'
      : '',
    hasLessons
      ? 'Transcripts are automatic subtitles: ignore greetings, filler and promotions. Clock marks like [12:30] show when something is said.'
      : ''
  ]

  const task =
    mode === 'concepts'
      ? [
          `List up to ${MAX_CONCEPTS} concepts worth remembering: ideas, techniques, terms, steps, rules of thumb. Skip trivia and anything the person would not need later.`,
          'Each concept has "name" (a few words), "sources" (the refs where it is explained) and "why" (one short line on why it matters).',
          'Order them as they appear in the material. Write them in the language of the goal. If there is no goal, use the language of the sources.'
        ]
      : [
          concepts.length
            ? 'Write cards that cover the concepts below. Each concept gets at least one card. Skip anything outside these concepts.'
            : 'Write one deck. Each card is one thing worth remembering from one source. Cover every source that has something to remember; skip filler. Do not return a sample of the cards. Do not stop after the first sources.',
          perSource > 0 ? `Aim for about ${perSource} cards per source with real content.` : '',
          `Card types you may use: ${allowed.join(', ')}. Pick the type that fits each fact; default to ${allowed.includes('basic') ? 'basic' : allowed[0]}.`,
          ...allowed.map((type) => `- ${TYPE_GUIDE[type]}`),
          'Every card has "source" (one ref) and "type".',
          list.some((source) => known.byRef.has(source.ref))
            ? 'Some sources list cards the deck already has ("already in the deck"). Do not repeat them, even reworded. Write cards only for what those cards miss. A source whose ideas are already covered gets no new cards.'
            : '',
          'Each card must make sense on its own, months later, with no notes in front of the person. Ask about the idea itself, never about the material: do not write "this note", "the source", "the transcript", "noted as", "mentioned in" or "according to". Write facts as facts ("Shape layers make good controllers because…"), not as what someone said.',
          'Skip a source that is too vague to make a card someone could answer from memory. A note marked "only a heading" is a pointer: use it only if another source in this brief explains the same thing, and then cite that source.',
          ...(list.some((source) => source.code) ? codeRules(allowed) : []),
          hasLessons
            ? 'For a transcript source, add "at" with the clock (like "12:34") where the fact is said.'
            : '',
          list.some((source) => source.images?.length)
            ? 'Some notes list images (screenshots the person took). You cannot see them; you only get a label and nearby words. A card from such a note gets its first image unless you pick another with "image" (like "img2") or write "image": "none" when no image fits.'
            : '',
          'Write the cards in the language of the goal. If there is no goal, use the language of the sources.'
        ]

  const conceptBlock = concepts.length
    ? [
        'Concepts to cover:',
        ...concepts.map(
          (concept) =>
            `- ${concept.name}${concept.sources?.length ? ` (${concept.sources.join(', ')})` : ''}`
        )
      ].join('\n')
    : ''

  const existingBlock = otherCards.length
    ? [
        'The deck also has these cards. Do not repeat them:',
        ...otherCards.slice(0, MAX_EXISTING).map((card) => `- ${card.text}`)
      ].join('\n')
    : ''

  return [
    intro,
    partLine,
    rules.filter(Boolean).join('\n'),
    goalText ? `Goal: ${goalText}` : '',
    outline ? `Course outline (context only, not a source):\n${outline}` : '',
    conceptBlock,
    existingBlock,
    `Sources (${list.length}):`,
    list.map((source) => sourceBlock(source, known.byRef.get(source.ref))).join('\n\n'),
    task.filter(Boolean).join('\n'),
    goalText ? 'Copy the goal exactly into "goal".' : '',
    JSON.stringify(exampleFor({ goalText, mode, types: allowed, firstRef: list[0]?.ref }), null, 2)
  ]
    .filter(Boolean)
    .join('\n\n')
}

function isExampleCard(row) {
  return (
    (fact(row?.front) === EXAMPLE_FRONT && fact(row?.back) === EXAMPLE_BACK) ||
    fact(row?.text) === EXAMPLE_CLOZE
  )
}

function checkGoal(value, goal) {
  const expected = fact(goal)
  const named = fact(value.goal)
  // Chats often drop "goal"; the source refs already tie a reply to its brief.
  // Only a reply that names a different goal is refused.
  if (expected && named && goalKey(named) !== goalKey(expected)) return GOAL_MISMATCH
  return ''
}

function readReply(text) {
  if (!fact(text)) return null
  const value = extractJsonValue(text)
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

function findSource(row, byRef, byNote) {
  const ref = fact(row.source || row.ref).toUpperCase()
  if (ref && byRef.has(ref)) return byRef.get(ref)
  const noteId = fact(row.note || row.noteId)
  if (noteId && byNote.has(noteId)) return byNote.get(noteId)
  return null
}

function cardTime(row, source) {
  if (source.kind !== 'lesson') return source.timeSec ?? null
  const at = parseClock(row.at)
  if (at == null || at < source.start - 10 || at > source.end + 10) return Math.floor(source.start)
  return at
}

/**
 * Parse one reply into cards whose sources are in `sources`.
 * `existing` holds card keys already in the deck or already pasted, to skip repeats.
 * A broken reply writes nothing. Rows that do not fit come back in `skips`.
 */
export function parseFlashcardBrief(
  text,
  sources,
  { goal = '', types = CARD_TYPES, existing = [] } = {}
) {
  const value = readReply(text)
  if (!value) return { ok: false, error: NOT_JSON, deck: null, skips: [] }
  const goalError = checkGoal(value, goal)
  if (goalError) return { ok: false, error: goalError, deck: null, skips: [] }

  const rows = Array.isArray(value.cards) ? value.cards : null
  if (!rows) return { ok: false, error: NO_CARDS, deck: null, skips: [] }

  const allowed = new Set(allowedTypes(types))
  const byRef = new Map(sources.map((source) => [source.ref, source]))
  const byNote = new Map(
    sources.filter((source) => source.noteId).map((source) => [source.noteId, source])
  )
  const old = new Set(existing)
  const seen = new Set()
  const skips = []
  const cards = []
  let sawExample = false

  for (const row of rows) {
    if (cards.length >= MAX_CARDS) {
      skips.push({ title: fact(row?.front || row?.text) || 'Tarjeta', reason: SKIP_CARD_CAP })
      continue
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      skips.push({ title: 'Tarjeta', reason: SKIP_NOT_OBJECT })
      continue
    }
    if (isExampleCard(row)) {
      sawExample = true
      continue
    }
    const source = findSource(row, byRef, byNote)
    const label = fact(row.front || row.text) || fact(row.source) || 'Tarjeta'
    if (!source) {
      skips.push({ title: label, reason: SKIP_NO_MATCH })
      continue
    }
    const type = row.type ? cardType(row.type) : row.text && !row.front ? 'cloze' : 'basic'
    if (!allowed.has(type)) {
      skips.push({ title: label, reason: SKIP_TYPE })
      continue
    }
    const checked = checkCardFields({
      type,
      front: type === 'cloze' ? cardField(row.text || row.front, 420) : cardField(row.front, 220),
      back: type === 'cloze' ? cardField(row.extra || row.back, 420) : cardField(row.back, 420)
    })
    if (!checked.ok) {
      skips.push({ title: label, reason: checked.error })
      continue
    }
    const asked =
      type === 'cloze' ? checked.card.front : `${checked.card.front} ${checked.card.back}`
    if (META_RE.test(asked)) {
      skips.push({ title: label, reason: SKIP_META })
      continue
    }
    const key = cardKey(checked.card)
    if (old.has(key)) {
      skips.push({ title: label, reason: SKIP_EXISTING })
      continue
    }
    if (seen.has(key)) {
      skips.push({ title: label, reason: SKIP_DUPLICATE })
      continue
    }
    seen.add(key)
    const imageRef = fact(row.image).toLowerCase()
    const noImage = /^(none|no|null|false|-)$/.test(imageRef) || row.image === null
    const picked =
      imageRef && !noImage ? source.images?.find((item) => item.ref === imageRef) : null
    const image = noImage ? null : picked || source.images?.[0] || null
    const timeSec = cardTime(row, source)
    cards.push({
      ...checked.card,
      sourceRef: source.ref,
      noteId: source.noteId || null,
      coursePath: source.coursePath || null,
      lessonPath: source.lessonPath || null,
      lesson: source.lesson || '',
      timeSec,
      source: sourceLabel(source, timeSec),
      image: image ? { file: image.file, alt: image.alt } : null,
      imageAuto: Boolean(image && !picked),
      support: sourceSupport(checked.card, [source.text, source.code].filter(Boolean).join(' '))
    })
  }

  if (!cards.length) {
    return { ok: false, error: sawExample ? EXAMPLE_ONLY : NO_CARDS, deck: null, skips }
  }
  const titleText = usable(value.title, MAX_TITLE)
  return {
    ok: true,
    error: '',
    deck: { title: titleText && titleText !== EXAMPLE_TITLE ? titleText : '', cards },
    skips
  }
}

/**
 * Parse a concepts reply. Concepts keep only refs that exist; repeats by name
 * (also against `existing` names) are dropped.
 */
export function parseConceptReply(text, sources, { goal = '', existing = [] } = {}) {
  const value = readReply(text)
  if (!value) return { ok: false, error: NOT_JSON, concepts: [] }
  const goalError = checkGoal(value, goal)
  if (goalError) return { ok: false, error: goalError, concepts: [] }
  const rows = Array.isArray(value.concepts) ? value.concepts : []
  const refs = new Set(sources.map((source) => source.ref))
  const seen = new Set(existing.map((name) => fact(name).toLowerCase()))
  const concepts = []
  for (const row of rows) {
    if (concepts.length >= MAX_CONCEPTS) break
    const name = usable(row?.name, MAX_CONCEPT_NAME)
    if (!name || name === EXAMPLE_CONCEPT) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    const cited = (Array.isArray(row.sources) ? row.sources : [row.sources])
      .map((ref) => fact(ref).toUpperCase())
      .filter((ref) => refs.has(ref))
    if (!cited.length) continue
    seen.add(key)
    concepts.push({ name, sources: [...new Set(cited)], why: usable(row.why, 200) })
  }
  if (!concepts.length) return { ok: false, error: NO_CONCEPTS, concepts: [] }
  return { ok: true, error: '', concepts }
}

/** Sources with no card yet, for the coverage line in the review. */
export function uncoveredSources(sources, cards) {
  const used = new Set((cards || []).map((card) => card.sourceRef))
  return (sources || []).filter((source) => !used.has(source.ref))
}
