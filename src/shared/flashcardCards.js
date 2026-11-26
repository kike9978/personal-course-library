/**
 * Card types and the checks every layer shares: the reply parser, the store,
 * the study view and the Anki mapping.
 *
 * basic   front question, back answer
 * reverse front term, back definition; studied both ways
 * typein  front question, back a short exact answer the person types
 * cloze   front is text with {{c1::blanks}}, back is optional extra context
 */

export const CARD_TYPES = ['basic', 'reverse', 'typein', 'cloze']

export const CARD_TYPE_LABELS = {
  basic: 'Pregunta',
  reverse: 'Doble sentido',
  typein: 'Escribir',
  cloze: 'Huecos'
}

export const MAX_FRONT = 220
export const MAX_BACK = 420
export const MAX_CLOZE = 420
export const MAX_TYPEIN = 60
/** A field that holds a ``` code block may be longer: the whole expression has to fit. */
export const MAX_CODE_FIELD = 1500

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g
const STRAY_OPEN_RE = /\{\{c\d+::/
const FENCE_RE = /```([^\n`]*)\n?([\s\S]*?)(?:\n?```|$)/g

/** True when the text holds a ``` code block. */
export function hasCode(text) {
  return String(text || '').includes('```')
}

/**
 * Text split into prose and ``` code blocks, in order.
 * Code keeps its line breaks; an unclosed fence runs to the end.
 * @returns {{ code: boolean, text: string, lang?: string }[]}
 */
export function textSegments(text) {
  const source = String(text || '')
  const parts = []
  let last = 0
  for (const match of source.matchAll(FENCE_RE)) {
    if (match.index > last) parts.push({ code: false, text: source.slice(last, match.index) })
    parts.push({ code: true, lang: match[1].trim(), text: match[2] })
    last = match.index + match[0].length
  }
  if (last < source.length) parts.push({ code: false, text: source.slice(last) })
  return parts
}

/**
 * Card text cleaned for storage. Prose collapses to single spaces; code inside
 * ``` keeps its lines exactly, minus trailing spaces and blank edges.
 */
export function cleanCardText(text) {
  return textSegments(text)
    .map((part) => {
      if (!part.code) return part.text.replace(/\s+/g, ' ').trim()
      const code = part.text
        .split('\n')
        .map((line) => line.replace(/\s+$/, ''))
        .join('\n')
        .replace(/^\n+|\n+$/g, '')
      return code ? `\`\`\`${part.lang || ''}\n${code}\n\`\`\`` : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function cardType(value) {
  const type = String(value || '')
    .trim()
    .toLowerCase()
  return CARD_TYPES.includes(type) ? type : 'basic'
}

/** Numbers used in a cloze text, in order, without repeats. */
export function clozeNumbers(text) {
  const found = []
  for (const match of String(text || '').matchAll(CLOZE_RE)) {
    const n = Number(match[1])
    if (n > 0 && !found.includes(n)) found.push(n)
  }
  return found
}

export function hasCloze(text) {
  return clozeNumbers(text).length > 0
}

/** True when the cloze markup is broken: an opener or closer left over. */
export function brokenCloze(text) {
  const rest = String(text || '').replace(CLOZE_RE, '')
  if (STRAY_OPEN_RE.test(rest)) return true
  // Code may close its own braces with }}; only prose counts as a stray closer.
  return textSegments(rest).some((part) => !part.code && part.text.includes('}}'))
}

/**
 * Cloze text split into parts for display.
 * `hide`: 'all' hides every blank, a number hides that blank only, null shows all.
 * @returns {{ text: string, blank?: boolean, hint?: string, n?: number }[]}
 */
export function clozeParts(text, hide = 'all') {
  const source = String(text || '')
  const parts = []
  let last = 0
  for (const match of source.matchAll(CLOZE_RE)) {
    if (match.index > last) parts.push({ text: source.slice(last, match.index) })
    const n = Number(match[1])
    const hidden = hide === 'all' || hide === n
    parts.push({ text: match[2], blank: hidden, hint: match[3] || '', n, answer: true })
    last = match.index + match[0].length
  }
  if (last < source.length) parts.push({ text: source.slice(last) })
  return parts
}

/** Cloze text with the markers removed: the full sentence. */
export function clozePlain(text) {
  return String(text || '').replace(CLOZE_RE, (_, __, answer) => answer)
}

/**
 * Check a card's fields for its type. Returns the cleaned card or an error.
 * @returns {{ ok: true, card: object } | { ok: false, error: string }}
 */
export function checkCardFields(input = {}) {
  const type = cardType(input.type)
  const front = String(input.front ?? '').trim()
  const back = String(input.back ?? '').trim()
  const cap = (text, max) => (hasCode(text) ? MAX_CODE_FIELD : max)
  if (type === 'cloze') {
    if (!front) return { ok: false, error: 'Falta el texto con huecos.' }
    if (front.length > cap(front, MAX_CLOZE)) {
      return { ok: false, error: 'El texto con huecos es muy largo.' }
    }
    if (!hasCloze(front)) return { ok: false, error: 'No tiene huecos {{c1::…}}.' }
    if (brokenCloze(front)) return { ok: false, error: 'Un hueco {{c1::…}} está mal cerrado.' }
    return { ok: true, card: { type, front, back: back.slice(0, cap(back, MAX_BACK)) } }
  }
  if (!front || !back) return { ok: false, error: 'Le falta la pregunta o la respuesta.' }
  if (front.length > cap(front, MAX_FRONT)) return { ok: false, error: 'La pregunta es muy larga.' }
  if (back.length > cap(back, MAX_BACK)) return { ok: false, error: 'La respuesta es muy larga.' }
  if (type === 'typein' && back.length > MAX_TYPEIN) {
    return { ok: false, error: 'Para escribir, la respuesta debe ser corta.' }
  }
  return { ok: true, card: { type, front, back } }
}

/** What the person has to recall: the answer side, or the blanks of a cloze. */
export function cardAnswerText(card) {
  if (cardType(card?.type) === 'cloze') {
    return clozeParts(card.front, null)
      .filter((part) => part.answer)
      .map((part) => part.text)
      .concat(card.back ? [card.back] : [])
      .join(' ')
  }
  return String(card?.back || '')
}

/** Key for spotting the same card twice. */
export function cardKey(card) {
  const type = cardType(card?.type)
  let text = type === 'cloze' ? clozePlain(card?.front) : card?.front
  // The same code can hold several cloze cards, each blanking a different part.
  if (type === 'cloze' && hasCode(card?.front)) {
    const blanks = clozeParts(card.front, null).filter((part) => part.answer)
    text = `${text} ${blanks.map((part) => `${part.n} ${part.text}`).join(' ')}`
  }
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** "12:34" or "1:02:03" → seconds. Null when it is not a clock. */
export function parseClock(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const [, h, m, s] = match
  if (Number(s) > 59) return null
  return Number(h || 0) * 3600 + Number(m) * 60 + Number(s)
}

export function formatClock(sec) {
  const total = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

const STOP = new Set(
  (
    'that this with from have will your about which there their they them then than when what where ' +
    'como para pero porque cuando donde desde hasta sobre entre este esta estos estas ese esa esos esas ' +
    'tiene tienen puede pueden hace hacen todo toda todos todas solo cada otro otra otros otras muy mas ' +
    'también tambien sin con los las del una unos unas que qué'
  ).split(' ')
)

function words(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word))
}

/**
 * Share of the answer's words that appear in the source text, 0..1.
 * Null when the answer is too short to judge or there is no source text.
 * A low share is a hint to check the card, not proof it is wrong.
 */
export function sourceSupport(card, sourceText) {
  const answer = [...new Set(words(cardAnswerText(card)))]
  const source = String(sourceText || '')
  if (answer.length < 3 || !source.trim()) return null
  const pool = new Set(words(source))
  const stem = (word) => word.slice(0, 5)
  const stems = new Set([...pool].map(stem))
  const found = answer.filter((word) => pool.has(word) || stems.has(stem(word))).length
  return found / answer.length
}

export const WEAK_SUPPORT = 0.4
