/**
 * One level of nested listas. A lista that contains others is a root.
 * A lista inside another has no children of its own.
 */

const ID_RE = /^[a-zA-Z0-9_-]{1,80}$/
export const MAX_NESTED = 6

export function normalizeChildIds(raw, selfId = '') {
  const ids = []
  const seen = new Set()
  const self = String(selfId || '')
  for (const item of Array.isArray(raw) ? raw : []) {
    const id = String(item || '').trim()
    if (!ID_RE.test(id) || id === self || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= MAX_NESTED) break
  }
  return ids
}

/**
 * Drop missing ids, cycles, and a second level of nesting.
 * `parentId` is derived from `childIds` and is not stored on its own.
 */
export function settleNesting(playlists) {
  const list = Array.isArray(playlists) ? playlists : []
  const ids = new Set(list.map((playlist) => playlist?.id).filter(Boolean))
  const cleaned = list.map((playlist) => ({
    ...playlist,
    childIds: normalizeChildIds(playlist?.childIds, playlist?.id).filter((id) => ids.has(id))
  }))

  const claimed = new Set()
  const once = cleaned.map((playlist) => {
    const childIds = []
    for (const id of playlist.childIds) {
      if (claimed.has(id)) continue
      claimed.add(id)
      childIds.push(id)
    }
    return { ...playlist, childIds }
  })

  const parents = new Set(once.filter((playlist) => playlist.childIds.length).map((playlist) => playlist.id))
  const flat = once.map((playlist) =>
    claimed.has(playlist.id) ? { ...playlist, childIds: [] } : playlist
  )
  const parentOf = new Map()
  for (const playlist of flat) {
    if (!parents.has(playlist.id) && !playlist.childIds.length) continue
    for (const id of playlist.childIds) parentOf.set(id, playlist.id)
  }

  return flat.map((playlist) => ({
    ...playlist,
    parentId: parentOf.get(playlist.id) || ''
  }))
}
