/**
 * A flashcard deck as a Notion page: one toggle per card, the question as the
 * toggle title and the answer inside. One way only: the app owns the cards and
 * every push rewrites the page.
 */

import { cardType, clozeParts, textSegments } from './flashcardCards.js'
import { wireHash } from './notionSync.js'

const RICH_LIMIT = 1900
const TOGGLE_TITLE_MAX = 1900

export const DECK_ICON = '🗂️'

function textItems(text, annotations = null) {
  const value = String(text || '')
  const items = []
  for (let index = 0; index < value.length; index += RICH_LIMIT) {
    items.push({
      type: 'text',
      text: { content: value.slice(index, index + RICH_LIMIT) },
      ...(annotations ? { annotations } : {})
    })
  }
  return items
}

function inlineCode(text, annotations = {}) {
  // `code` in prose becomes Notion inline code; the rest stays plain.
  const out = []
  for (const piece of String(text || '').split(/(`[^`\n]+`)/)) {
    if (!piece) continue
    const code = /^`[^`\n]+`$/.test(piece)
    out.push(
      ...textItems(code ? piece.slice(1, -1) : piece, {
        ...annotations,
        ...(code ? { code: true } : {})
      })
    )
  }
  return out
}

function paragraph(richText, color = null) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: richText, ...(color ? { color } : {}) }
  }
}

const CODE_LANGUAGES = new Set([
  'javascript',
  'python',
  'typescript',
  'json',
  'bash',
  'shell',
  'css',
  'html'
])

/** Notion only takes languages from its own list; expressions are JavaScript. */
function codeBlock(text, lang) {
  const wanted = String(lang || '').toLowerCase()
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: textItems(text),
      language: CODE_LANGUAGES.has(wanted) ? wanted : 'javascript'
    }
  }
}

/** Prose and ``` code of a card side, as blocks. */
function sideBlocks(text, { cloze = null } = {}) {
  const blocks = []
  for (const segment of textSegments(text)) {
    if (segment.code) {
      const plain = cloze
        ? clozeRich(segment.text, cloze)
            .map((item) => item.text.content)
            .join('')
        : segment.text
      if (plain.trim()) blocks.push(codeBlock(plain, segment.lang))
      continue
    }
    const prose = segment.text.replace(/\s+/g, ' ').trim()
    if (!prose) continue
    blocks.push(paragraph(cloze ? clozeRich(prose, cloze) : inlineCode(prose)))
  }
  return blocks
}

/** Cloze text as rich text: blanks hidden ("[…]") or answers in bold. */
function clozeRich(text, mode) {
  const out = []
  for (const part of clozeParts(text, mode === 'hide' ? 'all' : null)) {
    if (!part.answer) out.push(...textItems(part.text))
    else if (part.blank)
      out.push(...textItems(part.hint ? `[${part.hint}]` : '[…]', { bold: true }))
    else out.push(...textItems(part.text, { bold: true, color: 'red' }))
  }
  return out
}

/** The toggle title: the question's prose, without its code block. */
function toggleTitle(card) {
  const type = cardType(card.type)
  const prose = textSegments(card.front)
    .filter((segment) => !segment.code)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const hasCodeInFront = textSegments(card.front).some((segment) => segment.code)
  const title = prose || (hasCodeInFront ? 'Código' : 'Tarjeta')
  if (type === 'cloze') return clozeRich(title.slice(0, TOGGLE_TITLE_MAX), 'hide')
  const prefix = type === 'reverse' ? '↔ ' : ''
  return inlineCode(`${prefix}${title}`.slice(0, TOGGLE_TITLE_MAX))
}

function imageBlock(card, uploads) {
  const id = card.image?.file ? uploads.get(card.image.file) : null
  if (!id) return null
  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'file_upload',
      file_upload: { id },
      ...(card.image.alt ? { caption: textItems(card.image.alt) } : {})
    }
  }
}

function cardBlock(card, uploads) {
  const type = cardType(card.type)
  const children = []
  // Code that belongs to the question goes first, inside the toggle.
  if (type !== 'cloze') {
    for (const segment of textSegments(card.front)) {
      if (segment.code && segment.text.trim()) children.push(codeBlock(segment.text, segment.lang))
    }
  }
  if (type === 'cloze') {
    children.push(...sideBlocks(card.front, { cloze: 'show' }))
    if (card.back) children.push(...sideBlocks(card.back))
  } else {
    if (children.length) children.push({ object: 'block', type: 'divider', divider: {} })
    children.push(...sideBlocks(card.back))
  }
  const image = imageBlock(card, uploads)
  if (image) children.push(image)
  if (card.source) children.push(paragraph(textItems(card.source, { italic: true }), 'gray'))
  return {
    object: 'block',
    type: 'toggle',
    toggle: { rich_text: toggleTitle(card), children: children.slice(0, 90) }
  }
}

/**
 * Page content for a deck. `uploads` maps an image file name to a Notion file
 * upload id; cards whose image did not upload go without it.
 */
export function deckBlocks(deck, uploads = new Map()) {
  const cards = deck?.cards || []
  const intro = {
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '🔁' },
      color: 'gray_background',
      rich_text: textItems(
        `${cards.length === 1 ? '1 tarjeta' : `${cards.length} tarjetas`}. Este mazo se actualiza desde la biblioteca de cursos; lo que cambies aquí se reemplaza en el próximo envío.`
      )
    }
  }
  return [intro, ...cards.map((card) => cardBlock(card, uploads))]
}

/** What decides whether the page needs a new push: title and card content, not study marks. */
export function deckNotionHash(deck) {
  const cards = (deck?.cards || []).map((card) => [
    cardType(card.type),
    card.front || '',
    card.back || '',
    card.image?.file || '',
    card.image?.alt || '',
    card.source || ''
  ])
  return wireHash(String(deck?.title || ''), JSON.stringify(cards))
}

/** Image files a deck page needs, once each. */
export function deckImageFiles(deck) {
  return [...new Set((deck?.cards || []).map((card) => card.image?.file).filter(Boolean))]
}
