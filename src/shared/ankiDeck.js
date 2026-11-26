/**
 * Turn a saved deck into Anki notes: for AnkiConnect sync and for a text file
 * that Anki's importer reads. Pure functions; the main process does the I/O.
 *
 * Each card type has its own note type. New types are added as new note types
 * instead of changing an existing one, because editing a note type's fields or
 * templates forces a full sync with AnkiWeb.
 */

import { cardType, textSegments } from './flashcardCards.js'

export const ANKI_PARENT_DECK = 'Cursos'
export const ANKI_TAG = 'course-library'
export const ANKI_TAG_ROOT = 'pcl'
export const ANKI_DEFAULT_URL = 'http://localhost:8765'

export const ANKI_CSS = `.card {
  font-family: system-ui, sans-serif;
  font-size: 22px;
  line-height: 1.4;
  text-align: center;
  color: #1a1423;
  background: #fffaf3;
}
.nightMode .card, .card.nightMode { color: #f4eee6; background: #1f1a26; }
.image img { max-width: 100%; max-height: 60vh; margin-top: 12px; border-radius: 8px; }
.source { margin-top: 18px; font-size: 13px; opacity: 0.6; }
.extra { margin-top: 14px; font-size: 18px; opacity: 0.85; }
.cloze { font-weight: bold; color: #c2365e; }
.nightMode .cloze { color: #ff8fab; }
input#typeans { font-size: 20px; }`

const IMAGE = '{{#Image}}<div class="image">{{Image}}</div>{{/Image}}'
const SOURCE = '{{#Source}}<div class="source">{{Source}}</div>{{/Source}}'
const PLAIN_FIELDS = ['Front', 'Back', 'Image', 'Source', 'SourceId']

/** The note type for each card type. `basic` keeps the name it shipped with. */
export const ANKI_MODELS = {
  basic: {
    name: 'Course Library Card',
    fields: PLAIN_FIELDS,
    isCloze: false,
    templates: [
      {
        Name: 'Pregunta',
        Front: '{{Front}}',
        Back: `{{FrontSide}}<hr id="answer">{{Back}}${IMAGE}${SOURCE}`
      }
    ]
  },
  reverse: {
    name: 'Course Library Reverse',
    fields: PLAIN_FIELDS,
    isCloze: false,
    templates: [
      {
        Name: 'Término',
        Front: '{{Front}}',
        Back: `{{FrontSide}}<hr id="answer">{{Back}}${IMAGE}${SOURCE}`
      },
      {
        Name: 'Definición',
        Front: '{{Back}}',
        Back: `{{FrontSide}}<hr id="answer">{{Front}}${IMAGE}${SOURCE}`
      }
    ]
  },
  typein: {
    name: 'Course Library Type-in',
    fields: PLAIN_FIELDS,
    isCloze: false,
    templates: [
      {
        Name: 'Escribir',
        Front: '{{Front}}<br><br>{{type:Back}}',
        Back: `{{Front}}<hr id="answer">{{type:Back}}${IMAGE}${SOURCE}`
      }
    ]
  },
  cloze: {
    name: 'Course Library Cloze',
    fields: ['Text', 'Extra', 'Image', 'Source', 'SourceId'],
    isCloze: true,
    templates: [
      {
        Name: 'Huecos',
        Front: '{{cloze:Text}}',
        Back: `{{cloze:Text}}{{#Extra}}<div class="extra">{{Extra}}</div>{{/Extra}}${IMAGE}${SOURCE}`
      }
    ]
  }
}

export const ANKI_MODEL_NAMES = Object.values(ANKI_MODELS).map((model) => model.name)

/** Stock note types used by the text file, so it imports into any Anki. */
const STOCK_NOTETYPES = {
  basic: 'Basic',
  reverse: 'Basic (and reversed card)',
  typein: 'Basic (type in the answer)',
  cloze: 'Cloze'
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Inline styles: note types already in Anki are never edited, so their CSS stays as shipped.
const PRE_STYLE =
  'text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;line-height:1.5;padding:10px 12px;border-radius:8px;background:rgba(127,127,127,0.12);overflow-x:auto;white-space:pre'
const CODE_STYLE =
  'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.9em;padding:0 0.25em;border-radius:4px;background:rgba(127,127,127,0.15)'

/**
 * Card text as Anki HTML: escaped, ``` blocks as <pre> and `inline code` as <code>.
 * Line breaks become <br> so the text file import keeps one note per line.
 * Cloze markers pass through, so a blank can sit inside the code.
 */
export function ankiHtml(text) {
  return textSegments(text)
    .map((part) => {
      const html = escapeHtml(part.text).replace(/\r?\n/g, '<br>')
      if (part.code) return `<pre style="${PRE_STYLE}"><code>${html}</code></pre>`
      return html.replace(/`([^`<]+)`/g, `<code style="${CODE_STYLE}">$1</code>`)
    })
    .join('')
}

/** Deck title as an Anki sub-deck. `::` would nest further, so it is flattened. */
export function ankiDeckName(title, parent = ANKI_PARENT_DECK) {
  const own =
    String(title || '')
      .replace(/::+/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim() || 'Tarjetas'
  const root = String(parent || '').trim()
  return root ? `${root}::${own}` : own
}

/** File name in Anki's media folder. The prefix keeps ours apart from other decks. */
export function ankiMediaName(file) {
  return `pcl-${String(file || '').replace(/[^a-z0-9.-]/gi, '')}`
}

/** One tag segment: no spaces, no accents, no `::`. */
export function ankiTag(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function courseName(coursePath) {
  return (
    String(coursePath || '')
      .split(/[/\\]/)
      .filter(Boolean)
      .pop() || ''
  )
}

/** `pcl::<course>::<lesson>`, so Anki can filter by course or lesson. */
export function ankiTagsForCard(card) {
  const course = ankiTag(courseName(card?.coursePath))
  const lesson = ankiTag(card?.lesson)
  const nested = course
    ? [ANKI_TAG_ROOT, course, lesson].filter(Boolean).join('::')
    : lesson
      ? `${ANKI_TAG_ROOT}::${lesson}`
      : ''
  return [ANKI_TAG, nested].filter(Boolean)
}

/** Tags this app wrote before, in any format. Others belong to the person. */
export function isOwnAnkiTag(tag) {
  const value = String(tag || '').toLowerCase()
  return value === ANKI_TAG || value.startsWith(`${ANKI_TAG_ROOT}::`)
}

/**
 * Keep the person's own tags, replace ours. Flat course tags from the first
 * version (one segment, the course slug) are replaced too.
 */
export function mergeAnkiTags(current, ours, legacy = []) {
  const drop = new Set(legacy.map((tag) => String(tag).toLowerCase()))
  const kept = (current || []).filter(
    (tag) => !isOwnAnkiTag(tag) && !drop.has(String(tag).toLowerCase())
  )
  return [...new Set([...kept, ...ours])]
}

/**
 * One Anki note per card. `SourceId` is our card id, so a second sync updates
 * the same note and keeps its review history.
 */
export function ankiNotesForDeck(deck, { parent = ANKI_PARENT_DECK } = {}) {
  const deckName = ankiDeckName(deck?.title, parent)
  return (deck?.cards || [])
    .filter((card) => card?.id && card.front && (card.back || cardType(card.type) === 'cloze'))
    .map((card) => {
      const type = cardType(card.type)
      const model = ANKI_MODELS[type]
      const media = card.image?.file ? ankiMediaName(card.image.file) : ''
      const image = media
        ? `<img src="${escapeHtml(media)}" alt="${escapeHtml(card.image.alt)}">`
        : ''
      const source = escapeHtml(card.source || courseName(card.coursePath))
      const fields =
        type === 'cloze'
          ? {
              Text: ankiHtml(card.front),
              Extra: ankiHtml(card.back),
              Image: image,
              Source: source,
              SourceId: escapeHtml(card.id)
            }
          : {
              Front: ankiHtml(card.front),
              // Type-in compares what was typed with this field: keep it plain.
              Back: type === 'typein' ? escapeHtml(card.back) : ankiHtml(card.back),
              Image: image,
              Source: source,
              SourceId: escapeHtml(card.id)
            }
      return {
        cardId: card.id,
        type,
        modelName: model.name,
        deckName,
        tags: ankiTagsForCard(card),
        legacyTags: [ankiTag(courseName(card.coursePath))].filter(Boolean),
        media: media ? { file: card.image.file, name: media } : null,
        fields
      }
    })
}

function tsvCell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ')
}

/**
 * Text file for File → Import in Anki. Uses Anki's stock note types so it works
 * on a fresh Anki, with the image and source folded into the second field.
 * Images are not inside the file; they go to Anki's collection.media folder.
 */
export function ankiTextExport(deck, { parent = ANKI_PARENT_DECK } = {}) {
  const notes = ankiNotesForDeck(deck, { parent })
  const header = [
    '#separator:tab',
    '#html:true',
    `#deck:${ankiDeckName(deck?.title, parent)}`,
    '#guid column:1',
    '#notetype column:2',
    '#tags column:5'
  ]
  const rows = notes.map((note) => {
    const first = note.type === 'cloze' ? note.fields.Text : note.fields.Front
    const second = [
      note.type === 'cloze' ? note.fields.Extra : note.fields.Back,
      note.fields.Image ? `<div>${note.fields.Image}</div>` : '',
      note.fields.Source ? `<div><small>${note.fields.Source}</small></div>` : ''
    ].join('')
    return [`pcl-${note.cardId}`, STOCK_NOTETYPES[note.type], first, second, note.tags.join(' ')]
      .map(tsvCell)
      .join('\t')
  })
  return {
    text: `${[...header, ...rows].join('\n')}\n`,
    media: notes.map((note) => note.media).filter(Boolean)
  }
}

/** Anki search that finds our notes for these card ids, in any of our note types. */
export function ankiSourceQuery(cardIds) {
  const ids = (cardIds || []).filter(Boolean)
  if (!ids.length) return ''
  const models = ANKI_MODEL_NAMES.map((name) => `"note:${name}"`).join(' or ')
  const terms = ids.map((id) => `"SourceId:${String(id).replace(/["\\]/g, '')}"`).join(' or ')
  return `(${models}) (${terms})`
}
