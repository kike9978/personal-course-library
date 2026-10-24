import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { getLibraryPath, isLibraryPathValid } from './config.js'
import { loadCourseRecord } from './courses.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const PREVIEW_LIMIT = 8
const HIT_POOL = 16
const THUMB_MAX_BYTES = 512 * 1024
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const SEARCH_TIMEOUT_MS = 12000
const THUMB_TIMEOUT_MS = 8000
const IMAGE_TIMEOUT_MS = 20000

const COVER_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']

export function buildCoverQuery(course) {
  return [course?.institution, course?.title]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
}

function requireCourseFolder(courseDir) {
  const libraryPath = getLibraryPath()
  if (!isLibraryPathValid(libraryPath)) {
    throw new Error('Library path is not configured or is invalid')
  }
  const name = path.basename(String(courseDir || '').trim())
  if (!name || name === '.' || name === '..') {
    throw new Error('Carpeta de curso no encontrada')
  }
  const folder = path.join(libraryPath, name)
  if (!fsSync.existsSync(folder) || !fsSync.statSync(folder).isDirectory()) {
    throw new Error('Carpeta de curso no encontrada')
  }
  return folder
}

function normalizeHttpsUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function sourceLabel(hit) {
  const page = normalizeHttpsUrl(hit?.url)
  if (page) {
    try {
      return new URL(page).hostname.replace(/^www\./, '')
    } catch {
      /* fall through */
    }
  }
  return String(hit?.source || '').trim()
}

function sniffRaster(buffer) {
  if (!buffer || buffer.length < 6) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  const gif = buffer.toString('ascii', 0, 6)
  if (gif === 'GIF87a' || gif === 'GIF89a') {
    return { ext: 'gif', mime: 'image/gif' }
  }
  return null
}

function isCoverFileName(name) {
  const lower = String(name || '').toLowerCase()
  return (
    COVER_EXTS.some((ext) => lower === `cover-image.${ext}`) ||
    lower === 'cover-image' ||
    /^cover[-_.]?image\.(png|jpe?g|webp|gif|svg)$/i.test(name) ||
    /^cover\.(png|jpe?g|webp|gif|svg)$/i.test(name)
  )
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' })
  } catch (err) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      throw new Error('Tiempo de espera agotado')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('Imagen demasiado grande')
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) throw new Error('Imagen demasiado grande')
    return buffer
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  let finished = false
  try {
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) {
        finished = true
      } else {
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => {})
          throw new Error('Imagen demasiado grande')
        }
        chunks.push(Buffer.from(value))
      }
    }
  } catch (err) {
    if (err?.message === 'Imagen demasiado grande') throw err
    throw new Error('No se pudo descargar la imagen')
  }
  return Buffer.concat(chunks)
}

function isBingHost(url) {
  try {
    const host = new URL(url).hostname
    return host === 'bing.com' || host.endsWith('.bing.com') || host.endsWith('.bing.net')
  } catch {
    return false
  }
}

function enlargedBingThumb(thumbUrl) {
  const href = normalizeHttpsUrl(thumbUrl)
  if (!href || !isBingHost(href)) return null
  const url = new URL(href)
  let id = url.searchParams.get('id')
  if (!id) {
    const pathId = url.pathname.match(/\/th\/id\/([^/?]+)/)
    if (pathId) id = decodeURIComponent(pathId[1])
  }
  if (!id) return null
  return `https://ts1.mm.bing.net/th?id=${encodeURIComponent(id)}&w=1600&h=1600&c=7&rs=1&qlt=90`
}

async function fetchImageBuffer(url, { timeoutMs, maxBytes, referer }) {
  const href = normalizeHttpsUrl(url)
  if (!href) throw new Error('Solo se permiten imágenes HTTPS')
  const headers = {
    'User-Agent': UA,
    Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5'
  }
  if (referer) headers.Referer = referer
  let response
  try {
    response = await fetchWithTimeout(href, { headers }, timeoutMs)
  } catch (err) {
    if (err?.message === 'Tiempo de espera agotado') throw err
    throw new Error('No se pudo descargar la imagen')
  }
  if (!response.ok) throw new Error('No se pudo descargar la imagen')
  if (!normalizeHttpsUrl(response.url)) throw new Error('Solo se permiten imágenes HTTPS')
  return readLimited(response, maxBytes)
}

async function tryDownloadCover(url, { referer }) {
  try {
    const buffer = await fetchImageBuffer(url, {
      timeoutMs: IMAGE_TIMEOUT_MS,
      maxBytes: IMAGE_MAX_BYTES,
      referer
    })
    const kind = sniffRaster(buffer)
    if (!kind || kind.ext === 'gif') return null
    return { buffer, kind }
  } catch {
    return null
  }
}

function extractVqd(html) {
  const patterns = [/vqd=["']([^"']+)["']/, /vqd=([^&"'<>\s]+)/]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

async function duckDuckGoImageHits(query) {
  const pageUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`
  const page = await fetchWithTimeout(
    pageUrl,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml'
      }
    },
    SEARCH_TIMEOUT_MS
  )
  if (!page.ok || page.status === 202) throw new Error('Búsqueda bloqueada')
  const html = await page.text()
  if (html.includes('anomaly.js') || html.includes('anomaly-modal')) {
    throw new Error('Búsqueda bloqueada')
  }
  const vqd = extractVqd(html)
  if (!vqd) throw new Error('No se pudo buscar portadas')

  const apiUrl = new URL('https://duckduckgo.com/i.js')
  apiUrl.searchParams.set('l', 'us-en')
  apiUrl.searchParams.set('o', 'json')
  apiUrl.searchParams.set('q', query)
  apiUrl.searchParams.set('vqd', vqd)
  apiUrl.searchParams.set('f', ',,,,,')
  apiUrl.searchParams.set('p', '1')

  const api = await fetchWithTimeout(
    apiUrl,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: pageUrl
      }
    },
    SEARCH_TIMEOUT_MS
  )
  if (api.status === 202 || api.status === 403 || api.status === 429 || !api.ok) {
    throw new Error('Búsqueda bloqueada')
  }

  let payload
  try {
    payload = await api.json()
  } catch {
    throw new Error('Búsqueda bloqueada')
  }
  if (payload?.challenge || !Array.isArray(payload?.results)) {
    throw new Error('Búsqueda bloqueada')
  }

  const results = payload.results
  return results
    .map((hit) => ({
      imageUrl: normalizeHttpsUrl(hit?.image),
      thumbUrl: normalizeHttpsUrl(hit?.thumbnail),
      source: sourceLabel(hit),
      width: Number(hit?.width) || 0,
      height: Number(hit?.height) || 0
    }))
    .filter((hit) => hit.imageUrl)
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function bingTiles(html) {
  const hits = []
  const seen = new Set()
  for (const match of String(html || '').matchAll(/m="(\{[^"]*\})"/g)) {
    let tile
    try {
      tile = JSON.parse(decodeHtml(match[1]))
    } catch {
      continue
    }
    const imageUrl = normalizeHttpsUrl(tile?.murl)
    if (!imageUrl || seen.has(imageUrl)) continue
    seen.add(imageUrl)
    let source = ''
    const page = normalizeHttpsUrl(tile?.purl)
    if (page) {
      try {
        source = new URL(page).hostname.replace(/^www\./, '')
      } catch {
        source = ''
      }
    }
    hits.push({
      imageUrl,
      thumbUrl: normalizeHttpsUrl(tile?.turl),
      source,
      width: Number(tile?.mw || tile?.w) || 0,
      height: Number(tile?.mh || tile?.h) || 0
    })
  }
  return hits
}

async function bingImageHits(query) {
  const pageUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=1&count=${HIT_POOL}&mmasync=1`
  const page = await fetchWithTimeout(
    pageUrl,
    {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.bing.com/'
      }
    },
    SEARCH_TIMEOUT_MS
  )
  if (!page.ok || page.status === 202) throw new Error('No se pudo buscar portadas')
  const html = await page.text()
  return bingTiles(html)
}

async function searchImageHits(query) {
  // DuckDuckGo's image endpoint often returns a bot challenge and zero results.
  try {
    const hits = await bingImageHits(query)
    if (hits.length > 0) return hits
  } catch {
    // Bing refused the request; try the other source.
  }
  return duckDuckGoImageHits(query)
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const current = index++
      results[current] = await mapper(items[current], current)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

function failureMessage(err) {
  if (err?.message === 'Tiempo de espera agotado') return 'La búsqueda tardó demasiado'
  const known = new Set([
    'No se pudo buscar portadas',
    'Carpeta de curso no encontrada',
    'Library path is not configured or is invalid'
  ])
  if (known.has(err?.message)) return err.message
  return 'No se pudo buscar portadas'
}

export async function searchCoverCandidates({ coursePath, query } = {}) {
  const requested = String(query || '').trim()
  try {
    const record = await loadCourseRecord(coursePath)
    const q = requested || buildCoverQuery(record)
    if (!q) return { query: '', candidates: [], error: 'Sin título para buscar' }

    const hits = await searchImageHits(q)
    if (hits.length === 0) {
      return { query: q, candidates: [], error: 'No se encontraron imágenes' }
    }

    const downloaded = await mapPool(hits.slice(0, HIT_POOL), 3, async (hit) => {
      try {
        const previewUrl = hit.thumbUrl || hit.imageUrl
        const buffer = await fetchImageBuffer(previewUrl, {
          timeoutMs: THUMB_TIMEOUT_MS,
          maxBytes: THUMB_MAX_BYTES,
          referer: isBingHost(previewUrl) ? 'https://www.bing.com/' : undefined
        })
        const kind = sniffRaster(buffer)
        if (!kind) return null
        return {
          imageUrl: hit.imageUrl,
          thumbUrl: hit.thumbUrl || '',
          source: hit.source,
          width: hit.width,
          height: hit.height,
          dataUrl: `data:${kind.mime};base64,${buffer.toString('base64')}`
        }
      } catch {
        return null
      }
    })

    const candidates = downloaded.filter(Boolean).slice(0, PREVIEW_LIMIT)
    if (candidates.length === 0) {
      return { query: q, candidates: [], error: 'No se pudieron cargar las vistas previas' }
    }
    return { query: q, candidates, error: null }
  } catch (err) {
    return { query: requested, candidates: [], error: failureMessage(err) }
  }
}

async function removeExistingCovers(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isCoverFileName(entry.name))
      .map((entry) => fs.unlink(path.join(folder, entry.name)).catch(() => {}))
  )
}

export async function saveCourseCover(coursePath, imageUrl, thumbUrl) {
  requireCourseFolder(coursePath)
  const attempts = []
  const seen = new Set()
  const addAttempt = (url, referer) => {
    const href = normalizeHttpsUrl(url)
    if (!href) return
    const key = `${href}\n${referer || ''}`
    if (seen.has(key)) return
    seen.add(key)
    attempts.push({ url: href, referer })
  }

  const full = normalizeHttpsUrl(imageUrl)
  if (full) {
    addAttempt(full)
    try {
      addAttempt(full, `${new URL(full).origin}/`)
    } catch {
      /* ignore an unusable origin */
    }
  }
  addAttempt(enlargedBingThumb(thumbUrl), 'https://www.bing.com/')

  let saved = null
  for (const attempt of attempts) {
    saved = await tryDownloadCover(attempt.url, { referer: attempt.referer })
    if (saved) break
  }
  if (!saved) throw new Error('No se pudo descargar la imagen')
  return writeCoverBuffer(coursePath, saved.buffer)
}

async function writeCoverBuffer(coursePath, buffer) {
  const folder = requireCourseFolder(coursePath)
  if (!buffer || buffer.length === 0) throw new Error('No se pudo descargar la imagen')
  if (buffer.length > IMAGE_MAX_BYTES) throw new Error('Imagen demasiado grande')
  const kind = sniffRaster(buffer)
  if (!kind || kind.ext === 'gif') {
    throw new Error('El archivo no es una imagen JPG, PNG o WebP')
  }
  await removeExistingCovers(folder)
  await fs.writeFile(path.join(folder, `cover-image.${kind.ext}`), buffer)
  return loadCourseRecord(coursePath)
}

export async function saveCourseCoverBuffer(coursePath, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || [])
  return writeCoverBuffer(coursePath, buffer)
}
