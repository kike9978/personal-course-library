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
  let fileKind = null
  if (fileTitle && anchor.projectId) fileKind = 'project'
  else if (fileTitle && anchor.lessonRelativePath) fileKind = 'lesson'
  else if (fileTitle) fileKind = 'course'
  const fileKey = fileTitle
    ? `file:${courseKey}::${anchor.projectId || anchor.lessonRelativePath || '__course__'}`
    : null
  return { courseTitle, fileTitle, courseKey, fileKey, fileKind }
}

/** Caption on the file page so another install can find the same page. */
export function filePageMarker(place) {
  if (!place?.fileKey) return ''
  const kind = place.fileKind || 'course'
  return `node:${place.fileKey}@${kind}`
}

function blockCaption(block) {
  const type = block?.type
  return plainRichText(block?.[type]?.caption).trim()
}

/** Id carried on the note page itself. Nested pages cannot hold database properties. */
export function findingIdFromBlocks(blocks) {
  for (const block of blocks || []) {
    const caption = blockCaption(block)
    if (caption.startsWith('finding:')) return caption.slice('finding:'.length).trim()
  }
  return ''
}

export function playlistIdFromBlocks(blocks) {
  for (const block of blocks || []) {
    const caption = blockCaption(block)
    if (caption.startsWith('playlist:')) return caption.slice('playlist:'.length).trim()
  }
  return ''
}

/** Shared list fields. Position, size, and collapsed stay on this machine. */
export function playlistWire(playlist) {
  const rawWhys =
    playlist?.courseWhys && typeof playlist.courseWhys === 'object' ? playlist.courseWhys : {}
  const courseWhys = {}
  for (const key of Object.keys(rawWhys).sort()) courseWhys[key] = String(rawWhys[key] ?? '')
  const body = normalizeBody(
    JSON.stringify({
      why: String(playlist?.why || ''),
      coursePaths: Array.isArray(playlist?.coursePaths) ? playlist.coursePaths.map(String) : [],
      childIds: Array.isArray(playlist?.childIds) ? playlist.childIds.map(String) : [],
      courseWhys
    })
  )
  return { title: normalizeTitle(playlist?.title) || 'Nueva lista', body }
}

export function playlistFromBody(body) {
  try {
    const data = JSON.parse(String(body || ''))
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return {
      why: String(data.why || ''),
      coursePaths: Array.isArray(data.coursePaths) ? data.coursePaths.map(String) : [],
      childIds: Array.isArray(data.childIds) ? data.childIds.map(String) : [],
      courseWhys:
        data.courseWhys && typeof data.courseWhys === 'object' && !Array.isArray(data.courseWhys)
          ? data.courseWhys
          : {}
    }
  } catch {
    return null
  }
}

export function markerFromBlocks(blocks) {
  for (const block of blocks || []) {
    const caption = blockCaption(block)
    if (caption.startsWith('node:')) return caption
  }
  return ''
}

export function fileKeyFromMarker(marker) {
  const raw = String(marker || '').replace(/^node:/, '')
  const fileKey = raw.replace(/@(lesson|project|course)$/, '')
  return fileKey.startsWith('file:') ? fileKey : ''
}

/**
 * Rebuild the sidebar anchor from the course row and the file page.
 * A file page that was never stamped falls back to its title.
 */
export function anchorFromNotion({ courseMarker, fileMarker, fileTitle, filePageId } = {}) {
  const courseKey = String(courseMarker || '').replace(/^node:/, '')
  const folder = courseKey.startsWith('course:') ? courseKey.slice('course:'.length) : ''
  const coursePath = folder && folder !== '__loose__' ? folder : null
  const anchor = {
    coursePath,
    lessonRelativePath: null,
    lessonTitle: null,
    projectId: null,
    projectTitle: null
  }
  const raw = String(fileMarker || '').replace(/^node:/, '')
  const kindMatch = raw.match(/@(lesson|project|course)$/)
  const kind = kindMatch ? kindMatch[1] : ''
  const fileKey = kind ? raw.slice(0, -(kind.length + 1)) : raw
  const prefix = `file:${courseKey}::`
  const rest = fileKey.startsWith(prefix) ? fileKey.slice(prefix.length) : ''
  if (kind === 'course' || rest === '__course__') return anchor
  if (kind === 'project' || (!kind && rest && !/[./\\]/.test(rest))) {
    anchor.projectId = rest
    anchor.projectTitle = fileTitle || null
    return anchor
  }
  if (rest) {
    anchor.lessonRelativePath = rest
    anchor.lessonTitle = fileTitle || null
    return anchor
  }
  if (filePageId) {
    anchor.lessonRelativePath = `notion-page:${filePageId}`
    anchor.lessonTitle = fileTitle || null
  }
  return anchor
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

function captionRichText(value) {
  const text = String(value || '').trim()
  if (!text) return undefined
  return [{ type: 'text', text: { content: text } }]
}

/** One markdown code block so a note is a single Notion write. The caption keeps the id. */
export function bodyToBlocks(body, findingId = null, kind = 'finding') {
  const text = normalizeBody(body)
  const id = String(findingId || '').trim()
  if (!text && !id) return []
  const prefix = kind === 'playlist' ? 'playlist' : 'finding'
  const caption = captionRichText(id ? `${prefix}:${id}` : '')
  return [
    {
      object: 'block',
      type: 'code',
      code: {
        language: 'markdown',
        rich_text: chunkRichText(text || ' '),
        ...(caption ? { caption } : {})
      }
    }
  ]
}

/** Marker block for a file page. It is not note text. */
export function markerBlocks(marker) {
  const caption = captionRichText(marker)
  if (!caption) return []
  return [
    {
      object: 'block',
      type: 'code',
      code: {
        language: 'plain text',
        rich_text: chunkRichText(String(marker)),
        caption
      }
    }
  ]
}

const ASSET_NAME = /^[a-z0-9-]+\.[a-z0-9]+$/i

function addAssetName(names, raw) {
  let text = String(raw || '').trim()
  try {
    text = decodeURIComponent(text)
  } catch {
    // The markdown already has the raw name.
  }
  const base = text.split(/[/\\]/).pop()
  if (!base || !ASSET_NAME.test(base) || names.includes(base)) return
  names.push(base)
}

/** Basenames a note's markdown points at, including an Excalidraw scene file. */
export function noteAssetNames(body) {
  const names = []
  const text = String(body || '')
  for (const match of text.matchAll(/!\[[^\]]*]\(course-media:\/\/note\/\?file=([^)\s]+)\)/gi)) {
    addAssetName(names, match[1])
  }
  for (const match of text.matchAll(/!\[excalidraw:([^\]]*)\]\(([^)]*)\)/gi)) {
    const id = String(match[1] || '').trim()
    if (/^[a-z0-9-]+$/i.test(id)) addAssetName(names, `${id}.excalidraw`)
    const file = /[?&]file=([^)\s]+)/i.exec(match[2] || '')
    if (file) addAssetName(names, file[1])
  }
  return names
}

export function fileNameFromCaption(caption) {
  const text = String(caption || '').trim()
  if (!text.startsWith('file:')) return ''
  const name = text.slice('file:'.length).trim()
  return ASSET_NAME.test(name) ? name : ''
}

/** Image and file blocks carried next to a note. The caption is the local basename. */
export function noteAssetsFromBlocks(blocks) {
  const assets = []
  for (const block of blocks || []) {
    const type = block?.type
    if (type !== 'image' && type !== 'file') continue
    const name = fileNameFromCaption(plainRichText(block[type]?.caption))
    if (!name || assets.some((item) => item.name === name)) continue
    const hosted = block[type]?.file || block[type]?.external || {}
    assets.push({
      name,
      url: typeof hosted.url === 'string' ? hosted.url : '',
      blockId: block.id || ''
    })
  }
  return assets
}

export function blocksToBody(blocks) {
  const parts = []
  for (const block of blocks || []) {
    const type = block?.type
    if (!TEXT_BLOCK_TYPES.has(type)) continue
    const caption = blockCaption(block)
    if (caption.startsWith('node:') || caption.startsWith('file:')) continue
    const text = plainRichText(block[type]?.rich_text).replace(/\u200b/g, '')
    if (text) parts.push(text)
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
  if (status === 409 || code === 'conflict_error') {
    return 'Notion estaba guardando esa página al mismo tiempo.'
  }
  if (/not supported for the File Upload API/i.test(message || '')) {
    return 'Notion no acepta ese tipo de archivo. Un dibujo .excalidraw se puede compartir como JSON, solo como imagen, o dejarlo en esta biblioteca.'
  }
  return message || 'No se pudo hablar con Notion'
}

/**
 * Which note files to send, and under which filename.
 * Notion rejects `.excalidraw`. JSON keeps the drawing editable on the other copy.
 * `image` sends the preview only. `local` sends neither the drawing nor its preview.
 */
export function notionAssetsToUpload(names, drawingShare) {
  const list = Array.isArray(names) ? names : []
  const sceneIds = new Set(
    list
      .filter((name) => String(name).toLowerCase().endsWith('.excalidraw'))
      .map((name) => String(name).slice(0, -'.excalidraw'.length).toLowerCase())
  )
  const plans = []
  for (const name of list) {
    const lower = String(name).toLowerCase()
    if (lower.endsWith('.excalidraw')) {
      if (drawingShare !== 'json') continue
      const base = String(name).slice(0, -'.excalidraw'.length)
      plans.push({ name, filename: `${base}.json`, contentType: 'application/json' })
      continue
    }
    if (
      drawingShare === 'local' &&
      lower.endsWith('.png') &&
      sceneIds.has(lower.slice(0, -'.png'.length))
    ) {
      continue
    }
    plans.push({ name, filename: name, contentType: '' })
  }
  return plans
}

export function isRetryableNotionError(error) {
  const status = error?.status
  if (status === 409 || error?.code === 'conflict_error') return true
  if (status === 429 || status === 0 || (typeof status === 'number' && status >= 500)) return true
  return false
}
