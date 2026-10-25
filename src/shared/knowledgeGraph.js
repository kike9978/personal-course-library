/**
 * Findings, topics, and the local overlap graph.
 * A finding is a note. A topic is a library-wide idea. An anchor is where a finding was seen.
 * The graph is computed from those links.
 */

const MENTION_RE = /@\[(lesson|project|course|topic)\|([^\]]+)]\(([^)]+)\)/g

export function parseMentions(markdown) {
  const mentions = []
  const text = String(markdown || '')
  MENTION_RE.lastIndex = 0
  let match = MENTION_RE.exec(text)
  while (match) {
    mentions.push({ type: match[1], title: match[2], id: match[3] })
    match = MENTION_RE.exec(text)
  }
  return mentions
}

export function topicIdsFromBody(markdown) {
  const ids = []
  for (const mention of parseMentions(markdown)) {
    if (mention.type === 'topic' && mention.id && !ids.includes(mention.id)) ids.push(mention.id)
  }
  return ids
}

export function normalizeTopicTitle(title) {
  return String(title || '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function topicKey(title) {
  return normalizeTopicTitle(title).toLowerCase()
}

export function sameCourse(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (!left || !right) return false
  if (left === right) return true
  const base = (value) => value.split(/[\\/]/).filter(Boolean).pop()
  const leftBase = base(left)
  const rightBase = base(right)
  return leftBase === right || rightBase === left || leftBase === rightBase
}

export function normalizeAnchor(anchor = {}, coursePath = null) {
  const projectId = anchor.projectId || null
  const hasProject = Boolean(projectId)
  return {
    coursePath: anchor.coursePath || coursePath || null,
    lessonRelativePath: hasProject ? null : anchor.lessonRelativePath || null,
    lessonTitle: hasProject ? null : anchor.lessonTitle || null,
    timeSec:
      hasProject || typeof anchor.timeSec !== 'number' ? null : Math.max(0, anchor.timeSec),
    projectId,
    projectTitle: hasProject ? anchor.projectTitle || null : null
  }
}

export function findingFromLegacyNote(note, coursePath) {
  const anchors =
    Array.isArray(note.anchors) && note.anchors.length
      ? note.anchors.map((anchor) => normalizeAnchor(anchor, note.coursePath || coursePath))
      : [normalizeAnchor(note, coursePath)]
  const topicIds = []
  for (const id of [...(note.topicIds || []), ...topicIdsFromBody(note.body)]) {
    if (id && !topicIds.includes(id)) topicIds.push(id)
  }
  return {
    id: note.id,
    title: note.title ?? null,
    body: note.body || '',
    bodyHtml: note.bodyHtml ?? null,
    bodyJson: note.bodyJson ?? null,
    topicIds,
    anchors,
    color: note.color ?? null,
    createdAt: note.createdAt || Date.now(),
    updatedAt: note.updatedAt || note.createdAt || Date.now()
  }
}

export function projectFinding(finding, coursePath = null) {
  const anchors = Array.isArray(finding.anchors) ? finding.anchors : []
  const anchor =
    (coursePath && anchors.find((item) => sameCourse(item.coursePath, coursePath))) ||
    anchors[0] ||
    {}
  return {
    ...finding,
    topicIds: Array.isArray(finding.topicIds) ? finding.topicIds : [],
    anchors,
    coursePath: anchor.coursePath || null,
    lessonRelativePath: anchor.lessonRelativePath || null,
    lessonTitle: anchor.lessonTitle || null,
    timeSec: typeof anchor.timeSec === 'number' ? anchor.timeSec : null,
    projectId: anchor.projectId || null,
    projectTitle: anchor.projectTitle || null
  }
}

export function findingsForCourse(findings, coursePath) {
  return (findings || [])
    .filter((finding) =>
      (finding.anchors || []).some((anchor) => sameCourse(anchor.coursePath, coursePath))
    )
    .map((finding) => projectFinding(finding, coursePath))
}

export function topicCourseSpan(findings) {
  const span = new Map()
  for (const finding of findings || []) {
    for (const topicId of finding.topicIds || []) {
      if (!span.has(topicId)) span.set(topicId, new Set())
      for (const anchor of finding.anchors || []) {
        if (anchor.coursePath) span.get(topicId).add(anchor.coursePath)
      }
    }
  }
  return span
}

export function groupFindingsByTopic(findings, topics, { corpus = findings, overlapOnly = false } = {}) {
  const span = topicCourseSpan(corpus)
  const topicById = new Map((topics || []).map((topic) => [topic.id, topic]))
  const buckets = new Map()

  const ensure = (id) => {
    if (!buckets.has(id)) {
      const topic = topicById.get(id)
      buckets.set(id, {
        key: `topic:${id}`,
        title: topic?.title || 'Sin tema',
        topicId: id === '__none__' ? null : id,
        courseCount: id === '__none__' ? 0 : span.get(id)?.size || 0,
        items: []
      })
    }
    return buckets.get(id)
  }

  for (const finding of findings || []) {
    const ids = (finding.topicIds || []).filter((id) => topicById.has(id))
    if (!ids.length) {
      if (!overlapOnly) ensure('__none__').items.push(finding)
      continue
    }
    let placed = false
    for (const id of ids) {
      const count = span.get(id)?.size || 0
      if (overlapOnly && count < 2) continue
      ensure(id).items.push(finding)
      placed = true
    }
    if (!placed && !overlapOnly) ensure('__none__').items.push(finding)
  }

  return [...buckets.values()]
    .filter((group) => group.items.length)
    .sort((a, b) => {
      if (Boolean(a.topicId) !== Boolean(b.topicId)) return a.topicId ? -1 : 1
      if (b.courseCount !== a.courseCount) return b.courseCount - a.courseCount
      return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })
    })
}

export function relatedFindings(finding, findings, topics) {
  const ids = new Set(finding?.topicIds || [])
  if (!ids.size) return []
  const topicById = new Map((topics || []).map((topic) => [topic.id, topic]))
  return (findings || [])
    .filter(
      (other) => other.id !== finding.id && (other.topicIds || []).some((id) => ids.has(id))
    )
    .map((other) => ({
      finding: other,
      topics: (other.topicIds || [])
        .filter((id) => ids.has(id))
        .map((id) => topicById.get(id))
        .filter(Boolean)
    }))
}

function findingLabel(finding) {
  const explicit = String(finding?.title || '').trim()
  if (explicit) return explicit
  const line = String(finding?.body || '')
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean)
  return line || 'Sin título'
}

function clip(text, max = 42) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function ringPositions(count, radius) {
  if (!count) return []
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

/**
 * Deterministic local graph around one topic or finding.
 * Depth 1 is the direct links. Depth 2 adds the other courses and shared topics.
 */
export function buildLocalGraph({
  focusType,
  focusId,
  findings = [],
  topics = [],
  courseTitles = {},
  depth = 2
} = {}) {
  if (!focusId || (focusType !== 'topic' && focusType !== 'finding')) {
    return { nodes: [], edges: [], truncated: false }
  }

  const topicById = new Map(topics.map((topic) => [topic.id, topic]))
  const findingById = new Map(findings.map((finding) => [finding.id, finding]))
  const descriptors = []
  const links = []
  const seen = new Set()
  let truncated = false

  const add = (kind, id, label, extra = {}) => {
    const nodeId = `${kind}:${id}`
    if (seen.has(nodeId)) return nodeId
    seen.add(nodeId)
    descriptors.push({ nodeId, kind, id, label, ...extra })
    return nodeId
  }

  const link = (source, target) => {
    if (!source || !target || source === target) return
    links.push([source, target])
  }

  if (focusType === 'topic') {
    const topic = topicById.get(focusId)
    if (!topic) return { nodes: [], edges: [], truncated: false }
    const center = add('topic', topic.id, topic.title, { ring: 0 })
    const matched = findings.filter((finding) => (finding.topicIds || []).includes(topic.id))
    const shown = matched.slice(0, 24)
    if (matched.length > shown.length) truncated = true
    const courses = new Map()
    const extraTopics = new Map()
    for (const finding of shown) {
      const findingNode = add('finding', finding.id, findingLabel(finding), { ring: 1, finding })
      link(center, findingNode)
      for (const anchor of finding.anchors || []) {
        if (!anchor.coursePath) continue
        courses.set(anchor.coursePath, courseTitles[anchor.coursePath] || anchor.coursePath)
      }
      if (depth >= 2) {
        for (const topicId of finding.topicIds || []) {
          if (topicId === topic.id) continue
          const other = topicById.get(topicId)
          if (other) extraTopics.set(other.id, other.title)
        }
      }
    }
    if (depth >= 2) {
      for (const [coursePath, title] of courses) {
        const courseNode = add('course', coursePath, title, { ring: 2 })
        for (const finding of shown) {
          if ((finding.anchors || []).some((anchor) => anchor.coursePath === coursePath)) {
            link(`finding:${finding.id}`, courseNode)
          }
        }
      }
      const extra = [...extraTopics.entries()].slice(0, 16)
      if (extraTopics.size > extra.length) truncated = true
      for (const [topicId, title] of extra) {
        const topicNode = add('topic', topicId, title, { ring: 2 })
        for (const finding of shown) {
          if ((finding.topicIds || []).includes(topicId)) link(`finding:${finding.id}`, topicNode)
        }
      }
    }
  } else {
    const finding = findingById.get(focusId)
    if (!finding) return { nodes: [], edges: [], truncated: false }
    const center = add('finding', finding.id, findingLabel(finding), { ring: 0, finding })
    const topicIds = (finding.topicIds || []).filter((id) => topicById.has(id)).slice(0, 12)
    for (const topicId of topicIds) {
      const topicNode = add('topic', topicId, topicById.get(topicId).title, { ring: 1 })
      link(center, topicNode)
    }
    const coursePaths = []
    for (const anchor of finding.anchors || []) {
      if (!anchor.coursePath || coursePaths.includes(anchor.coursePath)) continue
      coursePaths.push(anchor.coursePath)
      const courseNode = add(
        'course',
        anchor.coursePath,
        courseTitles[anchor.coursePath] || anchor.coursePath,
        { ring: 1 }
      )
      link(center, courseNode)
    }
    if (depth >= 2 && topicIds.length) {
      const related = findings
        .filter(
          (other) =>
            other.id !== finding.id && (other.topicIds || []).some((id) => topicIds.includes(id))
        )
        .slice(0, 20)
      for (const other of related) {
        const otherNode = add('finding', other.id, findingLabel(other), { ring: 2, finding: other })
        for (const topicId of other.topicIds || []) {
          if (topicIds.includes(topicId)) link(`topic:${topicId}`, otherNode)
        }
      }
    }
  }

  const rings = [[], [], []]
  for (const item of descriptors) rings[item.ring || 0].push(item)
  const positions = new Map()
  positions.set(rings[0][0]?.nodeId, { x: 0, y: 0 })
  ringPositions(rings[1].length, 240).forEach((point, index) => {
    positions.set(rings[1][index].nodeId, point)
  })
  ringPositions(rings[2].length, 440).forEach((point, index) => {
    positions.set(rings[2][index].nodeId, point)
  })

  const kindLabel = { topic: 'Tema', finding: 'Anotación', course: 'Curso' }
  const nodes = descriptors.map((item) => {
    const point = positions.get(item.nodeId) || { x: 0, y: 0 }
    return {
      id: item.nodeId,
      type: 'knowledge',
      position: { x: point.x - 84, y: point.y - 28 },
      data: {
        kind: item.kind,
        kindLabel: kindLabel[item.kind] || item.kind,
        label: clip(item.label),
        refId: item.id,
        active: item.nodeId === `${focusType}:${focusId}`
      },
      draggable: false,
      selectable: true
    }
  })

  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = []
  const edgeIds = new Set()
  for (const [source, target] of links) {
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue
    const id = `${source}->${target}`
    if (edgeIds.has(id)) continue
    edgeIds.add(id)
    edges.push({
      id,
      source,
      target,
      type: 'straight',
      style: { stroke: 'rgba(42, 36, 56, 0.38)', strokeWidth: 1.5 }
    })
  }

  return { nodes, edges, truncated }
}
