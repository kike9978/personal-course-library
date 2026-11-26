import fs from 'fs'
import { listSources, readSource, restoreSource, withoutNoteWriteHook } from './learningStore.js'
import { cacheSourceThumbnail, resolveSourceMeta, sourceThumbPath } from './sourceMeta.js'
import { instagramThumbnailUrl } from '../../shared/sources.js'

/**
 * Thumbnails are per computer: never synced, each install downloads its own. A link that
 * arrives from Notion (or whose file went missing) is looked up again like a first save,
 * because image addresses expire — Instagram's within days.
 */

const inFlight = new Map()

function hasThumbFile(source) {
  const file = source?.thumbnailFile ? sourceThumbPath(source.thumbnailFile) : null
  return Boolean(file && fs.existsSync(file))
}

async function fetchThumb(id) {
  const source = readSource(id)
  if (!source?.url) return null
  // The address saved with the link may still work; otherwise ask the page for a fresh one.
  let address = source.thumbnail || null
  let file = address ? await cacheSourceThumbnail(id, address) : null
  if (!file && source.kind === 'instagram') {
    address = instagramThumbnailUrl(source.url)
    file = address ? await cacheSourceThumbnail(id, address) : null
  }
  if (!file) {
    const meta = await resolveSourceMeta(source.url)
    address = meta?.thumbnail || null
    file = address ? await cacheSourceThumbnail(id, address) : null
  }
  if (!file || !readSource(id)) return null
  withoutNoteWriteHook(() =>
    restoreSource({ ...readSource(id), thumbnail: address, thumbnailFile: file })
  )
  return file
}

/** Make sure this link has a thumbnail on this computer. Resolves to the file name or null. */
export function ensureSourceThumbnail(id) {
  const source = readSource(id)
  if (!source || hasThumbFile(source)) return Promise.resolve(source?.thumbnailFile || null)
  if (!inFlight.has(id)) {
    inFlight.set(
      id,
      fetchThumb(id)
        .catch(() => null)
        .finally(() => inFlight.delete(id))
    )
  }
  return inFlight.get(id)
}

/** Once per run: fetch thumbnails for every link that has none here. Two at a time. */
export async function backfillSourceThumbnails(onChange) {
  const queue = listSources().filter((source) => !hasThumbFile(source))
  let changed = 0
  const worker = async () => {
    while (queue.length) {
      const source = queue.shift()
      if (await ensureSourceThumbnail(source.id)) changed += 1
    }
  }
  await Promise.all([worker(), worker()])
  if (changed) onChange?.()
  return changed
}
