/**
 * Push decks to Anki desktop through the AnkiConnect add-on, then ask Anki to
 * sync with AnkiWeb so the cards reach the phone. One way only: Anki owns reviews.
 */

import fs from 'fs'
import path from 'path'
import { app, dialog } from 'electron'
import {
  ANKI_CSS,
  ANKI_DEFAULT_URL,
  ANKI_MODELS,
  ANKI_PARENT_DECK,
  ankiNotesForDeck,
  ankiSourceQuery,
  ankiTextExport,
  mergeAnkiTags
} from '../../shared/ankiDeck.js'
import { getDeck, markDeckAnkiSynced } from './learningStore.js'
import { resolveExistingNoteAttachments } from './noteAttachments.js'

const SETTINGS_FILE = 'anki-settings.json'
const TIMEOUT_MS = 8000
const QUERY_CHUNK = 50

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

export function getAnkiSettings() {
  let saved = {}
  try {
    saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}
  } catch {
    // First run or unreadable file: defaults.
  }
  return {
    url: String(saved.url || '').trim() || ANKI_DEFAULT_URL,
    apiKey: String(saved.apiKey || ''),
    parent: saved.parent == null ? ANKI_PARENT_DECK : String(saved.parent).trim()
  }
}

export function saveAnkiSettings(payload = {}) {
  const current = getAnkiSettings()
  const next = {
    url: payload.url !== undefined ? String(payload.url).trim() : current.url,
    apiKey: payload.apiKey !== undefined ? String(payload.apiKey) : current.apiKey,
    parent: payload.parent !== undefined ? String(payload.parent).trim() : current.parent
  }
  if (next.url && !/^https?:\/\//i.test(next.url)) next.url = `http://${next.url}`
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return getAnkiSettings()
}

class AnkiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

async function ankiRequest(action, params = {}, settings = getAnkiSettings()) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response
  try {
    response = await fetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        version: 6,
        params,
        ...(settings.apiKey ? { key: settings.apiKey } : {})
      }),
      signal: controller.signal
    })
  } catch {
    throw new AnkiError(
      'No se encontró Anki. Ábrelo y revisa que AnkiConnect esté instalado.',
      'OFFLINE'
    )
  } finally {
    clearTimeout(timer)
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw new AnkiError('Anki respondió algo que no es AnkiConnect.', 'BAD_REPLY')
  }
  if (body?.error) {
    const message = String(body.error)
    if (/api key|valid key/i.test(message)) {
      throw new AnkiError('AnkiConnect pide una clave. Escríbela en los ajustes de Anki.', 'KEY')
    }
    throw new AnkiError(`Anki: ${message}`, 'ANKI')
  }
  return body?.result
}

/** Is AnkiConnect answering? Never throws. */
export async function ankiStatus() {
  const settings = getAnkiSettings()
  try {
    const version = await ankiRequest('version', {}, settings)
    return { ok: true, version, url: settings.url }
  } catch (error) {
    return { ok: false, code: error.code || 'ERROR', error: error.message, url: settings.url }
  }
}

/**
 * Create the note types these cards need. An existing note type is never
 * edited: changing fields or templates would force a full sync with AnkiWeb.
 */
async function ensureModels(types, settings) {
  const names = (await ankiRequest('modelNames', {}, settings)) || []
  for (const type of types) {
    const model = ANKI_MODELS[type]
    if (!model || names.includes(model.name)) continue
    await ankiRequest(
      'createModel',
      {
        modelName: model.name,
        inOrderFields: model.fields,
        css: ANKI_CSS,
        isCloze: model.isCloze,
        cardTemplates: model.templates
      },
      settings
    )
    names.push(model.name)
  }
}

/** Our notes already in Anki, by card id: note id, note type and tags. */
async function existingNotes(cardIds, settings) {
  const byCard = new Map()
  for (let i = 0; i < cardIds.length; i += QUERY_CHUNK) {
    const query = ankiSourceQuery(cardIds.slice(i, i + QUERY_CHUNK))
    if (!query) continue
    const ids = (await ankiRequest('findNotes', { query }, settings)) || []
    if (!ids.length) continue
    const info = (await ankiRequest('notesInfo', { notes: ids }, settings)) || []
    for (const note of info) {
      const source = note?.fields?.SourceId?.value
      if (source && !byCard.has(source)) {
        byCard.set(source, { id: note.noteId, modelName: note.modelName, tags: note.tags || [] })
      }
    }
  }
  return byCard
}

function attachmentData(files) {
  const found = new Map()
  for (const item of resolveExistingNoteAttachments(files)) {
    found.set(item.fileName, item.absolutePath)
  }
  return found
}

/**
 * Add new cards, update the ones already sent, then sync Anki with AnkiWeb.
 * Cards deleted here stay in Anki, with their review history.
 */
export async function syncDeckToAnki(deckId) {
  const deck = getDeck(deckId)
  if (!deck) throw new Error('Mazo no encontrado')
  const settings = getAnkiSettings()
  const notes = ankiNotesForDeck(deck, { parent: settings.parent })
  if (!notes.length) throw new Error('El mazo no tiene tarjetas')

  await ensureModels([...new Set(notes.map((note) => note.type))], settings)
  await ankiRequest('createDeck', { deck: notes[0].deckName }, settings)

  const media = new Map(
    notes.filter((note) => note.media).map((note) => [note.media.name, note.media])
  )
  const onDisk = attachmentData([...media.values()].map((item) => item.file))
  let images = 0
  const missingImages = new Set()
  for (const item of media.values()) {
    const absolute = onDisk.get(item.file)
    if (!absolute) {
      missingImages.add(item.name)
      continue
    }
    const data = (await fs.promises.readFile(absolute)).toString('base64')
    await ankiRequest('storeMediaFile', { filename: item.name, data }, settings)
    images += 1
  }

  const fieldsFor = (note) =>
    note.media && missingImages.has(note.media.name) ? { ...note.fields, Image: '' } : note.fields

  const known = await existingNotes(
    notes.map((note) => note.cardId),
    settings
  )
  // A note whose type no longer matches the card is left alone.
  const updates = notes.filter(
    (note) => known.has(note.cardId) && known.get(note.cardId).modelName === note.modelName
  )
  const mismatched = notes.filter(
    (note) => known.has(note.cardId) && known.get(note.cardId).modelName !== note.modelName
  ).length
  const additions = notes.filter((note) => !known.has(note.cardId))

  if (updates.length) {
    await ankiRequest(
      'multi',
      {
        actions: updates.flatMap((note) => {
          const current = known.get(note.cardId)
          return [
            {
              action: 'updateNoteFields',
              params: { note: { id: current.id, fields: fieldsFor(note) } }
            },
            {
              action: 'updateNoteTags',
              params: {
                note: current.id,
                tags: mergeAnkiTags(current.tags, note.tags, note.legacyTags)
              }
            }
          ]
        })
      },
      settings
    )
  }
  let added = 0
  if (additions.length) {
    const ids =
      (await ankiRequest(
        'addNotes',
        {
          notes: additions.map((note) => ({
            deckName: note.deckName,
            modelName: note.modelName,
            fields: fieldsFor(note),
            tags: note.tags,
            options: { allowDuplicate: true }
          }))
        },
        settings
      )) || []
    added = ids.filter(Boolean).length
  }

  let synced = false
  let syncError = ''
  try {
    await ankiRequest('sync', {}, settings)
    synced = true
  } catch (error) {
    syncError = /close editors/i.test(error.message)
      ? 'Anki tiene abierta una ventana de edición (Examinar, Añadir o Editar). Ciérrala y vuelve a enviar o pulsa Sincronizar en Anki; las tarjetas ya están en Anki.'
      : /not logged in|login|auth/i.test(error.message)
        ? 'Anki no tiene sesión en AnkiWeb. Inicia sesión en Anki y sincroniza; las tarjetas ya están en Anki.'
        : error.message
  }

  const saved = markDeckAnkiSynced(deck.id)
  return {
    ok: true,
    deck: saved,
    added,
    updated: updates.length,
    failed: additions.length - added + mismatched,
    images,
    missingImages: missingImages.size,
    synced,
    syncError
  }
}

function safeFileBase(title) {
  return (
    String(title || 'tarjetas')
      .split('')
      .map((ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? ' ' : ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'tarjetas'
  )
}

/**
 * Save the deck as an Anki text file. Images go to a folder next to it, ready
 * to drop into Anki's collection.media folder.
 */
export async function exportDeckForAnki(deckId, parentWindow) {
  const deck = getDeck(deckId)
  if (!deck) throw new Error('Mazo no encontrado')
  const settings = getAnkiSettings()
  const result = await dialog.showSaveDialog(parentWindow, {
    title: 'Exportar mazo para Anki',
    defaultPath: `${safeFileBase(deck.title)}.txt`,
    filters: [
      { name: 'Texto para Anki', extensions: ['txt'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  const filePath = /\.txt$/i.test(result.filePath) ? result.filePath : `${result.filePath}.txt`
  const { text, media } = ankiTextExport(deck, { parent: settings.parent })
  await fs.promises.writeFile(filePath, text, 'utf8')

  const onDisk = attachmentData(media.map((item) => item.file))
  let mediaDir = null
  let mediaCount = 0
  for (const item of media) {
    const absolute = onDisk.get(item.file)
    if (!absolute) continue
    if (!mediaDir) {
      mediaDir = filePath.replace(/\.txt$/i, '') + ' - imagenes'
      await fs.promises.mkdir(mediaDir, { recursive: true })
    }
    await fs.promises.copyFile(absolute, path.join(mediaDir, item.name))
    mediaCount += 1
  }
  return { ok: true, canceled: false, path: filePath, mediaDir, mediaCount }
}
