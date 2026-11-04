/** Folder name under the library. Rejects empty paths and `..`. */
export function courseFolderName(coursePath) {
  const parts = String(coursePath || '')
    .trim()
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
  const name = parts.pop() || ''
  if (!name || name === '.' || name === '..') return ''
  return name
}

/** True when `folderReal` is a directory inside `libraryReal`, not the library itself. */
export function folderIsInsideLibrary(libraryReal, folderReal) {
  const library = String(libraryReal || '').replace(/[\\/]+$/, '')
  const folder = String(folderReal || '').replace(/[\\/]+$/, '')
  if (!library || !folder || library === folder) return false
  const sep = library.includes('\\') && !library.includes('/') ? '\\' : '/'
  const prefix = library.endsWith(sep) ? library : library + sep
  if (!folder.startsWith(prefix)) return false
  const rest = folder.slice(prefix.length)
  return Boolean(rest) && !rest.split(/[\\/]/).includes('..')
}

/**
 * Toggle one course, or add every visible course from the anchor through `coursePath`.
 * `orderedPaths` is the list currently on screen.
 */
export function applyCoursePick(
  selected,
  orderedPaths,
  coursePath,
  { range = false, anchor = null } = {}
) {
  const next = new Set(selected instanceof Set ? selected : selected || [])
  const key = courseFolderName(coursePath)
  if (!key) return { selected: next, anchor: anchor || null }

  const order = (Array.isArray(orderedPaths) ? orderedPaths : [])
    .map((item) => courseFolderName(item))
    .filter(Boolean)
  const anchorKey = courseFolderName(anchor)

  if (range && anchorKey && order.includes(anchorKey) && order.includes(key)) {
    const start = order.indexOf(anchorKey)
    const end = order.indexOf(key)
    const from = Math.min(start, end)
    const to = Math.max(start, end)
    for (let index = from; index <= to; index += 1) next.add(order[index])
    return { selected: next, anchor: key }
  }

  if (next.has(key)) next.delete(key)
  else next.add(key)
  return { selected: next, anchor: key }
}

/**
 * Course folders to zip: checked courses, plus every course on a checked list
 * and on lists nested inside it. Names are unique.
 */
export function collectExportCoursePaths(playlists, { coursePaths = [], playlistIds = [] } = {}) {
  const byId = new Map()
  for (const playlist of Array.isArray(playlists) ? playlists : []) {
    if (playlist?.id) byId.set(playlist.id, playlist)
  }

  const names = []
  const seen = new Set()
  const add = (value) => {
    const name = courseFolderName(value)
    if (!name || seen.has(name)) return
    seen.add(name)
    names.push(name)
  }

  for (const coursePath of coursePaths) add(coursePath)

  const visiting = new Set()
  const walk = (id) => {
    const listId = String(id || '')
    if (!listId || visiting.has(listId)) return
    visiting.add(listId)
    const playlist = byId.get(listId)
    if (!playlist) return
    for (const coursePath of playlist.coursePaths || []) add(coursePath)
    for (const childId of playlist.childIds || []) walk(childId)
  }

  for (const id of playlistIds) walk(id)
  return names
}
