import { nameKey } from './courseDescription.js'
import { courseFolderName } from './courseExportSelection.js'

/**
 * Map a stored folder string onto one real library folder.
 * An exact name wins. Otherwise a single match after accents, case, and
 * dash lookalikes are folded. Two folders that fold together stay unresolved.
 */
export function folderResolver(folderNames) {
  const exact = new Set()
  const byKey = new Map()
  for (const folder of folderNames || []) {
    const name = courseFolderName(folder)
    if (!name || exact.has(name)) continue
    exact.add(name)
    const key = nameKey(name)
    if (!key) continue
    const hits = byKey.get(key)
    if (hits) {
      if (!hits.includes(name)) hits.push(name)
    } else byKey.set(key, [name])
  }
  return function resolve(stored) {
    const name = courseFolderName(stored)
    if (!name) return ''
    if (exact.has(name)) return name
    const hits = byKey.get(nameKey(name)) || []
    return hits.length === 1 ? hits[0] : name
  }
}

export function resolveFolderName(stored, folderNames) {
  return folderResolver(folderNames)(stored)
}

/** True when two folder strings are the same course name, including encoding. */
export function sameFolder(left, right) {
  const a = courseFolderName(left)
  const b = courseFolderName(right)
  if (!a || !b) return false
  if (a === b) return true
  const key = nameKey(a)
  return Boolean(key) && key === nameKey(b)
}

/** Catalog lookup. `get` accepts the folder string stored on a list. */
export function courseCatalog(courses) {
  const byExact = new Map()
  for (const course of courses || []) {
    if (course?.path && !byExact.has(course.path)) byExact.set(course.path, course)
  }
  const resolve = folderResolver([...byExact.keys()])
  return {
    get(stored) {
      if (byExact.has(stored)) return byExact.get(stored) || null
      const name = resolve(stored)
      return byExact.get(name) || null
    }
  }
}
