import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { randomBytes } from 'crypto'

const ATTACH_DIR = 'note-attachments'

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'application/json': '.excalidraw',
  'application/vnd.excalidraw+json': '.excalidraw'
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.excalidraw': 'application/json',
  '.json': 'application/json'
}

function getAttachmentsDir() {
  const dir = path.join(app.getPath('userData'), ATTACH_DIR)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function makeAttachmentId() {
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
}

function safeExtFromName(fileName, mimeType) {
  const fromName = path.extname(String(fileName || '')).toLowerCase()
  if (fromName && MIME_BY_EXT[fromName]) return fromName
  return EXT_BY_MIME[mimeType] || '.png'
}

function attachmentUrl(fileName) {
  return `course-media://note/?file=${encodeURIComponent(fileName)}`
}

function isSafeAttachmentId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/i.test(id)
}

/**
 * Resolve a stored attachment filename to an absolute path (no traversal).
 * @param {string} fileParam
 * @returns {string|null}
 */
export function resolveNoteAttachmentPath(fileParam) {
  const raw = decodeURIComponent(String(fileParam || ''))
  const base = path.basename(raw)
  if (!base || base !== raw.replace(/^.*[/\\]/, '')) return null
  if (!/^[a-z0-9-]+\.[a-z0-9]+$/i.test(base)) return null
  const absolute = path.join(getAttachmentsDir(), base)
  const root = getAttachmentsDir()
  if (!absolute.startsWith(root + path.sep) && absolute !== root) return null
  return absolute
}

export function getNoteAttachmentMime(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

/**
 * Copy a local image file into the note attachments store.
 * @param {string} sourcePath
 */
export function saveNoteAttachmentFromPath(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error('Archivo de imagen no encontrado')
  }
  const ext = safeExtFromName(sourcePath, null)
  const fileName = `${makeAttachmentId()}${ext}`
  const dest = path.join(getAttachmentsDir(), fileName)
  fs.copyFileSync(sourcePath, dest)
  return {
    fileName,
    url: attachmentUrl(fileName),
    mimeType: getNoteAttachmentMime(dest)
  }
}

/**
 * Persist image bytes (base64) from the renderer (paste / drop).
 * @param {{ dataBase64: string, mimeType?: string, fileName?: string }} payload
 */
export function saveNoteAttachmentFromData(payload) {
  const mimeType = String(payload?.mimeType || 'image/png')
  const ext = safeExtFromName(payload?.fileName, mimeType)
  const fileName = `${makeAttachmentId()}${ext}`
  const dest = path.join(getAttachmentsDir(), fileName)
  const buf = Buffer.from(String(payload?.dataBase64 || ''), 'base64')
  if (!buf.length) throw new Error('Imagen vacía')
  fs.writeFileSync(dest, buf)
  return {
    fileName,
    url: attachmentUrl(fileName),
    mimeType: getNoteAttachmentMime(dest)
  }
}

/**
 * Save an Excalidraw scene (+ optional PNG preview) into note attachments.
 * @param {{ drawingId?: string|null, sceneJson: string, previewBase64?: string|null }} payload
 */
export function saveNoteDrawing(payload) {
  const sceneJson = String(payload?.sceneJson || '')
  if (!sceneJson.trim()) throw new Error('Dibujo vacío')

  const drawingId = isSafeAttachmentId(payload?.drawingId)
    ? payload.drawingId
    : makeAttachmentId()

  const sceneName = `${drawingId}.excalidraw`
  const scenePath = path.join(getAttachmentsDir(), sceneName)
  fs.writeFileSync(scenePath, sceneJson, 'utf8')

  let previewUrl = null
  const previewBase64 = payload?.previewBase64
  if (previewBase64) {
    const previewName = `${drawingId}.png`
    const previewPath = path.join(getAttachmentsDir(), previewName)
    const buf = Buffer.from(String(previewBase64), 'base64')
    if (buf.length) {
      fs.writeFileSync(previewPath, buf)
      previewUrl = attachmentUrl(previewName)
    }
  }

  return {
    drawingId,
    sceneUrl: attachmentUrl(sceneName),
    previewUrl
  }
}

/**
 * Load a saved Excalidraw scene JSON.
 * @param {string} drawingId
 */
export function loadNoteDrawing(drawingId) {
  if (!isSafeAttachmentId(drawingId)) {
    throw new Error('ID de dibujo inválido')
  }
  const scenePath = path.join(getAttachmentsDir(), `${drawingId}.excalidraw`)
  if (!fs.existsSync(scenePath)) {
    throw new Error('Dibujo no encontrado')
  }
  return {
    drawingId,
    sceneJson: fs.readFileSync(scenePath, 'utf8')
  }
}

/**
 * Resolve attachment basenames that exist on disk (for markdown export bundles).
 * @param {string[]} fileNames
 * @returns {{ fileName: string, absolutePath: string }[]}
 */
export function resolveExistingNoteAttachments(fileNames) {
  const out = []
  for (const name of fileNames || []) {
    const absolute = resolveNoteAttachmentPath(name)
    if (absolute && fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      out.push({ fileName: path.basename(absolute), absolutePath: absolute })
    }
  }
  return out
}
