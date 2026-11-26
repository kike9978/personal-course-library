import fs from 'fs'
import path from 'path'
import { app, net } from 'electron'
import {
  instagramThumbnailUrl,
  linkCheckState,
  canonicalSourceUrl,
  splitInstagramTitle,
  fallbackSourceTitle,
  parseHtmlMeta,
  youTubeVideoId
} from '../../shared/sources.js'

/**
 * Title, author and thumbnail for a saved link. Requests go straight to the link's own
 * host (or YouTube's oEmbed endpoint) with a generic user agent and no cookies.
 */

const TIMEOUT_MS = 8000
const PAGE_LIMIT = 512 * 1024
const IMAGE_LIMIT = 5 * 1024 * 1024
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const THUMB_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif'
}

async function fetchWithTimeout(url, { accept = '*/*' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await net.fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
      headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'es,en;q=0.8' }
    })
  } finally {
    clearTimeout(timer)
  }
}

async function readLimited(response, limit) {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    size += value.byteLength
  }
  reader.cancel().catch(() => {})
  return Buffer.concat(chunks).subarray(0, limit)
}

async function youTubeMeta(url) {
  const endpoint = new URL('https://www.youtube.com/oembed')
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('format', 'json')
  const response = await fetchWithTimeout(endpoint.href, { accept: 'application/json' })
  if (!response.ok) throw new Error(`YouTube respondió ${response.status}`)
  const data = await response.json()
  const id = youTubeVideoId(url)
  return {
    title: data.title || null,
    author: data.author_name || null,
    siteName: 'YouTube',
    thumbnail: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : data.thumbnail_url || null
  }
}

async function pageMeta(url) {
  const response = await fetchWithTimeout(url, { accept: 'text/html,application/xhtml+xml' })
  if (!response.ok) throw new Error(`La página respondió ${response.status}`)
  const type = String(response.headers.get('content-type') || '')
  if (type && !/html|xml/i.test(type)) throw new Error('El enlace no es una página')
  const html = (await readLimited(response, PAGE_LIMIT)).toString('utf8')
  const meta = parseHtmlMeta(html, response.url || url)
  if (/accounts\/login|login/i.test(new URL(response.url || url).pathname) && !meta.image) {
    throw new Error('La página pide iniciar sesión')
  }
  return {
    title: meta.title,
    author: meta.author,
    siteName: meta.siteName,
    thumbnail: meta.image,
    publishedAt: meta.publishedAt
  }
}

/** Instagram's og:title reads "Name on Instagram: "caption"". Split it into author and text. */
function tidyInstagram(meta) {
  const title = String(meta.title || '').trim()
  // Without a session Instagram serves its generic login page, titled just "Instagram".
  if (!title || /^instagram$/i.test(title)) {
    throw new Error('Instagram pide iniciar sesión para leer esta publicación')
  }
  return { ...meta, ...splitInstagramTitle(title), siteName: 'Instagram' }
}

/**
 * Look up a link. Never throws: a failed lookup still returns the canonical url and kind
 * with `ok: false` and a reason, so the link can be saved and named by hand.
 */
export async function resolveSourceMeta(rawUrl) {
  const canonical = canonicalSourceUrl(rawUrl)
  if (!canonical) return { ok: false, reason: 'No parece un enlace válido' }
  const base = {
    url: canonical.url,
    kind: canonical.kind,
    startSec: canonical.startSec,
    title: null,
    author: null,
    siteName: null,
    // Instagram's page rarely gives an image without a login; this address always does.
    thumbnail: canonical.kind === 'instagram' ? instagramThumbnailUrl(canonical.url) : null,
    publishedAt: null
  }
  try {
    let meta
    if (canonical.kind === 'youtube') meta = await youTubeMeta(canonical.url)
    else if (canonical.kind === 'instagram') meta = tidyInstagram(await pageMeta(canonical.url))
    else meta = await pageMeta(canonical.url)
    const result = { ...base, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v)) }
    // Keep the stable Instagram address over the page's image link, which expires.
    if (result.kind === 'instagram') result.thumbnail = base.thumbnail
    return {
      ok: Boolean(result.title),
      ...result,
      title: result.title || fallbackSourceTitle(result.kind, result.url)
    }
  } catch (error) {
    const reason =
      error?.name === 'AbortError' ? 'La página tardó demasiado' : error?.message || 'Sin respuesta'
    return { ok: false, reason, ...base, title: fallbackSourceTitle(base.kind, base.url) }
  }
}

export function sourceThumbDir() {
  return path.join(app.getPath('userData'), 'source-thumbs')
}

/** Absolute path of a cached thumbnail, or null when the name is not one we wrote. */
export function sourceThumbPath(file) {
  const name = String(file || '')
  if (!/^[\w-]+\.(jpg|png|webp|gif|avif)$/.test(name)) return null
  return path.join(sourceThumbDir(), name)
}

/** Download a thumbnail once so the grid works offline. Returns the file name, or null. */
export async function cacheSourceThumbnail(sourceId, imageUrl) {
  if (!sourceId || !/^https?:\/\//i.test(String(imageUrl || ''))) return null
  try {
    const response = await fetchWithTimeout(imageUrl, { accept: 'image/*' })
    if (!response.ok) return null
    const type = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
    const ext = THUMB_EXT[type]
    if (!ext) return null
    const data = await readLimited(response, IMAGE_LIMIT + 1)
    if (data.length > IMAGE_LIMIT || !data.length) return null
    const safeId = String(sourceId).replace(/[^\w-]/g, '')
    const name = `${safeId}${ext}`
    await fs.promises.mkdir(sourceThumbDir(), { recursive: true })
    for (const other of Object.values(THUMB_EXT)) {
      if (other !== ext)
        await fs.promises.rm(path.join(sourceThumbDir(), `${safeId}${other}`), { force: true })
    }
    await fs.promises.writeFile(path.join(sourceThumbDir(), name), data)
    return name
  } catch {
    return null
  }
}

export async function removeSourceThumbnail(file) {
  const target = sourceThumbPath(file)
  if (target) await fs.promises.rm(target, { force: true }).catch(() => {})
}

const CAPTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const CAPTURE_LIMIT = 15 * 1024 * 1024

function sourceCaptureDir() {
  return path.join(app.getPath('userData'), 'source-captures')
}

/** Absolute path of a stored capture, or null when the name is not one we wrote. */
export function sourceCapturePath(file) {
  const name = String(file || '')
  if (!/^[\w-]+\.(png|jpe?g|webp|gif)$/.test(name)) return null
  return path.join(sourceCaptureDir(), name)
}

/** Copy an image the user picked into app data. Returns the stored file name, or null. */
export async function saveSourceCapture(sourceId, filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (!CAPTURE_EXT.has(ext)) return null
  const stat = await fs.promises.stat(filePath).catch(() => null)
  if (!stat?.isFile() || stat.size > CAPTURE_LIMIT) return null
  const safeId = String(sourceId).replace(/[^\w-]/g, '')
  const name = `${safeId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${ext === '.jpeg' ? '.jpg' : ext}`
  await fs.promises.mkdir(sourceCaptureDir(), { recursive: true })
  await fs.promises.copyFile(filePath, path.join(sourceCaptureDir(), name))
  return name
}

/**
 * Does the page behind a link still exist? YouTube is asked through oEmbed (404 for a removed
 * or private video), other pages directly. Instagram answers anonymous requests with a login
 * page whatever the post's state, so it is not checked.
 */
export async function checkSourceLink(source) {
  const checkedAt = Date.now()
  if (source?.kind === 'instagram')
    return { state: 'unknown', code: null, checkedAt, skipped: true }
  let target = String(source?.url || '')
  if (!/^https?:\/\//i.test(target)) return { state: 'unknown', code: null, checkedAt }
  if (source.kind === 'youtube') {
    const endpoint = new URL('https://www.youtube.com/oembed')
    endpoint.searchParams.set('url', target)
    endpoint.searchParams.set('format', 'json')
    target = endpoint.href
  }
  try {
    const response = await fetchWithTimeout(target, { accept: 'text/html,application/json,*/*' })
    response.body?.cancel?.().catch?.(() => {})
    // oEmbed answers 401/403 for videos that exist but cannot be embedded.
    const code =
      source.kind === 'youtube' && (response.status === 401 || response.status === 403)
        ? 200
        : response.status
    return { state: linkCheckState(code), code, checkedAt }
  } catch {
    return { state: 'unknown', code: null, checkedAt }
  }
}
