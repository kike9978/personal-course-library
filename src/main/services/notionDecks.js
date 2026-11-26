/**
 * Push flashcard decks to Notion, one way. Each deck is a row of kind "deck"
 * in the Notion database; its page shows one toggle per card. A deck is pushed
 * a few seconds after it changes, and only when its content did change.
 */

import fs from 'fs'
import { getNotionConfig } from './config.js'
import { getDeck, listDecks, setDeckNotion } from './learningStore.js'
import { resolveExistingNoteAttachments, getNoteAttachmentMime } from './noteAttachments.js'
import { runNotionTask } from './notionSync.js'
import { DECK_ICON, deckBlocks, deckImageFiles, deckNotionHash } from '../../shared/notionDeck.js'

const PUSH_DELAY_MS = 3000
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
      emoji: DECK_ICON
    })
  })
  if (!result) return deck
  const saved = setDeckNotion(deck.id, {
    pageId: result.pageId,
    hash,
    syncedAt: Date.now(),
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
