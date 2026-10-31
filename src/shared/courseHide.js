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

export function retainHiddenCoursePaths(coursePaths, existingPaths, hiddenPaths) {
  const next = [...(coursePaths || [])]
  if (!hiddenPaths?.size || !existingPaths?.length) return next
  const seen = new Set(next)
  for (const name of existingPaths) {
    if (!hiddenPaths.has(name) || seen.has(name)) continue
    seen.add(name)
    next.push(name)
  }
  return next
}

export function restoreHiddenCourseWhys(courseWhys, existingWhys, hiddenPaths) {
  const next = { ...(courseWhys || {}) }
  if (!hiddenPaths?.size) return next
  for (const [name, why] of Object.entries(existingWhys || {})) {
    if (hiddenPaths.has(name) && why && next[name] == null) next[name] = why
  }
  return next
}

/** Copy sent to the UI. Hidden courses stay in the saved playlist. */
export function playlistForDisplay(playlist, hiddenPaths) {
  if (!playlist || !hiddenPaths?.size) return playlist
  const coursePaths = (playlist.coursePaths || []).filter((name) => !hiddenPaths.has(name))
  if (coursePaths.length === (playlist.coursePaths || []).length) return playlist
  const courseWhys = {}
  for (const [name, why] of Object.entries(playlist.courseWhys || {})) {
    if (!hiddenPaths.has(name)) courseWhys[name] = why
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
  const next = anchors.filter((anchor) => {
    const name = courseName(anchor?.coursePath)
    return !name || !hiddenPaths.has(name)
  })
  if (!next.length) return null
  if (next.length === anchors.length) return finding
  return { ...finding, anchors: next }
}
