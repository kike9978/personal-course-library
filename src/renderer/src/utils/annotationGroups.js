/**
 * Group / sort helpers for annotations keyed by content target
 * (`lessonRelativePath` = any course file; `projectId` = virtual project; neither = course journal).
 */

export function sortWithinGroup(a, b) {
  const aT = typeof a.timeSec === 'number' ? a.timeSec : Number.POSITIVE_INFINITY
  const bT = typeof b.timeSec === 'number' ? b.timeSec : Number.POSITIVE_INFINITY
  if (aT !== bT) return aT - bT
  return (a.createdAt || 0) - (b.createdAt || 0)
}

function targetKey(item) {
  if (item.projectId) return `project:${item.projectId}`
  if (item.lessonRelativePath) return `file:${item.lessonRelativePath}`
  if (!item.coursePath) return '__loose__'
  return '__course__'
}

function targetTitle(item) {
  if (item.projectId) return item.projectTitle || 'Proyecto'
  if (item.lessonRelativePath) return item.lessonTitle || item.lessonRelativePath
  if (!item.coursePath) return 'Sin curso'
  return 'Del curso'
}

/**
 * Group annotations by target for table views.
 * Returns ordered sections: preferred target first, then Del curso, then others A–Z.
 *
 * @param {Array} annotations
 * @param {{ preferPath?: string|null, preferProjectId?: string|null, includeCourseKey?: boolean }} [opts]
 * @returns {{ key: string, path: string|null, projectId: string|null, title: string, coursePath?: string|null, items: Array }[]}
 */
export function groupAnnotationsByTarget(annotations, opts = {}) {
  const { preferPath = null, preferProjectId = null, includeCourseKey = false } = opts
  const byKey = new Map()

  for (const item of annotations) {
    const path = item.lessonRelativePath || null
    const projectId = item.projectId || null
    const coursePath = includeCourseKey ? item.coursePath || null : null
    const localKey = targetKey(item)
    const key = includeCourseKey ? `${coursePath || ''}::${localKey}` : localKey

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        path,
        projectId,
        coursePath,
        title: targetTitle(item),
        items: []
      })
    } else {
      const g = byKey.get(key)
      if (projectId && item.projectTitle && g.title === 'Proyecto') {
        g.title = item.projectTitle
      } else if (path && item.lessonTitle && (!g.title || g.title === path)) {
        g.title = item.lessonTitle
      }
    }
    byKey.get(key).items.push(item)
  }

  const groups = [...byKey.values()].map((g) => ({
    ...g,
    title: g.projectId
      ? g.title || 'Proyecto'
      : g.path
        ? g.title || g.path
        : g.key.endsWith('__loose__')
          ? 'Sin curso'
          : 'Del curso',
    items: [...g.items].sort(sortWithinGroup)
  }))

  const preferLocalKey = preferProjectId
    ? `project:${preferProjectId}`
    : preferPath
      ? `file:${preferPath}`
      : null

  groups.sort((a, b) => {
    if (includeCourseKey) {
      const c = String(a.coursePath || '').localeCompare(String(b.coursePath || ''), undefined, {
        sensitivity: 'base'
      })
      if (c !== 0) return c
    }
    if (preferLocalKey) {
      const aLocal = a.projectId
        ? `project:${a.projectId}`
        : a.path
          ? `file:${a.path}`
          : '__course__'
      const bLocal = b.projectId
        ? `project:${b.projectId}`
        : b.path
          ? `file:${b.path}`
          : '__course__'
      const aPref = aLocal === preferLocalKey
      const bPref = bLocal === preferLocalKey
      if (aPref !== bPref) return aPref ? -1 : 1
    }
    const aCourse = !a.path && !a.projectId
    const bCourse = !b.path && !b.projectId
    if (aCourse !== bCourse) return aCourse ? -1 : 1
    const aIsProject = Boolean(a.projectId)
    const bIsProject = Boolean(b.projectId)
    if (aIsProject !== bIsProject) return aIsProject ? 1 : -1
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, {
      sensitivity: 'base'
    })
  })

  return groups
}
