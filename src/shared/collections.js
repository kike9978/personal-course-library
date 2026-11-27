/**
 * Collections of saved links (Fuentes, Phase 4). Kept apart from course playlists: a
 * collection only ever holds source ids, and lives in `store.sourceCollections`.
 */

export const COLLECTION_LAYOUTS = ['list', 'board']
const MAX_ITEMS = 2000
const MAX_CAPTION = 240

function cleanText(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Stored shape. `existing` supplies what the patch leaves out; items keep their order. */
export function normalizeCollection(input = {}, existing = null) {
  const base = existing || {}
  const pick = (key) => (input[key] !== undefined ? input[key] : base[key])
  const now = Date.now()
  const seen = new Set()
  const items = []
  for (const item of Array.isArray(pick('items')) ? pick('items') : []) {
    const sourceId = String(item?.sourceId || '')
    if (!sourceId || seen.has(sourceId)) continue
    seen.add(sourceId)
    items.push({
      sourceId,
      note: cleanText(item.note, MAX_CAPTION),
      addedAt: Number(item.addedAt) || now
    })
    if (items.length >= MAX_ITEMS) break
  }
  const cover = pick('cover')
  return {
    id: String(pick('id') || ''),
    title: cleanText(pick('title'), 160) || 'Colección',
    description: cleanText(pick('description'), 600),
    layout: COLLECTION_LAYOUTS.includes(pick('layout')) ? pick('layout') : 'list',
    cover: cover && seen.has(String(cover)) ? String(cover) : null,
    items,
    smart: pick('smart') ?? null,
    notion: pick('notion') ?? null,
    createdAt: Number(base.createdAt || input.createdAt) || now,
    updatedAt: now
  }
}

/** Add sources at the end, skipping ones already in. Returns the new item list. */
export function addCollectionItems(items, sourceIds, now = Date.now()) {
  const list = Array.isArray(items) ? [...items] : []
  const inside = new Set(list.map((item) => item.sourceId))
  for (const id of sourceIds || []) {
    const sourceId = String(id || '')
    if (!sourceId || inside.has(sourceId)) continue
    inside.add(sourceId)
    list.push({ sourceId, note: '', addedAt: now })
  }
  return list
}

/** Move one item to a new position. Out-of-range positions clamp to the ends. */
export function moveCollectionItem(items, sourceId, toIndex) {
  const list = Array.isArray(items) ? [...items] : []
  const from = list.findIndex((item) => item.sourceId === sourceId)
  if (from < 0) return list
  const [item] = list.splice(from, 1)
  const to = Math.max(0, Math.min(list.length, Number(toIndex) || 0))
  list.splice(to, 0, item)
  return list
}

/** Collection items joined to their links, in order. Items whose link is gone are skipped. */
export function collectionEntries(collection, sources) {
  const byId = new Map((sources || []).map((source) => [source.id, source]))
  return (collection?.items || [])
    .map((item) => ({ ...item, source: byId.get(item.sourceId) || null }))
    .filter((entry) => entry.source)
}

/** Seconds of video in a collection, when every video's length is known; null otherwise. */
export function collectionDuration(entries) {
  const videos = (entries || []).filter((entry) => entry.source.kind === 'youtube')
  if (!videos.length || videos.some((entry) => !entry.source.durationSec)) return null
  return videos.reduce((sum, entry) => sum + entry.source.durationSec, 0)
}

/**
 * The next YouTube item to play: the first one not watched to the end, after `afterId`
 * when given. A video counts as watched once its saved position is within 30 s of the end.
 */
export function nextToPlay(entries, afterId = null) {
  const videos = (entries || []).filter((entry) => entry.source.kind === 'youtube')
  const start = afterId ? videos.findIndex((entry) => entry.sourceId === afterId) + 1 : 0
  const watched = (source) =>
    source.durationSec && (source.lastPositionSec || 0) >= source.durationSec - 30
  return (
    videos.slice(start).find((entry) => !watched(entry.source)) ||
    (afterId ? videos[start] || null : null)
  )
}
