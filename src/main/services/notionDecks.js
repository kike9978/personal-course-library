/**
 * Flashcard decks in Notion. Each deck is a row of kind "deck" in the Notion
 * database; its page shows one toggle per card, plus a data toggle with the
 * deck as JSON. A deck is pushed a few seconds after it changes here, and other
 * installs read it back from the data toggle. Study marks stay on each install.
 */

import fs from 'fs'
import { getNotionConfig } from './config.js'
import { deleteDeck, getDeck, listDecks, saveDeckFromNotion, setDeckNotion } from './learningStore.js'
import {
  resolveExistingNoteAttachments,
  getNoteAttachmentMime,
  noteAttachmentExists,
  saveNoteAttachmentBytes
} from './noteAttachments.js'
import { runNotionTask } from './notionSync.js'
import {
  DECK_DATA_TITLE,
  DECK_ICON,
  deckBlocks,
  deckDataBlocks,
  deckFromData,
  deckImageFiles,
  deckNotionHash
} from '../../shared/notionDeck.js'

const PUSH_DELAY_MS = 3000
const PULL_EVERY_MS = 2 * 60 * 1000
let pulling = null
let pullTimer = null
const timers = new Map()
let notify = () => {}

/** Called with the updated deck after each push or failure. */
export function setDeckNotionListener(fn) {
  notify = typeof fn === 'function' ? fn : () => {}
}

function describe(error) {
  return String(error?.message || error || 'Error de Notion')
}

async function uploadImages(client, deck) {
  const uploads = new Map()
  const files = deckImageFiles(deck)
  for (const item of resolveExistingNoteAttachments(files)) {
    try {
      const bytes = await fs.promises.readFile(item.absolutePath)
      const id = await client.uploadFile(
        item.fileName,
        bytes,
        getNoteAttachmentMime(item.absolutePath)
      )
      uploads.set(item.fileName, id)
    } catch {
      // A card keeps its text when its image fails to upload.
    }
  }
  return uploads
}

/** Push one deck now. `force` rewrites the page even when nothing changed. */
export async function pushDeckToNotion(deckId, { force = false } = {}) {
  const deck = getDeck(deckId)
  if (!deck) return null
  const hash = deckNotionHash(deck)
  if (!force && deck.notion?.pageId && deck.notion.hash === hash && !deck.notion.error) return deck
  const result = await runNotionTask(async (client) => {
    const uploads = await uploadImages(client, deck)
    return client.saveDeckPage({
      deckId: deck.id,
      title: deck.title,
      children: deckBlocks(deck, uploads),
      pageId: deck.notion?.pageId || null,
      emoji: DECK_ICON,
      dataTitle: DECK_DATA_TITLE,
      dataChildren: deckDataBlocks(deck)
    })
  })
  if (!result) return deck
  const saved = setDeckNotion(deck.id, {
    pageId: result.pageId,
    hash,
    syncedAt: Date.now(),
    remoteEditedAt: result.editedAt || null,
    error: null
  })
  notify(saved)
  return saved
}

/** Push a deck a few seconds after its last change. */
export function enqueueNotionDeck(deckId) {
  if (!deckId || !getNotionConfig().enabled) return
  clearTimeout(timers.get(deckId))
  timers.set(
    deckId,
    setTimeout(() => {
      timers.delete(deckId)
      pushDeckToNotion(deckId).catch((error) => {
        const saved = setDeckNotion(deckId, { error: describe(error) })
        if (saved) notify(saved)
      })
    }, PUSH_DELAY_MS)
  )
}

/** Archive the Notion page of a deck that was deleted here. */
export function archiveNotionDeck(deck) {
  const pageId = deck?.notion?.pageId
  if (!pageId || !getNotionConfig().enabled) return
  clearTimeout(timers.get(deck.id))
  timers.delete(deck.id)
  runNotionTask((client) => client.archivePage(pageId)).catch(() => {
    // The page stays in Notion; nothing in the app depends on it.
  })
}

/** Push every deck that changed since its last push (on start and when sync is turned on). */
export function queueAllNotionDecks() {
  if (!getNotionConfig().enabled) return
  for (const deck of listDecks()) {
    if (!deck.notion?.pageId || deck.notion.error || deck.notion.hash !== deckNotionHash(deck)) {
      enqueueNotionDeck(deck.id)
    }
  }
}

/** True when the deck has changes here that were not pushed yet. */
function hasLocalChanges(deck) {
  return !deck.notion?.hash || deck.notion.hash !== deckNotionHash(deck)
}

/** Download the images of pulled cards that this install does not have. */
async function fetchImages(client, remote, cardToggles) {
  for (const [index, card] of remote.cards.entries()) {
    const file = card.image?.file
    if (!file || noteAttachmentExists(file) || !cardToggles[index]) continue
    try {
      const url = await client.firstImageUrl(cardToggles[index])
      if (!url) continue
      const bytes = await client.downloadAsset(url)
      if (bytes?.byteLength) saveNoteAttachmentBytes(file, bytes)
    } catch {
      // The card comes without its image; the next change brings it again.
    }
  }
}

async function pullAll(client) {
  const rows = await client.listDeckRows()
  const local = new Map(listDecks().map((deck) => [deck.id, deck]))
  const seen = new Set()
  for (const row of rows) {
    if (!row.externalId) continue
    seen.add(row.externalId)
    const deck = local.get(row.externalId)
    if (deck && deck.notion?.remoteEditedAt && deck.notion.remoteEditedAt === row.editedAt) continue
    // Unpushed changes here win; they go to Notion next.
    if (deck && deck.notion?.hash && hasLocalChanges(deck)) continue
    const page = await client.readDeckPage(row.pageId, DECK_DATA_TITLE)
    const remote = deckFromData(page.dataText)
    if (!remote || remote.id !== row.externalId) continue
    const hash = deckNotionHash(remote)
    const cursor = { pageId: row.pageId, remoteEditedAt: row.editedAt, error: null }
    if (deck && deck.notion?.hash === hash) {
      setDeckNotion(deck.id, cursor)
      continue
    }
    await fetchImages(client, remote, page.cardToggles)
    const saved = saveDeckFromNotion(remote, { ...cursor, hash, syncedAt: Date.now() })
    if (saved) notify(saved)
  }
  // A deck deleted on another install: its page went to the trash.
  for (const deck of local.values()) {
    if (seen.has(deck.id) || !deck.notion?.pageId || hasLocalChanges(deck)) continue
    if (!(await client.pageGone(deck.notion.pageId))) continue
    deleteDeck(deck.id)
    notify({ id: deck.id, removed: true })
  }
}

/** Bring in decks that other installs pushed or changed. */
export function pullNotionDecks() {
  if (!getNotionConfig().enabled) return Promise.resolve()
  if (pulling) return pulling
  pulling = runNotionTask(pullAll)
    .catch(() => {
      // Tried again on the next focus or timer.
    })
    .finally(() => {
      pulling = null
    })
  return pulling
}

/** Pull now and every couple of minutes while Notion sync is on. */
export function startNotionDeckPull() {
  clearInterval(pullTimer)
  pullTimer = null
  if (!getNotionConfig().enabled) return
  void pullNotionDecks()
  pullTimer = setInterval(() => void pullNotionDecks(), PULL_EVERY_MS)
}
