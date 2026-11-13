import { folderResolver, sameFolder } from './courseFolderMatch.js'

/**
 * `hide: true` in courseProps.json removes a course from the catalog.
 * Stored playlist membership is kept so clearing the flag brings it back.
 */

export function isCourseHidden(record) {
  return record?.hide === true
}

function courseName(value) {
  return (
    String(value || '')
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() || ''
  )
}

function matchesHidden(name, hiddenPaths, resolve) {
  if (hiddenPaths.has(name)) return true
  const resolved = resolve(name)
  return Boolean(resolved) && resolved !== name && hiddenPaths.has(resolved)
}

export function retainHiddenCoursePaths(coursePaths, existingPaths, hiddenPaths) {
  const next = [...(coursePaths || [])]
  if (!hiddenPaths?.size || !existingPaths?.length) return next
  const resolve = folderResolver(hiddenPaths)
  for (const name of existingPaths) {
    if (!matchesHidden(name, hiddenPaths, resolve)) continue
    if (next.some((item) => sameFolder(item, name))) continue
    next.push(name)
  }
  return next
}

export function restoreHiddenCourseWhys(courseWhys, existingWhys, hiddenPaths) {
  const next = { ...(courseWhys || {}) }
  if (!hiddenPaths?.size) return next
  const resolve = folderResolver(hiddenPaths)
  const present = new Set(Object.keys(next))
  for (const [name, why] of Object.entries(existingWhys || {})) {
    if (!why || !matchesHidden(name, hiddenPaths, resolve)) continue
    if ([...present].some((key) => sameFolder(key, name))) continue
    next[name] = why
    present.add(name)
  }
  return next
}

/** Copy sent to the UI. Hidden courses stay in the saved playlist. */
export function playlistForDisplay(playlist, hiddenPaths) {
  if (!playlist || !hiddenPaths?.size) return playlist
  const resolve = folderResolver(hiddenPaths)
  const coursePaths = (playlist.coursePaths || []).filter(
    (name) => !matchesHidden(name, hiddenPaths, resolve)
  )
  if (coursePaths.length === (playlist.coursePaths || []).length) return playlist
  const courseWhys = {}
  for (const [name, why] of Object.entries(playlist.courseWhys || {})) {
    if (!matchesHidden(name, hiddenPaths, resolve)) courseWhys[name] = why
  }
  return { ...playlist, coursePaths, courseWhys }
}

/**
 * Finding copy for library views.
 * A note with no course stays. A note that only belongs to hidden courses is dropped.
 * Anchors on hidden courses are removed from the copy.
 */
export function visibleFinding(finding, hiddenPaths) {
  if (!finding || !hiddenPaths?.size) return finding
  const anchors = Array.isArray(finding.anchors) ? finding.anchors : []
  if (!anchors.length) return finding
  const resolve = folderResolver(hiddenPaths)
  const next = anchors.filter((anchor) => {
    const name = courseName(anchor?.coursePath)
    return !name || !matchesHidden(name, hiddenPaths, resolve)
  })
  if (!next.length) return null
  if (next.length === anchors.length) return finding
  return { ...finding, anchors: next }
}
