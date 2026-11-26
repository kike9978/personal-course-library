import { resolveCourseTitle } from '../../../shared/knowledgeGraph.js'

const SOURCES_NODE = '__sources__'

function courseLabel(coursePath, titles) {
  if (coursePath === SOURCES_NODE) return 'Fuentes'
  if (!coursePath) return 'Sin curso'
  return resolveCourseTitle(coursePath, titles)
}

/** Saved-link notes sit under one "Fuentes" node instead of "Sin curso". */
function placeKey(entry) {
  if (entry.sourceId) return SOURCES_NODE
  return entry.coursePath || null
}

function nestByCourse(items, titles, idPrefix) {
  const courses = new Map()
  for (const item of items) {
    const coursePath = placeKey(item)
    const id = `${idPrefix}::course:${coursePath || '__loose__'}`
    if (!courses.has(id)) {
      courses.set(id, {
        id,
        title: courseLabel(coursePath, titles),
        items: []
      })
    }
    courses.get(id).items.push(item)
  }
  return [...courses.values()].sort((a, b) =>
    String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })
  )
}

function collapseDuplicateLevel(node) {
  if (node.children?.length !== 1) return node
  const only = node.children[0]
  if (only.children?.length) return node
  if (only.title.trim().toLowerCase() !== node.title.trim().toLowerCase()) return node
  return { ...node, children: undefined, items: only.items }
}

export function buildAnnotationTree(groups, { groupMode, courseColumn, titles } = {}) {
  if (groupMode === 'topic' || groupMode === 'week') {
    return groups.map((group) => {
      if (!courseColumn) {
        const title =
          groupMode === 'topic' && group.courseCount > 1
            ? `${group.title} · ${group.courseCount} cursos`
            : group.title
        return { id: group.key, title, items: group.items }
      }
      return collapseDuplicateLevel({
        id: group.key,
        title: group.title,
        children: nestByCourse(group.items, titles, group.key)
      })
    })
  }

  if (!courseColumn) {
    return groups.map((group) => ({
      id: group.key,
      title: group.title,
      items: group.items
    }))
  }

  const courses = new Map()
  for (const group of groups) {
    const coursePath = placeKey(group)
    const id = `course:${coursePath || '__loose__'}`
    if (!courses.has(id)) {
      courses.set(id, {
        id,
        title: courseLabel(coursePath, titles),
        children: []
      })
    }
    courses.get(id).children.push({
      id: group.key,
      title: group.title,
      items: group.items
    })
  }
  return [...courses.values()]
    .sort((a, b) => {
      const aLoose = String(a.id).endsWith('__loose__')
      const bLoose = String(b.id).endsWith('__loose__')
      if (aLoose !== bLoose) return aLoose ? 1 : -1
      const aSources = String(a.id).endsWith(SOURCES_NODE)
      const bSources = String(b.id).endsWith(SOURCES_NODE)
      if (aSources !== bSources) return aSources ? 1 : -1
      return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })
    })
    .map(collapseDuplicateLevel)
}

export function openIdsForItem(nodes, match, trail = []) {
  for (const node of nodes || []) {
    const next = [...trail, node.id]
    if (node.items?.some(match)) return next
    if (node.children) {
      const found = openIdsForItem(node.children, match, next)
      if (found) return found
    }
  }
  return null
}
