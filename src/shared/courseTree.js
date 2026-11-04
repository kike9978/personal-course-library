/** Walk a scanned course tree. Sections may contain `sections` of their own. */

export function walkSections(sections, visit) {
  const walk = (list) => {
    for (const section of list || []) {
      visit(section)
      walk(section.sections)
    }
  }
  walk(sections)
}

function baseName(relativePath) {
  const parts = String(relativePath || '').split('/')
  return parts[parts.length - 1] || ''
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

/** Direct lessons and child sections, in folder order. */
export function orderedContent(section) {
  const nodes = [
    ...(section?.sections || []).map((child) => ({
      type: 'section',
      section: child,
      sortKey: baseName(child.relativePath || child.id || child.title)
    })),
    ...(section?.lessons || []).map((lesson) => ({
      type: 'lesson',
      lesson,
      sortKey: baseName(lesson.relativePath || lesson.title)
    }))
  ]
  nodes.sort((a, b) => naturalCompare(a.sortKey, b.sortKey))
  return nodes
}

export function flattenLessons(sections) {
  const lessons = []
  const walk = (list) => {
    for (const section of list || []) {
      for (const node of orderedContent(section)) {
        if (node.type === 'lesson') lessons.push(node.lesson)
        else walk([node.section])
      }
    }
  }
  walk(sections)
  return lessons
}

export function nestedSectionIds(sections) {
  const ids = []
  const walk = (list, depth) => {
    for (const section of list || []) {
      if (depth > 0 && section.id) ids.push(section.id)
      walk(section.sections, depth + 1)
    }
  }
  walk(sections, 0)
  return ids
}

export function sectionExists(sections, id) {
  if (!id) return false
  let found = false
  walkSections(sections, (section) => {
    if (section.id === id) found = true
  })
  return found
}

function sectionOwnsDirect(section, selectedPath) {
  if (!selectedPath) return false
  if ((section.lessons || []).some((lesson) => lesson.relativePath === selectedPath)) return true
  if ((section.resources || []).some((res) => res.relativePath === selectedPath)) return true
  return (section.lessons || []).some((lesson) =>
    (lesson.resources || []).some((res) => res.relativePath === selectedPath)
  )
}

export function sectionIdForPath(sections, courseResources, selectedPath) {
  if (!selectedPath) return null
  let found = null
  walkSections(sections, (section) => {
    if (sectionOwnsDirect(section, selectedPath)) found = section.id
  })
  if (found) return found
  if ((courseResources || []).some((res) => res.relativePath === selectedPath)) {
    return '__course_resources__'
  }
  return null
}

/** Ids from the matching section up to the root, root first. */
export function ancestorIds(sections, id) {
  if (!id) return []
  const chain = []
  const walk = (list, stack) => {
    for (const section of list || []) {
      const next = [...stack, section.id]
      if (section.id === id) {
        chain.push(...next)
        return true
      }
      if (walk(section.sections, next)) return true
    }
    return false
  }
  walk(sections, [])
  return chain
}

export function collectFilePaths(sections, courseResources = []) {
  const filePaths = new Set()
  walkSections(sections, (section) => {
    for (const lesson of section.lessons || []) {
      if (lesson.relativePath) filePaths.add(lesson.relativePath)
      for (const res of lesson.resources || []) {
        if (res.relativePath) filePaths.add(res.relativePath)
      }
    }
    for (const res of section.resources || []) {
      if (res.relativePath) filePaths.add(res.relativePath)
    }
  })
  for (const res of courseResources || []) {
    if (res.relativePath) filePaths.add(res.relativePath)
  }
  return filePaths
}

export function collectTreeResources(tree) {
  const list = [...(tree?.courseResources || [])]
  walkSections(tree?.sections, (section) => {
    list.push(...(section.resources || []))
    for (const lesson of section.lessons || []) {
      list.push(...(lesson.resources || []))
    }
  })
  return list
}

export function countSections(sections) {
  let count = 0
  walkSections(sections, () => {
    count += 1
  })
  return count
}
