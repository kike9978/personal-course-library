import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'

/** MPEG-TS packet clocks (PCR base and PTS) roll over after 2^33 ticks. */
const CLOCK_MOD = 0x200000000
const SEGMENT_TARGET_TICKS = 8 * 90000

export const TS_EXTS = new Set(['.ts', '.mts', '.m2ts'])
const VIDEO_TYPES = new Set([0x1b, 0x24, 0x10, 0x02])
const CACHE_VERSION = 1

const memoryCache = new Map()
const inflight = new Map()

export function clearTsIndexMemoryCache() {
  memoryCache.clear()
}

/** 33-bit clock delta. A small step backwards is B-frame jitter, not a wrap. */
export function tsClockDelta(later, earlier) {
  if (later == null || earlier == null) return 0
  if (later >= earlier) return later - earlier
  if (earlier - later < 5 * 90000) return 0
  return later + CLOCK_MOD - earlier
}

export function detectPacketSize(buf) {
  if (!buf || buf.length < 188) return null
  const candidates = [
    { size: 188, sync: 0 },
    { size: 192, sync: 4 },
    { size: 204, sync: 0 }
  ]
  for (const { size, sync } of candidates) {
    if (buf.length < size || sync >= buf.length) continue
    let hits = 0
    let bad = false
    for (let i = 0; hits < 5 && i + size <= buf.length; i += size) {
      if (buf[i + sync] !== 0x47) {
        bad = true
        break
      }
      hits += 1
    }
    if (!bad && (hits >= 2 || (hits === 1 && buf.length < size * 2))) return size
  }
  return null
}

/** PCR base (90 kHz) from a TS packet, or null when this packet has no PCR. */
export function pcrBaseAt(packet, sync) {
  if (!packet || packet.length < sync + 12 || packet[sync] !== 0x47) return null
  const afc = (packet[sync + 3] >> 4) & 0x3
  if (afc !== 2 && afc !== 3) return null
  const length = packet[sync + 4]
  if (length < 7 || (packet[sync + 5] & 0x10) === 0) return null
  const o = sync + 6
  if (o + 6 > packet.length) return null
  return Number(
    (BigInt(packet[o]) << 25n) |
      (BigInt(packet[o + 1]) << 17n) |
      (BigInt(packet[o + 2]) << 9n) |
      (BigInt(packet[o + 3]) << 1n) |
      (BigInt(packet[o + 4]) >> 7n)
  )
}

/**
 * Index a transport stream into keyframe-aligned segments.
 * The first play builds this once; later opens reuse size and mtime.
 */
export function loadTsIndex(absolutePath, cacheFile) {
  const running = inflight.get(absolutePath)
  if (running) return running
  const job = readOrBuild(absolutePath, cacheFile).finally(() => {
    inflight.delete(absolutePath)
  })
  inflight.set(absolutePath, job)
  return job
}

export function indexTsBuffer(buffer) {
  const indexer = new TsIndexer()
  indexer.push(buffer)
  return indexer.finish(buffer.length)
}

export function renderPlaylist(index, course, file) {
  const durations = (index.segments || []).map((seg) => seg.durationMs / 1000)
  const target = Math.max(1, Math.ceil(Math.max(0, ...durations)))
  const courseQ = encodeURIComponent(course)
  const fileQ = encodeURIComponent(file)
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-MEDIA-SEQUENCE:0'
  ]
  index.segments.forEach((seg, i) => {
    lines.push(`#EXTINF:${(seg.durationMs / 1000).toFixed(3)},`)
    lines.push(`course-media://lesson/?course=${courseQ}&file=${fileQ}&tsSeg=${i}`)
  })
  lines.push('#EXT-X-ENDLIST')
  return `${lines.join('\n')}\n`
}

/** Node stream of 188-byte packets for one playlist segment, plus its byte length. */
export function openTsSegment(absolutePath, index, segIndex) {
  const seg = index?.segments?.[segIndex]
  const packetSize = index?.packetSize
  if (!seg || !packetSize || seg.end <= seg.start) return null
  const count = Math.floor((seg.end - seg.start) / packetSize)
  if (count < 1) return null
  const psi = segIndex > 0 && index.psi ? Buffer.from(index.psi, 'base64') : Buffer.alloc(0)
  const stream = Readable.from(iterateSegment(absolutePath, seg.start, count, packetSize, psi))
  return { stream, length: psi.length + count * 188 }
}

async function readOrBuild(absolutePath, cacheFile) {
  const st = await fs.stat(absolutePath)
  const size = st.size
  const mtime = Math.round(st.mtimeMs)
  const cache = cacheFile ? await loadCache(cacheFile) : null
  const hit = cache?.files?.[absolutePath]
  if (hit && hit.s === size && hit.m === mtime && hit.packetSize && Array.isArray(hit.segments)) {
    return { packetSize: hit.packetSize, psi: hit.psi || '', segments: hit.segments }
  }

  const index = await indexTransportFile(absolutePath, size)
  if (cache) {
    cache.files[absolutePath] = {
      s: size,
      m: mtime,
      packetSize: index.packetSize,
      psi: index.psi,
      segments: index.segments
    }
    await saveCache(cacheFile, cache)
  }
  return index
}

async function indexTransportFile(absolutePath, size) {
  const fh = await fs.open(absolutePath, 'r')
  try {
    const indexer = new TsIndexer()
    const chunk = Buffer.alloc(1024 * 1024)
    let pos = 0
    while (pos < size) {
      const { bytesRead } = await fh.read(chunk, 0, Math.min(chunk.length, size - pos), pos)
      if (!bytesRead) break
      indexer.push(chunk.subarray(0, bytesRead))
      pos += bytesRead
    }
    return indexer.finish(size)
  } finally {
    await fh.close()
  }
}

async function* iterateSegment(absolutePath, start, count, packetSize, psi) {
  if (psi.length) yield psi
  const fh = await fs.open(absolutePath, 'r')
  try {
    const sync = packetSize === 192 ? 4 : 0
    const group = 32
    const raw = Buffer.alloc(packetSize * group)
    const extracted = packetSize === 188 ? null : Buffer.alloc(188 * group)
    let done = 0
    let pos = start
    while (done < count) {
      const n = Math.min(group, count - done)
      const need = n * packetSize
      const { bytesRead } = await fh.read(raw, 0, need, pos)
      if (bytesRead < need) break
      if (!extracted) {
        yield Buffer.from(raw.subarray(0, need))
      } else {
        for (let i = 0; i < n; i += 1) {
          raw.copy(extracted, i * 188, i * packetSize + sync, i * packetSize + sync + 188)
        }
        yield Buffer.from(extracted.subarray(0, n * 188))
      }
      pos += need
      done += n
    }
  } finally {
    await fh.close()
  }
}

class TsIndexer {
  constructor() {
    this.pending = Buffer.alloc(0)
    this.fileOffset = 0
    this.packetSize = null
    this.patDone = false
    this.pmtDone = false
    this.pmtPid = null
    this.videoPid = null
    this.videoType = null
    this.partialPat = null
    this.partialPmt = null
    this.patPackets = []
    this.pmtPackets = []
    this.keyframes = []
    this.firstPts = null
    this.maxPts = null
    this.firstPcr = null
    this.lastPcr = null
  }

  push(chunk) {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.pending = this.pending.length
      ? Buffer.concat([this.pending, incoming])
      : Buffer.from(incoming)
    if (!this.packetSize && this.pending.length >= 2048) {
      this.packetSize = detectPacketSize(this.pending)
      if (!this.packetSize) throw new Error('Not an MPEG-TS file')
    }
    if (this.packetSize) this.drain()
  }

  finish(fileSize) {
    if (!this.packetSize) {
      this.packetSize = detectPacketSize(this.pending)
      if (!this.packetSize) throw new Error('Not an MPEG-TS file')
    }
    this.drain()
    const aligned = fileSize - (fileSize % this.packetSize)
    if (!aligned) throw new Error('Not an MPEG-TS file')
    const psi = this.pmtDone
      ? Buffer.concat([...this.patPackets, ...this.pmtPackets])
      : Buffer.alloc(0)
    return {
      packetSize: this.packetSize,
      psi: psi.toString('base64'),
      segments: buildSegments(this, aligned)
    }
  }

  drain() {
    const size = this.packetSize
    const sync = size === 192 ? 4 : 0
    while (this.pending.length >= size) {
      if (this.pending[sync] !== 0x47) {
        this.pending = this.pending.subarray(1)
        this.fileOffset += 1
        continue
      }
      this.consume(this.pending.subarray(0, size), this.fileOffset)
      this.pending = this.pending.subarray(size)
      this.fileOffset += size
    }
    this.pending = this.pending.length ? Buffer.from(this.pending) : Buffer.alloc(0)
  }

  consume(packet, fileOffset) {
    const sync = this.packetSize === 192 ? 4 : 0
    const packet188 = packet.subarray(sync, sync + 188)
    const meta = inspectPacket(packet188)
    if (meta.pcr != null) {
      if (this.firstPcr == null) this.firstPcr = meta.pcr
      this.lastPcr = meta.pcr
    }
    if (!this.patDone && meta.pid === 0) this.consumePat(packet188, meta)
    else if (!this.pmtDone && this.pmtPid != null && meta.pid === this.pmtPid)
      this.consumePmt(packet188, meta)
    if (this.videoPid != null && meta.pid === this.videoPid && meta.pusi) {
      this.consumeVideo(meta, fileOffset)
    }
  }

  consumePat(packet188, meta) {
    if (this.patPackets.length < 6) this.patPackets.push(Buffer.from(packet188))
    const taken = takeSection(meta.payload, meta.pusi, this.partialPat)
    this.partialPat = taken.partial
    if (!taken.section || taken.section[0] !== 0x00) return
    const pmtPid = parsePat(taken.section)
    if (pmtPid == null) return
    this.pmtPid = pmtPid
    this.patDone = true
  }

  consumePmt(packet188, meta) {
    if (this.pmtPackets.length < 6) this.pmtPackets.push(Buffer.from(packet188))
    const taken = takeSection(meta.payload, meta.pusi, this.partialPmt)
    this.partialPmt = taken.partial
    if (!taken.section || taken.section[0] !== 0x02) return
    const video = parsePmtVideo(taken.section)
    if (!video) return
    this.videoPid = video.pid
    this.videoType = video.streamType
    this.pmtDone = true
  }

  consumeVideo(meta, fileOffset) {
    const pts = readPts(meta.payload)
    if (pts == null) return
    if (this.firstPts == null) this.firstPts = pts
    if (this.maxPts == null || pts > this.maxPts) this.maxPts = pts
    if (meta.rai || hasRandomAccessNal(meta.payload, this.videoType)) {
      const prev = this.keyframes[this.keyframes.length - 1]
      if (!prev || prev.offset !== fileOffset) this.keyframes.push({ offset: fileOffset, pts })
    }
  }
}

function buildSegments(indexer, aligned) {
  const { firstPts, maxPts, firstPcr, lastPcr, keyframes, packetSize } = indexer
  if (firstPts == null || maxPts == null) {
    const ticks = tsClockDelta(lastPcr, firstPcr)
    const durationMs = ticks > 0 ? Math.max(1, Math.round((ticks * 1000) / 90000)) : 1
    return [{ start: 0, end: aligned, durationMs }]
  }

  const boundaries = [{ offset: 0, pts: firstPts }]
  for (const kf of keyframes) {
    const prev = boundaries[boundaries.length - 1]
    if (kf.offset <= prev.offset || kf.offset >= aligned) continue
    if (kf.offset % packetSize !== 0) continue
    if (tsClockDelta(kf.pts, prev.pts) >= SEGMENT_TARGET_TICKS) {
      boundaries.push({ offset: kf.offset, pts: kf.pts })
    }
  }
  while (
    boundaries.length > 1 &&
    tsClockDelta(maxPts, boundaries[boundaries.length - 1].pts) <= 0
  ) {
    boundaries.pop()
  }

  const segments = []
  for (let i = 0; i < boundaries.length; i += 1) {
    const start = boundaries[i].offset
    const end = i + 1 < boundaries.length ? boundaries[i + 1].offset : aligned
    const endPts = i + 1 < boundaries.length ? boundaries[i + 1].pts : maxPts
    const ticks = tsClockDelta(endPts, boundaries[i].pts)
    if (end <= start) continue
    segments.push({
      start,
      end,
      durationMs: Math.max(1, Math.round((ticks * 1000) / 90000))
    })
  }
  return segments.length ? segments : [{ start: 0, end: aligned, durationMs: 1 }]
}

function inspectPacket(packet) {
  const pid = ((packet[1] & 0x1f) << 8) | packet[2]
  const pusi = (packet[1] & 0x40) !== 0
  const afc = (packet[3] >> 4) & 0x3
  let cursor = 4
  let rai = false
  let pcr = null
  if (afc === 2 || afc === 3) {
    const length = packet[cursor] || 0
    if (length > 0 && cursor + 1 < packet.length) {
      rai = (packet[cursor + 1] & 0x40) !== 0
      pcr = pcrBaseAt(packet, 0)
    }
    cursor = 5 + length
  }
  const hasPayload = afc === 1 || afc === 3
  const payload = hasPayload && cursor < packet.length ? packet.subarray(cursor) : Buffer.alloc(0)
  return { pid, pusi, rai, pcr, payload }
}

function takeSection(payload, pusi, partial) {
  let data
  if (pusi) {
    if (!payload.length) return { section: null, partial: null }
    const pointer = payload[0]
    if (1 + pointer >= payload.length) return { section: null, partial: null }
    data = payload.subarray(1 + pointer)
  } else if (partial?.length) {
    data = Buffer.concat([partial, payload])
  } else {
    return { section: null, partial: null }
  }
  if (data.length < 3) return { section: null, partial: Buffer.from(data) }
  const total = 3 + (((data[1] & 0x0f) << 8) | data[2])
  if (total < 8 || total > 1024) return { section: null, partial: null }
  if (data.length < total) return { section: null, partial: Buffer.from(data) }
  return { section: data.subarray(0, total), partial: null }
}

function parsePat(section) {
  const sectionLength = ((section[1] & 0x0f) << 8) | section[2]
  const end = Math.min(section.length, 3 + sectionLength - 4)
  for (let i = 8; i + 4 <= end; i += 4) {
    const program = section.readUInt16BE(i)
    const pid = section.readUInt16BE(i + 2) & 0x1fff
    if (program !== 0) return pid
  }
  return null
}

function parsePmtVideo(section) {
  const sectionLength = ((section[1] & 0x0f) << 8) | section[2]
  const programInfoLength = ((section[10] & 0x0f) << 8) | section[11]
  const end = Math.min(section.length, 3 + sectionLength - 4)
  let i = 12 + programInfoLength
  while (i + 5 <= end) {
    const streamType = section[i]
    const pid = ((section[i + 1] & 0x1f) << 8) | section[i + 2]
    const esInfoLength = ((section[i + 3] & 0x0f) << 8) | section[i + 4]
    if (VIDEO_TYPES.has(streamType)) return { streamType, pid }
    i += 5 + esInfoLength
  }
  return null
}

function readPts(pes) {
  if (!pes || pes.length < 14 || pes[0] !== 0 || pes[1] !== 0 || pes[2] !== 1) return null
  if (pes[3] === 0xbe || (pes[7] & 0x80) === 0) return null
  const o = 9
  if (pes.length < o + 5) return null
  return Number(
    (BigInt(pes[o] & 0x0e) << 29n) |
      (BigInt(pes[o + 1]) << 22n) |
      (BigInt(pes[o + 2] & 0xfe) << 14n) |
      (BigInt(pes[o + 3]) << 7n) |
      (BigInt(pes[o + 4] & 0xfe) >> 1n)
  )
}

function hasRandomAccessNal(pes, videoType) {
  if (!pes || pes.length < 14 || pes[0] !== 0 || pes[1] !== 0 || pes[2] !== 1) return false
  const data = pes.subarray(9 + (pes[8] || 0))
  for (let i = 0; i + 3 < data.length; i += 1) {
    let nalIndex = -1
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) nalIndex = i + 3
    else if (
      i + 4 < data.length &&
      data[i] === 0 &&
      data[i + 1] === 0 &&
      data[i + 2] === 0 &&
      data[i + 3] === 1
    ) {
      nalIndex = i + 4
    }
    if (nalIndex < 0 || nalIndex >= data.length) continue
    const nal = data[nalIndex]
    if (videoType === 0x24) {
      const kind = (nal >> 1) & 0x3f
      if (kind >= 16 && kind <= 21) return true
    } else if ((nal & 0x1f) === 5) return true
  }
  return false
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
  // Indexes are kept by absolute path and hold every segment offset. Drop the ones whose
  // file is gone, once per session, so the file does not grow with every video ever played.
  let pruned = false
  for (const absolutePath of Object.keys(cache.files)) {
    try {
      await fs.access(absolutePath)
    } catch {
      delete cache.files[absolutePath]
      pruned = true
    }
  }
  if (pruned) await saveCache(cacheFile, cache).catch(() => {})
  return cache
}

async function saveCache(cacheFile, cache) {
  await fs.mkdir(path.dirname(cacheFile), { recursive: true })
  const temp = `${cacheFile}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(cache))
  await fs.rename(temp, cacheFile)
}
