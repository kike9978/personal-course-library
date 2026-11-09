import { createHash } from 'node:crypto'
import { resolveCourseTitle } from './knowledgeGraph.js'

const RICH_TEXT_LIMIT = 2000

const TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
  'code',
  'toggle'
])

export function normalizeTitle(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeBody(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Hash of the title and body after the cleanup both sides share. */
export function wireHash(title, body) {
  const payload = `${normalizeTitle(title)}\n${normalizeBody(body)}`
  return createHash('sha256').update(payload).digest('hex')
}

function folderName(coursePath) {
  const text = String(coursePath || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
  return text.split('/').pop() || ''
}

function fileLabel(relativePath) {
  const base = String(relativePath || '')
    .split(/[/\\]/)
    .pop()
  const name = String(base || '').replace(/\.[^.]+$/, '')
  return (
    name
      .replace(/^[\[\(]?\d+[\]\)]?[.\-_\s]+/g, '')
      .replace(/^(\d+[.\-_])+/g, '')
      .replace(/\s+/g, ' ')
      .trim() ||
    name ||
    'Archivo'
  )
}

/**
 * Where a note sits in the same tree as Por archivo:
 * course page, then the file or project page when that level exists.
 */
export function notionPlace(finding, courseTitles = {}) {
  const anchor = (Array.isArray(finding?.anchors) ? finding.anchors : [])[0] || {}
  const coursePath = anchor.coursePath || null
  const courseTitle = coursePath ? resolveCourseTitle(coursePath, courseTitles) : 'Sin curso'
  let fileTitle = null
  if (anchor.projectId) fileTitle = String(anchor.projectTitle || '').trim() || 'Proyecto'
  else if (anchor.lessonRelativePath) {
    fileTitle = String(anchor.lessonTitle || '').trim() || fileLabel(anchor.lessonRelativePath)
  } else if (coursePath) fileTitle = 'Del curso'
  if (fileTitle && fileTitle.trim().toLowerCase() === courseTitle.trim().toLowerCase()) {
    fileTitle = null
  }
  const courseKey = `course:${coursePath ? folderName(coursePath) : '__loose__'}`
  const fileKey = fileTitle
    ? `file:${courseKey}::${anchor.projectId || anchor.lessonRelativePath || '__course__'}`
    : null
  return { courseTitle, fileTitle, courseKey, fileKey }
}

function formatNotionId(hex) {
  const value = String(hex || '')
    .replace(/-/g, '')
    .toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(value)) return ''
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function collectNotionIds(text, ignored) {
  const found = []
  const push = (hex) => {
    const id = formatNotionId(hex)
    if (!id || id.replace(/-/g, '') === ignored || found.includes(id)) return
    found.push(id)
  }
  for (const match of String(text || '').matchAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  )) {
    push(match[0])
  }
  for (const match of String(text || '').matchAll(/[0-9a-f]{32}/gi)) push(match[0])
  return found
}

/** Path id first. The `?v=` value is a view, not a database. */
export function databaseIdCandidates(input) {
  const text = String(input || '').trim()
  if (!text) return []
  const ignored = (text.match(/[?#&]v=([0-9a-f]{32})\b/i) || [])[1]?.toLowerCase() || ''
  const path = text.split(/[?#]/)[0]
  const ids = collectNotionIds(path, ignored)
  for (const id of collectNotionIds(text, ignored)) {
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

export function normalizeDatabaseId(input) {
  return databaseIdCandidates(input)[0] || ''
}

export function chunkRichText(text) {
  const value = String(text || '')
  if (!value) return []
  const parts = []
  for (let index = 0; index < value.length; index += RICH_TEXT_LIMIT) {
    parts.push({ type: 'text', text: { content: value.slice(index, index + RICH_TEXT_LIMIT) } })
  }
  return parts
}

export function plainRichText(items) {
  return (items || []).map((item) => item.plain_text ?? item.text?.content ?? '').join('')
}

/** One markdown code block so a note is a single Notion write. */
export function bodyToBlocks(body) {
  const text = normalizeBody(body)
  if (!text) return []
  return [
    {
      object: 'block',
      type: 'code',
      code: {
        language: 'markdown',
        rich_text: chunkRichText(text)
      }
    }
  ]
}

export function blocksToBody(blocks) {
  const parts = []
  for (const block of blocks || []) {
    const type = block?.type
    if (!TEXT_BLOCK_TYPES.has(type)) continue
    parts.push(plainRichText(block[type]?.rich_text))
  }
  return normalizeBody(parts.join('\n'))
}

/**
 * What one reconcile should do.
 * `create` writes a new page. `push` and `pull` copy the side that moved.
 * `relink` repairs the cursor when the texts already match.
 * `conflict` waits until someone chooses a side.
 */
export function decideSync({ hasRemote, localHash, remoteHash, ackedHash }) {
  if (!hasRemote) return 'create'
  if (localHash && localHash === remoteHash) return 'relink'
  if (!ackedHash) return 'conflict'
  const localChanged = localHash !== ackedHash
  const remoteChanged = remoteHash !== ackedHash
  if (localChanged && remoteChanged) return 'conflict'
  if (localChanged) return 'push'
  if (remoteChanged) return 'pull'
  return 'relink'
}

/** A local delete whose page also changed waits. An untouched page is archived. */
export function decideDelete({ hasRemote, remoteHash, ackedHash }) {
  if (!hasRemote) return 'drop'
  if (ackedHash && remoteHash === ackedHash) return 'archive'
  return 'conflict'
}

export function notionErrorMessage({ status, code, message } = {}) {
  if (status === 401 || code === 'unauthorized') return 'El token de Notion no es válido'
  if (status === 403) return 'La integración no tiene acceso a esa base de Notion'
  if (status === 404 || code === 'object_not_found') {
    return 'Notion no encuentra esa base. Ábrela, elige ··· → Conexiones y añade la integración.'
  }
  if (status === 429) return 'Notion está limitando las peticiones. Se reintenta solo.'
  return message || 'No se pudo hablar con Notion'
}

export function isRetryableNotionError(error) {
  const status = error?.status
  if (status === 429 || status === 0 || (typeof status === 'number' && status >= 500)) return true
  return false
}
