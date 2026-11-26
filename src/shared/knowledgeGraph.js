/**
 * Findings, topics, and the library graph.
 * A finding is a note. A topic is a library-wide idea. An anchor is where a finding was seen.
 * The graph is one view with two modes: topics (tags and objects) and courses (pages).
 */

export const FINDING_REVEAL_BUDGET = 24
export const EDGE_CAP = 2000
export const LABEL_ZOOM = 1.15
export const LABEL_ZOOM_MIN = 0.35
export const LABEL_ZOOM_MAX = 2.4

export function clampDepth(depth) {
  const value = Number(depth)
  if (!Number.isFinite(value)) return 1
  return Math.min(5, Math.max(1, Math.round(value)))
}

export function clampLinkDistance(distance) {
  const value = Number(distance)
  if (!Number.isFinite(value)) return 72
  return Math.min(180, Math.max(36, Math.round(value)))
}

export function clampLabelZoom(zoom) {
  const value = Number(zoom)
  if (!Number.isFinite(value)) return LABEL_ZOOM
  const clamped = Math.min(LABEL_ZOOM_MAX, Math.max(LABEL_ZOOM_MIN, value))
  return Math.round(clamped * 20) / 20
}

export function normalizeGraphMode(viewMode) {
  return viewMode === 'courses' ? 'courses' : 'topics'
}

const MENTION_RE =
  /@\[(lesson|project|course|topic)\|([^\]]+)]\(([^)]+)\)|\[\[(lesson|project|course|topic|note)\|([^\]|]+)\|([^\]]+)\]\]/g

export function parseMentions(markdown) {
  const mentions = []
  const text = String(markdown || '')
  MENTION_RE.lastIndex = 0
  let match = MENTION_RE.exec(text)
  while (match) {
    mentions.push(
      match[1]
        ? { type: match[1], title: match[2], id: match[3] }
        : { type: match[4], title: match[5], id: match[6] }
    )
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

/** Tag titles written as #name in the note body. Headings (# Title) are not tags. */
export function hashtagTitlesFromBody(markdown) {
  const text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
  const titles = []
  const seen = new Set()
  const pattern = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu
  let match = pattern.exec(text)
  while (match) {
    const title = normalizeTopicTitle(match[2])
    const key = topicKey(title)
    if (key && !seen.has(key)) {
      seen.add(key)
      titles.push(title)
    }
    match = pattern.exec(text)
  }
  return titles
}

const HASHTAG_TOKEN = /^[\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*$/u

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripTopicFromPlain(text, { id, title }) {
  let next = String(text || '')
  if (id) {
    const idEsc = escapeRegExp(id)
    next = next.replace(new RegExp(`\\[\\[topic\\|[^\\]|]*\\|${idEsc}\\]\\]`, 'g'), '')
    next = next.replace(new RegExp(`@\\[topic\\|[^\\]]*\\]\\(${idEsc}\\)`, 'g'), '')
  }
  const normalized = normalizeTopicTitle(title)
  if (normalized) {
    const titleEsc = escapeRegExp(normalized)
    next = next.replace(new RegExp(`\\[\\[topic\\|${titleEsc}\\|[^\\]]+\\]\\]`, 'gi'), '')
    next = next.replace(new RegExp(`@\\[topic\\|${titleEsc}\\]\\([^)]+\\)`, 'gi'), '')
    if (HASHTAG_TOKEN.test(normalized)) {
      const token = escapeRegExp(normalized)
      next = next.replace(
        new RegExp(`(^|[^\\p{L}\\p{N}_])#${token}(?![\\p{L}\\p{N}_])`, 'giu'),
        (match, lead, offset, whole) => {
          if (!lead) return ''
          const after = whole[offset + match.length] || ''
          if (/\s/.test(lead) && /[\s.,;:!?]/.test(after)) return ''
          return lead
        }
      )
    }
  }
  return next.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([.,;:!?])/g, '$1')
}

/** Remove one tag from markdown: #title, [[topic|title|id]], and the legacy mention. */
export function stripTopicFromMarkdown(markdown, topic = {}) {
  const source = String(markdown || '')
  const parts = source.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part
        .split(/(`[^`\n]*`)/g)
        .map((chunk, chunkIndex) =>
          chunkIndex % 2 === 1 ? chunk : stripTopicFromPlain(chunk, topic)
        )
        .join('')
    })
    .join('')
}

function courseFolderName(coursePath) {
  return String(coursePath || '').split(/[\\/]/).filter(Boolean).pop() || ''
}

export function sameCourse(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (!left || !right) return false
  if (left === right) return true
  const leftBase = courseFolderName(left)
  const rightBase = courseFolderName(right)
  return leftBase === right || rightBase === left || leftBase === rightBase
}

/** Title from courseProps.json, matched by folder even when the stored path differs. */
export function resolveCourseTitle(coursePath, courseTitles = {}) {
  const folder = courseFolderName(coursePath)
  const named = (title) => {
    const value = String(title || '').trim()
    if (!value || value === coursePath || (folder && value === folder)) return ''
    return value
  }
  const direct = named(courseTitles[coursePath]) || (folder ? named(courseTitles[folder]) : '')
  if (direct) return direct
  for (const [key, title] of Object.entries(courseTitles)) {
    if (!sameCourse(key, coursePath)) continue
    const value = named(title)
    if (value) return value
  }
  return (
    String(courseTitles[coursePath] || '').trim() ||
    (folder ? String(courseTitles[folder] || '').trim() : '') ||
    folder ||
    String(coursePath || '')
  )
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

/** Notes whose body links to this note with [[note|title|id]]. */
export function backlinksTo(finding, findings) {
  const id = finding?.id
  if (!id) return []
  return (findings || []).filter((other) => {
    if (!other || other.id === id) return false
    return parseMentions(other.body).some((mention) => mention.type === 'note' && mention.id === id)
  })
}

export const DEFAULT_NOTE_TITLE = 'new note'

/** "new note", "new note 2", "new note 1:23", or "new note 1:23 2". */
const DEFAULT_NOTE_TITLE_RE = /^new note(?: (\d+:\d{2}(?::\d{2})?))?(?: (\d+))?$/i

export function isDefaultNoteTitle(title) {
  return DEFAULT_NOTE_TITLE_RE.test(String(title || '').trim())
}

/** Seconds encoded in a placeholder title such as "new note 1:23". */
export function defaultTitleTimeSec(title) {
  const match = String(title || '').trim().match(DEFAULT_NOTE_TITLE_RE)
  if (!match?.[1]) return null
  const parts = match[1].split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + parts[1]
}

/**
 * Words a person wrote. Images, embeds, and bare media urls are removed so a
 * playback mark never shows a file path.
 */
export function plainNoteText(markdown) {
  let text = String(markdown || '')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  text = text.replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ')
  text = text.replace(/!\[[^\]]*\]/g, ' ')
  text = text.replace(/<img\b[^>]*>/gi, ' ')
  text = text.replace(
    /@\[(?:lesson|project|course|topic)\|([^\]]+)]\([^)]+\)|\[\[(?:lesson|project|course|topic|note)\|([^\]|]+)\|[^\]]+\]\]/g,
    (_, atTitle, bracketTitle) => ` ${atTitle || bracketTitle || ''} `
  )
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, (_, label) => {
    const value = String(label || '').trim()
    if (!value || /^(https?:|course-media:|file:)/i.test(value) || /^[\w./-]+\.\w{2,5}$/.test(value)) {
      return ' '
    }
    return ` ${value} `
  })
  text = text.replace(/`([^`\n]*)`/g, '$1')
  text = text.replace(/^#{1,6}\s+/gm, '')
  text = text.replace(/^\s*>\s?/gm, '')
  text = text.replace(/^\s*([-*_])\1{2,}\s*$/gm, ' ')
  text = text.replace(/[*_~]/g, '')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/**
 * Name shown for a note. A title the person typed wins. Otherwise the words
 * in the body, with images and media paths left out. Empty when there is neither.
 */
export function noteTextTitle(note, max = 72) {
  const stored = String(note?.title || '').trim()
  const custom = stored && !isDefaultNoteTitle(stored) ? stored : ''
  const text = custom || plainNoteText(note?.body)
  if (!text) return ''
  if (!max || text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/** Placeholder Notion uses when a note has no name of its own. */
const UNTITLED_PLACEHOLDER_RE = /^sin t[ií]tulo$/i

/**
 * Name shown in the outline. A typed title or the words in the body win.
 * An empty bookmark is named by its video clock instead of "Sin título".
 */
export function outlineNoteTitle(note, max = 72) {
  const stored = String(note?.title || '').trim()
  const source = UNTITLED_PLACEHOLDER_RE.test(stored) ? { ...note, title: '' } : note
  const text = noteTextTitle(source, max)
  if (text) return text
  return formatNoteTimestamp(note?.timeSec)
}

/** Mark label: the note's name, otherwise the caller's fallback. */
export function playbackMarkLabel(note, defaultName, max = 72) {
  const label = noteTextTitle(note, 0) || String(defaultName || '').trim()
  if (!label) return ''
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

/** Clock label for a video position, matching the note timestamp suffix. */
export function formatNoteTimestamp(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return ''
  const total = Math.max(0, Math.floor(sec))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function noteHasTime(note) {
  if (typeof note?.timeSec === 'number') return true
  return (note?.anchors || []).some((anchor) => typeof anchor.timeSec === 'number')
}

/**
 * Remove stored "new note" placeholders so the name can come from the body.
 * When the only copy of a video position is the clock in that placeholder,
 * it is written onto the first anchor that can hold it.
 * Returns how many notes changed.
 */
export function clearDefaultNoteTitles(notes, now = Date.now()) {
  let changed = 0
  for (const note of notes || []) {
    const title = String(note?.title || '').trim()
    if (!note || !isDefaultNoteTitle(title)) continue
    const sec = defaultTitleTimeSec(title)
    if (sec != null && !noteHasTime(note)) {
      const anchors = Array.isArray(note.anchors) ? note.anchors : []
      const anchor = anchors.find((item) => item && !item.projectId) || anchors[0]
      if (anchor) anchor.timeSec = sec
    }
    note.title = null
    note.updatedAt = now
    changed += 1
  }
  return changed
}

/** Display names for notes that have a typed title or written text. */
export function noteDisplayTitles(notes) {
  const labels = new Map()
  for (const note of notes || []) {
    if (!note?.id) continue
    const title = noteTextTitle(note)
    if (title) labels.set(note.id, title)
  }
  return labels
}

function findingLabel(finding) {
  return noteTextTitle(finding, 0)
}

function clip(text, max = 24) {
  const value = String(text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function fileName(path) {
  return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'Archivo'
}

function filesOf(finding) {
  const files = []
  const seen = new Set()
  const add = (file) => {
    if (!file?.id || seen.has(file.id)) return
    seen.add(file.id)
    files.push(file)
  }
  for (const anchor of finding?.anchors || []) {
    if (anchor.projectId) {
      add({
        id: `project:${anchor.coursePath || ''}:${anchor.projectId}`,
        label: anchor.projectTitle || 'Proyecto',
        coursePath: anchor.coursePath || null,
        lessonRelativePath: null,
        projectId: anchor.projectId
      })
    } else if (anchor.lessonRelativePath) {
      add({
        id: `lesson:${anchor.coursePath || ''}:${anchor.lessonRelativePath}`,
        label: anchor.lessonTitle || fileName(anchor.lessonRelativePath),
        coursePath: anchor.coursePath || null,
        lessonRelativePath: anchor.lessonRelativePath,
        projectId: null
      })
    }
  }
  if (!files.length) {
    if (finding?.projectId) {
      add({
        id: `project:${finding.coursePath || ''}:${finding.projectId}`,
        label: finding.projectTitle || 'Proyecto',
        coursePath: finding.coursePath || null,
        lessonRelativePath: null,
        projectId: finding.projectId
      })
    } else if (finding?.lessonRelativePath) {
      add({
        id: `lesson:${finding.coursePath || ''}:${finding.lessonRelativePath}`,
        label: finding.lessonTitle || fileName(finding.lessonRelativePath),
        coursePath: finding.coursePath || null,
        lessonRelativePath: finding.lessonRelativePath,
        projectId: null
      })
    }
  }
  return files
}

const KIND_LABEL = { topic: 'Tag', finding: 'Anotación', course: 'Curso', file: 'Archivo' }

function ringPositions(count, radius) {
  if (!count) return []
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })
}

function phyllotaxis(index) {
  const angle = index * 2.399963229728653
  const radius = 28 * Math.sqrt(index + 1)
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function nodeRecord(kind, id, label, point) {
  return {
    id: `${kind}:${id}`,
    x: point.x,
    y: point.y,
    data: {
      kind,
      kindLabel: KIND_LABEL[kind] || kind,
      label: clip(label),
      fullLabel: String(label || '').trim() || clip(label),
      refId: id
    }
  }
}

function courseKeys(finding) {
  const paths = coursePathsOf(finding)
  if (!paths.length && finding?.coursePath) paths.push(finding.coursePath)
  return paths
}

function coursePathsOf(finding) {
  const paths = []
  for (const anchor of finding?.anchors || []) {
    if (!anchor.coursePath || paths.some((path) => sameCourse(path, anchor.coursePath))) continue
    paths.push(anchor.coursePath)
  }
  return paths
}

function rememberCourse(courses, coursePath) {
  const existing = courses.find((path) => sameCourse(path, coursePath))
  if (existing) return existing
  courses.push(coursePath)
  return coursePath
}

function addEdge(edges, seen, source, target, edgeType, label, extra = null) {
  if (!source || !target || source === target) return false
  const directed = edgeType === 'topic' || edgeType === 'file' || edgeType === 'course' || edgeType === 'link'
  const [from, to] = directed ? [source, target] : [source, target].sort()
  const id = directed ? `${from}->${to}` : `${edgeType}:${from}<->${to}`
  if (seen.has(id)) return false
  if (edges.length >= EDGE_CAP) return false
  seen.add(id)
  edges.push({ id, source: from, target: to, edgeType, label: label || '', ...(extra || {}) })
  return true
}

function buildTopicsGraph(findings, topics, courseTitles = {}) {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]))
  const used = new Map()
  for (const finding of findings) {
    for (const topicId of finding.topicIds || []) {
      const topic = topicById.get(topicId)
      if (!topic || used.has(topic.id)) continue
      used.set(topic.id, topic)
    }
  }
  const topicList = [...used.values()].sort((a, b) =>
    String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' })
  )
  const topicPoints = new Map()
  if (topicList.length === 1) topicPoints.set(topicList[0].id, { x: 0, y: 0 })
  else {
    const radius = Math.max(180, topicList.length * 36)
    ringPositions(topicList.length, radius).forEach((point, index) => {
      topicPoints.set(topicList[index].id, point)
    })
  }

  const findingList = findings
    .filter((finding) => (finding.topicIds || []).some((id) => used.has(id)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const byTopic = new Map()
  for (const finding of findingList) {
    const primary = (finding.topicIds || []).find((id) => used.has(id))
    if (!byTopic.has(primary)) byTopic.set(primary, [])
    byTopic.get(primary).push(finding)
  }

  const nodes = topicList.map((topic) => nodeRecord('topic', topic.id, topic.title, topicPoints.get(topic.id)))
  for (const [topicId, group] of byTopic) {
    const origin = topicPoints.get(topicId)
    group.forEach((finding, index) => {
      const angle = (2 * Math.PI * index) / group.length
      nodes.push(
        nodeRecord('finding', finding.id, findingLabel(finding), {
          x: origin.x + Math.cos(angle) * 46,
          y: origin.y + Math.sin(angle) * 46
        })
      )
    })
  }

  const untagged = findings
    .filter((finding) => !(finding.topicIds || []).some((id) => used.has(id)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const noteLinked = (finding) =>
    untagged.concat(findingList).some(
      (other) =>
        other.id !== finding.id &&
        (filesOf(finding).some((file) => filesOf(other).some((candidate) => candidate.id === file.id)) ||
          courseKeys(finding).some((path) => courseKeys(other).some((candidate) => sameCourse(path, candidate))))
    )
  const attached = untagged.filter((finding) => noteLinked(finding))
  const orphans = untagged.filter((finding) => !noteLinked(finding))
  const placedPoints = new Map(nodes.filter((node) => node.data.kind === 'finding').map((node) => [node.data.refId, node]))
  const pending = [...attached]
  let placedAttached = true
  while (pending.length && placedAttached) {
    placedAttached = false
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const finding = pending[index]
      const neighbors = untagged.concat(findingList).filter(
        (other) =>
          other.id !== finding.id &&
          placedPoints.has(other.id) &&
          (filesOf(finding).some((file) => filesOf(other).some((candidate) => candidate.id === file.id)) ||
            courseKeys(finding).some((path) => courseKeys(other).some((candidate) => sameCourse(path, candidate))))
      )
      if (!neighbors.length) continue
      const origin = neighbors.reduce(
        (sum, other) => {
          const point = placedPoints.get(other.id)
          return { x: sum.x + point.x, y: sum.y + point.y }
        },
        { x: 0, y: 0 }
      )
      const spot = {
        x: origin.x / neighbors.length + 28,
        y: origin.y / neighbors.length + 18
      }
      const node = nodeRecord('finding', finding.id, findingLabel(finding), spot)
      node.data.orphan = true
      nodes.push(node)
      placedPoints.set(finding.id, node)
      pending.splice(index, 1)
      placedAttached = true
    }
  }
  if (pending.length) {
    const clusterRadius = topicList.length ? Math.max(200, (topicList.length > 1 ? Math.max(180, topicList.length * 36) : 0) + 140) : 140
    ringPositions(pending.length, clusterRadius).forEach((point, index) => {
      const node = nodeRecord('finding', pending[index].id, findingLabel(pending[index]), point)
      node.data.orphan = true
      nodes.push(node)
      placedPoints.set(pending[index].id, node)
    })
  }
  const topicRadius = topicList.length > 1 ? Math.max(180, topicList.length * 36) : 0
  const orphanRadius = topicList.length || attached.length
    ? Math.max(260, topicRadius + 220)
    : Math.max(120, orphans.length * 28)
  const orphanPoints =
    orphans.length === 1 && !topicList.length && !attached.length
      ? [{ x: 0, y: 0 }]
      : ringPositions(orphans.length, orphanRadius)
  orphans.forEach((finding, index) => {
    const node = nodeRecord('finding', finding.id, findingLabel(finding), orphanPoints[index])
    node.data.orphan = true
    nodes.push(node)
  })

  const placed = [...findingList, ...attached, ...orphans]
  const edges = []
  const seen = new Set()
  let truncated = false
  for (const finding of findingList) {
    for (const topicId of finding.topicIds || []) {
      if (!used.has(topicId)) continue
      const added = addEdge(edges, seen, `finding:${finding.id}`, `topic:${topicId}`, 'topic', '')
      if (!added && edges.length >= EDGE_CAP) truncated = true
    }
  }

  const files = new Map()
  for (const finding of placed) {
    for (const file of filesOf(finding)) {
      if (!files.has(file.id)) files.set(file.id, { ...file, findingIds: [] })
      files.get(file.id).findingIds.push(finding.id)
    }
  }
  const findingPoint = new Map(nodes.filter((node) => node.data.kind === 'finding').map((node) => [node.id, node]))
  for (const file of files.values()) {
    const points = file.findingIds
      .map((id) => findingPoint.get(`finding:${id}`))
      .filter(Boolean)
    const origin = points.reduce(
      (sum, node) => ({ x: sum.x + node.x, y: sum.y + node.y }),
      { x: 0, y: 0 }
    )
    const node = nodeRecord('file', file.id, file.label, {
      x: origin.x / Math.max(points.length, 1) + 36,
      y: origin.y / Math.max(points.length, 1) - 28
    })
    node.data.coursePath = file.coursePath
    node.data.lessonRelativePath = file.lessonRelativePath
    node.data.projectId = file.projectId
    nodes.push(node)
    for (const findingId of file.findingIds) {
      const added = addEdge(edges, seen, `finding:${findingId}`, node.id, 'file', '')
      if (!added && edges.length >= EDGE_CAP) truncated = true
    }
  }

  const coursePaths = []
  const courseMembers = new Map()
  for (const finding of placed) {
    const rawPaths = coursePathsOf(finding)
    if (!rawPaths.length && finding.coursePath) rawPaths.push(finding.coursePath)
    for (const raw of rawPaths) {
      const path = rememberCourse(coursePaths, raw)
      if (!courseMembers.has(path)) courseMembers.set(path, [])
      courseMembers.get(path).push(finding.id)
    }
  }
  // A note seen in a lesson reaches its course through that lesson. Its direct
  // course edge is marked implied: drawn only when lesson nodes are hidden.
  const placedById = new Map(placed.map((finding) => [finding.id, finding]))
  for (const [path, findingIds] of courseMembers) {
    const points = findingIds.map((id) => findingPoint.get(`finding:${id}`)).filter(Boolean)
    const origin = points.reduce((sum, node) => ({ x: sum.x + node.x, y: sum.y + node.y }), { x: 0, y: 0 })
    const node = nodeRecord('course', path, resolveCourseTitle(path, courseTitles), {
      x: origin.x / Math.max(points.length, 1) - 42,
      y: origin.y / Math.max(points.length, 1) + 34
    })
    nodes.push(node)
    for (const findingId of findingIds) {
      const viaFile = filesOf(placedById.get(findingId)).some((file) =>
        sameCourse(file.coursePath, path)
      )
      const added = addEdge(
        edges,
        seen,
        `finding:${findingId}`,
        node.id,
        'course',
        '',
        viaFile ? { implied: true } : null
      )
      if (!added && edges.length >= EDGE_CAP) truncated = true
    }
  }
  for (const file of files.values()) {
    const path = file.coursePath && coursePaths.find((item) => sameCourse(item, file.coursePath))
    if (!path) continue
    const added = addEdge(edges, seen, `file:${file.id}`, `course:${path}`, 'course', '')
    if (!added && edges.length >= EDGE_CAP) truncated = true
  }

  const placedIds = new Set(placed.map((finding) => finding.id))
  for (const finding of placed) {
    for (const mention of parseMentions(finding.body)) {
      if (mention.type !== 'note' || !placedIds.has(mention.id)) continue
      const added = addEdge(edges, seen, `finding:${finding.id}`, `finding:${mention.id}`, 'link', '')
      if (!added && edges.length >= EDGE_CAP) truncated = true
    }
  }

  return { nodes, edges, viewMode: 'topics', truncated }
}

function buildCoursesGraph(findings, topics, courseTitles) {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]))
  const courses = []
  const shared = new Map()
  for (const finding of findings) {
    const paths = coursePathsOf(finding).map((path) => rememberCourse(courses, path))
    if (paths.length < 2) continue
    const topicIds = (finding.topicIds || []).filter((id) => topicById.has(id))
    if (!topicIds.length) continue
    for (let i = 0; i < paths.length; i += 1) {
      for (let j = i + 1; j < paths.length; j += 1) {
        const [left, right] = [paths[i], paths[j]].sort()
        if (!shared.has(left)) shared.set(left, new Map())
        if (!shared.get(left).has(right)) shared.get(left).set(right, new Set())
        for (const topicId of topicIds) shared.get(left).get(right).add(topicId)
      }
    }
  }

  const edges = []
  const seen = new Set()
  let truncated = false
  const linked = new Set()
  const pairs = []
  for (const [left, rights] of shared) {
    for (const [right, topicIds] of rights) pairs.push([left, right, topicIds])
  }
  pairs.sort((a, b) => `${a[0]}\0${a[1]}`.localeCompare(`${b[0]}\0${b[1]}`))
  for (const [left, right, topicIds] of pairs) {
    const ids = [...topicIds]
    const label = ids.length === 1 ? topicById.get(ids[0]).title : `${ids.length} temas`
    const added = addEdge(edges, seen, `course:${left}`, `course:${right}`, 'shared-topic', label)
    if (!added) {
      truncated = edges.length >= EDGE_CAP
      break
    }
    linked.add(left)
    linked.add(right)
  }

  const ordered = [...courses].sort((a, b) =>
    resolveCourseTitle(a, courseTitles).localeCompare(resolveCourseTitle(b, courseTitles), undefined, {
      sensitivity: 'base'
    })
  )
  const linkedPaths = ordered.filter((path) => linked.has(path))
  const loosePaths = ordered.filter((path) => !linked.has(path))
  const linkedPoints = linkedPaths.map((_, index) => phyllotaxis(index))
  const maxRadius = linkedPoints.reduce((max, point) => Math.max(max, Math.hypot(point.x, point.y)), 0)
  const outer = loosePaths.length
    ? ringPositions(loosePaths.length, Math.max(168, maxRadius + 128))
    : []
  const points = new Map()
  linkedPaths.forEach((path, index) => points.set(path, linkedPoints[index]))
  loosePaths.forEach((path, index) => points.set(path, outer[index]))
  if (!linkedPaths.length && loosePaths.length === 1) points.set(loosePaths[0], { x: 0, y: 0 })

  const nodes = ordered.map((path) =>
    nodeRecord('course', path, resolveCourseTitle(path, courseTitles), points.get(path))
  )
  return { nodes, edges, viewMode: 'courses', truncated }
}

/**
 * Library graph. Topics mode is tags, the notes that use them, and notes with no tag.
 * An orphan note has no tag. A shared course or file is not a link to another note.
 * Structure is a tree: note -> lesson -> course. A note's direct course edge is
 * `implied` when a lesson already carries it, so views draw it only with lessons hidden.
 * Courses mode is every course that holds a note, linked when one note sits in two courses and carries a topic.
 */
export function buildGlobalGraph({
  viewMode = 'topics',
  findings = [],
  topics = [],
  courseTitles = {}
} = {}) {
  const mode = normalizeGraphMode(viewMode)
  const safeFindings = findings || []
  const safeTopics = topics || []
  if (mode === 'courses') return buildCoursesGraph(safeFindings, safeTopics, courseTitles || {})
  return buildTopicsGraph(safeFindings, safeTopics, courseTitles || {})
}

function adjacency(edges) {
  const map = new Map()
  const add = (id, edge) => {
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(edge)
  }
  for (const edge of edges) {
    add(edge.source, edge)
    add(edge.target, edge)
  }
  return map
}

function neighborhood(nodes, edges, selectedId, depth) {
  const selected = nodes.find((node) => node.id === selectedId)
  const adj = adjacency(edges)
  const ids = new Set([selectedId])
  let frontier = [selectedId]
  let truncated = false
  for (let hop = 1; hop <= depth; hop += 1) {
    const next = []
    let findingBudget = FINDING_REVEAL_BUDGET
    for (const id of frontier) {
      for (const edge of adj.get(id) || []) {
        const other = edge.source === id ? edge.target : edge.source
        if (ids.has(other)) continue
        const budgeted = hop === 1 && selected?.data?.kind === 'topic' && edge.edgeType === 'topic'
        if (budgeted) {
          if (findingBudget <= 0) {
            truncated = true
            continue
          }
          findingBudget -= 1
        }
        ids.add(other)
        next.push(other)
      }
    }
    frontier = next
  }
  return { ids: [...ids], truncated }
}

/**
 * Both modes keep the whole graph on screen.
 * A selection highlights the neighborhood and dims the rest.
 * Tags mode draws each tag with the notes it connects to.
 */
export function visibleGraph({
  nodes = [],
  edges = [],
  selectedId = null,
  depth = 1,
  viewMode = 'topics'
} = {}) {
  const mode = normalizeGraphMode(viewMode)
  const depthN = clampDepth(depth)
  const known = selectedId && nodes.some((node) => node.id === selectedId)
  if (!known) return { highlightIds: null, truncated: false }
  const next = neighborhood(nodes, edges, selectedId, depthN)
  return {
    highlightIds: next.ids,
    truncated: mode === 'topics' ? next.truncated : false
  }
}
