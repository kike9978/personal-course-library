import fs from 'fs/promises'
import path from 'path'
import { TS_EXTS, detectPacketSize, pcrBaseAt, tsClockDelta } from './tsIndex.js'

const CONCURRENCY = 4
const CACHE_VERSION = 1

const ISO_EXTS = new Set(['.mp4', '.m4v', '.mov', '.m4a'])
const MATROSKA_EXTS = new Set(['.mkv', '.webm'])

const SEGMENT = 0x18538067n
const INFO = 0x1549a966n
const TIMESTAMP_SCALE = 0x2ad7b1n
const DURATION = 0x4489n
const CLUSTER = 0x1f43b675n

/**
 * Fill `durationSec` on playable lessons from container headers.
 * Unchanged files are served from a size+mtime cache, so a course reopen
 * does not touch the media bytes.
 */
export async function applyLessonDurations(courseRoot, courseName, lessons, options = {}) {
  const targets = (lessons || []).filter(
    (lesson) =>
      lesson && (lesson.kind === 'video' || lesson.kind === 'audio') && lesson.relativePath
  )
  if (!targets.length) return

  const cache = options.cacheFile ? await loadCache(options.cacheFile) : null
  let dirty = false
  if (cache) {
    // Course entries are keyed by folder name, so the library is the course folder's parent.
    const inLibrary = path.basename(courseRoot) === courseName
    if (inLibrary && (await pruneMissingCourses(cache, path.dirname(courseRoot)))) dirty = true
    if (pruneCourseEntries(cache, courseName, targets)) dirty = true
  }

  await mapPool(targets, CONCURRENCY, async (lesson) => {
    const absolute = path.resolve(courseRoot, lesson.relativePath)
    let st
    try {
      st = await fs.stat(absolute)
    } catch {
      return
    }
    const size = st.size
    const mtime = Math.round(st.mtimeMs)
    const key = `${courseName}/${lesson.relativePath}`
    const hit = cache?.files?.[key]
    if (hit && hit.s === size && hit.m === mtime) {
      if (hit.d > 0) lesson.durationSec = hit.d
      return
    }

    let seconds = null
    try {
      seconds = await probeDuration(absolute, size)
    } catch {
      seconds = null
    }
    const durationSec = seconds > 0 ? Math.round(seconds) : 0
    if (durationSec > 0) lesson.durationSec = durationSec
    if (cache) {
      cache.files[key] = { s: size, m: mtime, d: durationSec }
      dirty = true
    }
  })

  if (cache && dirty) await saveCache(options.cacheFile, cache)
}

/** Seconds from a media header, or null when the container has no readable length. */
export async function probeDuration(absolute, knownSize) {
  const ext = path.extname(absolute).toLowerCase()
  const fh = await fs.open(absolute, 'r')
  try {
    const size = knownSize ?? (await fh.stat()).size
    if (!size) return null
    if (ISO_EXTS.has(ext)) return await probeIsobmff(fh, size)
    if (MATROSKA_EXTS.has(ext)) return await probeMatroska(fh, size)
    if (TS_EXTS.has(ext)) return await probeTs(fh, size)
    if (ext === '.avi') return await probeAvi(fh, size)
    if (ext === '.wav') return await probeWav(fh, size)
    if (ext === '.flac') return await probeFlac(fh, size)
    if (ext === '.mp3') return await probeMp3(fh, size)
    return null
  } finally {
    await fh.close()
  }
}

async function probeIsobmff(fh, fileSize) {
  let offset = 0
  for (let boxes = 0; boxes < 64 && offset + 8 <= fileSize; boxes += 1) {
    const header = await readExact(fh, offset, Math.min(16, fileSize - offset))
    if (!header || header.length < 8) return null
    let size = header.readUInt32BE(0)
    const type = header.toString('ascii', 4, 8)
    let headerLen = 8
    if (size === 1) {
      if (header.length < 16) return null
      size = Number(header.readBigUInt64BE(8))
      headerLen = 16
    } else if (size === 0) {
      size = fileSize - offset
    }
    if (!Number.isFinite(size) || size < headerLen || offset + size > fileSize) return null
    if (type === 'moov') {
      const sliceLen = Math.min(size, 4096)
      const box = await readExact(fh, offset, sliceLen)
      const seconds = box ? mvhdSeconds(box) : null
      if (seconds > 0) return seconds
    }
    offset += size
  }
  return null
}

function mvhdSeconds(moov) {
  const typeAt = moov.indexOf('mvhd')
  if (typeAt < 4) return null
  const start = typeAt - 4
  if (start + 32 > moov.length) return null
  const version = moov[start + 8]
  if (version === 0) {
    const timescale = moov.readUInt32BE(start + 20)
    const duration = moov.readUInt32BE(start + 24)
    if (!timescale) return null
    return duration / timescale
  }
  if (version === 1 && start + 40 <= moov.length) {
    const timescale = moov.readUInt32BE(start + 28)
    const duration = moov.readBigUInt64BE(start + 32)
    if (!timescale) return null
    return Number(duration) / timescale
  }
  return null
}

async function probeMatroska(fh, fileSize) {
  const found = { scale: 1000000, duration: null }
  await walkMatroska(fh, 0, fileSize, null, found, { steps: 0 })
  if (!(found.duration > 0) || !(found.scale > 0)) return null
  return (found.duration * found.scale) / 1e9
}

async function walkMatroska(fh, start, end, parent, found, budget) {
  let offset = start
  while (offset + 2 <= end && found.duration == null) {
    budget.steps += 1
    if (budget.steps > 20000) return
    const id = await readVint(fh, offset, end, true)
    if (!id) return
    const size = await readVint(fh, id.next, end, false)
    if (!size) return
    const dataStart = size.next
    if (id.value === CLUSTER) return

    if (size.unknown) {
      if (id.value === SEGMENT || id.value === INFO) {
        await walkMatroska(fh, dataStart, end, id.value, found, budget)
      }
      return
    }

    const length = Number(size.value)
    if (!Number.isSafeInteger(length) || length < 0 || dataStart + length > end) return
    const dataEnd = dataStart + length

    if (id.value === SEGMENT || id.value === INFO) {
      await walkMatroska(fh, dataStart, dataEnd, id.value, found, budget)
    } else if (parent === INFO && id.value === TIMESTAMP_SCALE && length > 0 && length <= 8) {
      const raw = await readExact(fh, dataStart, length)
      if (raw) found.scale = readUnsigned(raw)
    } else if (parent === INFO && id.value === DURATION && (length === 4 || length === 8)) {
      const raw = await readExact(fh, dataStart, length)
      if (raw) found.duration = length === 4 ? raw.readFloatBE(0) : raw.readDoubleBE(0)
      return
    }
    offset = dataEnd
  }
}

async function probeTs(fh, fileSize) {
  const headLen = Math.min(fileSize, 256 * 1024)
  const head = await readExact(fh, 0, headLen)
  if (!head) return null
  const packetSize = detectPacketSize(head)
  if (!packetSize) return null
  const first = scanPcr(head, packetSize, 'first')
  if (first == null) return null
  const tailLen = Math.min(fileSize, 256 * 1024)
  let tailOffset = fileSize - tailLen
  tailOffset -= tailOffset % packetSize
  const tail = tailOffset === 0 ? head : await readExact(fh, tailOffset, fileSize - tailOffset)
  if (!tail) return null
  const last = scanPcr(tail, packetSize, 'last')
  if (last == null || last === first) return null
  const ticks = tsClockDelta(last, first)
  if (ticks <= 0) return null
  return ticks / 90000
}

function scanPcr(buf, packetSize, which) {
  const sync = packetSize === 192 ? 4 : 0
  let found = null
  for (let i = 0; i + packetSize <= buf.length; i += packetSize) {
    const pcr = pcrBaseAt(buf.subarray(i, i + packetSize), sync)
    if (pcr == null) continue
    found = pcr
    if (which === 'first') return found
  }
  return found
}

async function probeAvi(fh, fileSize) {
  const len = Math.min(fileSize, 256 * 1024)
  const buf = await readExact(fh, 0, len)
  if (!buf) return null
  const idx = buf.indexOf('avih')
  if (idx < 0 || idx + 28 > buf.length) return null
  const micro = buf.readUInt32LE(idx + 8)
  const frames = buf.readUInt32LE(idx + 24)
  if (!micro || !frames) return null
  return (micro / 1e6) * frames
}

async function probeWav(fh, fileSize) {
  const header = await readExact(fh, 0, Math.min(fileSize, 12))
  if (
    !header ||
    header.toString('ascii', 0, 4) !== 'RIFF' ||
    header.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null
  }
  let offset = 12
  let byteRate = 0
  while (offset + 8 <= fileSize) {
    const chunk = await readExact(fh, offset, 8)
    if (!chunk) return null
    const id = chunk.toString('ascii', 0, 4)
    const size = chunk.readUInt32LE(4)
    const dataStart = offset + 8
    if (id === 'fmt ' && size >= 12) {
      const fmt = await readExact(fh, dataStart, Math.min(size, 16))
      if (fmt && fmt.length >= 12) byteRate = fmt.readUInt32LE(8)
    } else if (id === 'data' && byteRate > 0) {
      return size / byteRate
    }
    offset = dataStart + size + (size % 2)
  }
  return null
}

async function probeFlac(fh, fileSize) {
  if (fileSize < 42) return null
  const buf = await readExact(fh, 0, Math.min(fileSize, 128))
  if (!buf || buf.toString('ascii', 0, 4) !== 'fLaC') return null
  const type = buf[4] & 0x7f
  const blockLen = (buf[5] << 16) | (buf[6] << 8) | buf[7]
  if (type !== 0 || blockLen < 18 || 8 + 18 > buf.length) return null
  const info = buf.subarray(8)
  const sampleRate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4)
  const samples =
    ((BigInt(info[13]) & 0x0fn) << 32n) |
    (BigInt(info[14]) << 24n) |
    (BigInt(info[15]) << 16n) |
    (BigInt(info[16]) << 8n) |
    BigInt(info[17])
  if (!sampleRate || samples <= 0n) return null
  return Number(samples) / sampleRate
}

const MPEG1_L3_BITRATE = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const MPEG2_L3_BITRATE = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const MPEG1_RATE = [44100, 48000, 32000]
const MPEG2_RATE = [22050, 24000, 16000]

async function probeMp3(fh, fileSize) {
  const len = Math.min(fileSize, 64 * 1024)
  const buf = await readExact(fh, 0, len)
  if (!buf) return null
  let offset = 0
  if (buf.toString('ascii', 0, 3) === 'ID3' && buf.length >= 10) {
    const tagSize =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    offset = 10 + tagSize
  }
  const headerAt = findMp3Frame(buf, offset)
  if (headerAt < 0 || headerAt + 4 > buf.length) return null
  const header = buf.readUInt32BE(headerAt)
  const versionId = (header >> 19) & 0x3
  const layer = (header >> 17) & 0x3
  const bitrateIndex = (header >> 12) & 0xf
  const rateIndex = (header >> 10) & 0x3
  if (layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null
  const mpeg1 = versionId === 3
  const bitrateKbps = (mpeg1 ? MPEG1_L3_BITRATE : MPEG2_L3_BITRATE)[bitrateIndex]
  const sampleRate = (mpeg1 ? MPEG1_RATE : MPEG2_RATE)[rateIndex]
  if (!bitrateKbps || !sampleRate) return null

  const markerEnd = Math.min(buf.length, headerAt + 180)
  const xing = indexWithin(buf, 'Xing', headerAt, markerEnd)
  const info = xing < 0 ? indexWithin(buf, 'Info', headerAt, markerEnd) : xing
  if (info >= 0 && info + 12 <= buf.length && buf[info + 7] & 1) {
    const frames = buf.readUInt32BE(info + 8)
    const samplesPerFrame = mpeg1 ? 1152 : 576
    if (frames > 0) return (frames * samplesPerFrame) / sampleRate
  }
  const audioBytes = Math.max(0, fileSize - offset)
  return audioBytes > 0 ? (audioBytes * 8) / (bitrateKbps * 1000) : null
}

function indexWithin(buf, needle, start, end) {
  const at = buf.subarray(start, end).indexOf(needle)
  return at < 0 ? -1 : start + at
}

function findMp3Frame(buf, start) {
  const end = Math.min(buf.length - 1, start + 4096)
  for (let i = start; i < end; i += 1) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i
  }
  return -1
}

async function readExact(fh, position, length) {
  if (length <= 0) return null
  const buf = Buffer.alloc(length)
  const { bytesRead } = await fh.read(buf, 0, length, position)
  if (bytesRead < length) return null
  return buf
}

async function readVint(fh, position, end, keepMarker) {
  if (position >= end) return null
  const firstBuf = await readExact(fh, position, 1)
  if (!firstBuf || firstBuf[0] === 0) return null
  const first = firstBuf[0]
  let width = 1
  let marker = 0x80
  while (width <= 8 && (first & marker) === 0) {
    width += 1
    marker >>= 1
  }
  if (width > 8 || position + width > end) return null
  const rawBuf = width === 1 ? firstBuf : await readExact(fh, position, width)
  if (!rawBuf) return null
  let raw = 0n
  for (const byte of rawBuf) raw = (raw << 8n) | BigInt(byte)
  const dataBits = 7n * BigInt(width)
  const mask = (1n << dataBits) - 1n
  return {
    value: keepMarker ? raw : raw & mask,
    unknown: !keepMarker && (raw & mask) === mask,
    next: position + width
  }
}

function readUnsigned(buf) {
  let value = 0
  for (const byte of buf) value = value * 256 + byte
  return value
}

const memoryCache = new Map()
const prunedLibraries = new Set()

/** Drop entries for this course's files that are no longer in it (renamed or removed lessons). */
export function pruneCourseEntries(cache, courseName, lessons) {
  const prefix = `${courseName}/`
  const keep = new Set(lessons.map((lesson) => `${prefix}${lesson.relativePath}`))
  let changed = false
  for (const key of Object.keys(cache.files)) {
    if (key.startsWith(prefix) && !keep.has(key)) {
      delete cache.files[key]
      changed = true
    }
  }
  return changed
}

/** Once per session and library: drop entries for course folders that no longer exist. */
async function pruneMissingCourses(cache, libraryDir) {
  if (prunedLibraries.has(libraryDir)) return false
  prunedLibraries.add(libraryDir)
  const courses = new Set(Object.keys(cache.files).map((key) => key.split('/')[0]))
  let changed = false
  for (const name of courses) {
    try {
      await fs.access(path.join(libraryDir, name))
    } catch {
      for (const key of Object.keys(cache.files)) {
        if (key.startsWith(`${name}/`)) delete cache.files[key]
      }
      changed = true
    }
  }
  return changed
}

export function clearDurationMemoryCache() {
  prunedLibraries.clear()
  memoryCache.clear()
}

async function loadCache(cacheFile) {
  const cached = memoryCache.get(cacheFile)
  if (cached) return cached
  let parsed = null
  try {
    parsed = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
  } catch {
    parsed = null
  }
  const cache =
    parsed && parsed.version === CACHE_VERSION && parsed.files
      ? parsed
      : { version: CACHE_VERSION, files: {} }
  memoryCache.set(cacheFile, cache)
  return cache
}

async function saveCache(cacheFile, cache) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true })
  const temp = `${cacheFile}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(cache))
  await fs.rename(temp, cacheFile)
}

async function mapPool(items, limit, fn) {
  if (!items.length) return
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await fn(items[index], index)
    }
  })
  await Promise.all(workers)
}
