import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  clearTsIndexMemoryCache,
  indexTsBuffer,
  loadTsIndex,
  openTsSegment,
  renderPlaylist
} from './tsIndex.js'

const PMT_PID = 0x1000
const VIDEO_PID = 0x100

function writePts(buf, offset, pts) {
  const value = BigInt(pts)
  buf[offset] = Number(0x21n | ((value >> 29n) & 0x0en))
  buf[offset + 1] = Number((value >> 22n) & 0xffn)
  buf[offset + 2] = Number(((value >> 14n) & 0xfen) | 1n)
  buf[offset + 3] = Number((value >> 7n) & 0xffn)
  buf[offset + 4] = Number(((value << 1n) & 0xfen) | 1n)
}

function videoPes(pts, idr) {
  const nal = Buffer.from(idr ? [0, 0, 0, 1, 0x65, 0x88] : [0, 0, 0, 1, 0x41, 0x88])
  const pes = Buffer.alloc(14 + nal.length)
  pes[2] = 1
  pes[3] = 0xe0
  pes[6] = 0x80
  pes[7] = 0x80
  pes[8] = 5
  writePts(pes, 9, pts)
  nal.copy(pes, 14)
  return pes
}

function tsPacket(pid, payload, { pusi = false, rai = false } = {}) {
  const pkt = Buffer.alloc(188, 0xff)
  pkt[0] = 0x47
  pkt[1] = (pusi ? 0x40 : 0) | ((pid >> 8) & 0x1f)
  pkt[2] = pid & 0xff
  if (rai) {
    pkt[3] = 0x30
    pkt[4] = 1
    pkt[5] = 0x40
    payload.copy(pkt, 6)
  } else {
    pkt[3] = 0x10
    payload.copy(pkt, 4)
  }
  return pkt
}

function patPacket() {
  const section = Buffer.alloc(16)
  section[0] = 0x00
  section[1] = 0xb0
  section[2] = 13
  section[5] = 0x01
  section[8] = 0x00
  section[9] = 0x01
  section[10] = 0xe0 | ((PMT_PID >> 8) & 0x1f)
  section[11] = PMT_PID & 0xff
  return tsPacket(0, Buffer.concat([Buffer.from([0]), section]), { pusi: true })
}

function pmtPacket() {
  const section = Buffer.alloc(21)
  section[0] = 0x02
  section[1] = 0xb0
  section[2] = 18
  section[3] = 0x00
  section[4] = 0x01
  section[5] = 0x01
  section[8] = 0xe0 | ((VIDEO_PID >> 8) & 0x1f)
  section[9] = VIDEO_PID & 0xff
  section[10] = 0xf0
  section[12] = 0x1b
  section[13] = 0xe0 | ((VIDEO_PID >> 8) & 0x1f)
  section[14] = VIDEO_PID & 0xff
  section[15] = 0xf0
  return tsPacket(PMT_PID, Buffer.concat([Buffer.from([0]), section]), { pusi: true })
}

function videoPacket(pts, { idr = false, rai = false } = {}) {
  return tsPacket(VIDEO_PID, videoPes(pts, idr), { pusi: true, rai })
}

function nullPacket() {
  return tsPacket(0x1fff, Buffer.alloc(0))
}

function sampleTs() {
  return Buffer.concat([
    patPacket(),
    pmtPacket(),
    videoPacket(0, { idr: true, rai: true }),
    nullPacket(),
    videoPacket(10 * 90000, { idr: true, rai: true }),
    nullPacket(),
    videoPacket(16 * 90000)
  ])
}

function pidAt(buf, offset) {
  return ((buf[offset + 1] & 0x1f) << 8) | buf[offset + 2]
}

async function readAll(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

describe('indexTsBuffer', () => {
  it('splits on keyframes about eight seconds apart', () => {
    const index = indexTsBuffer(sampleTs())
    assert.equal(index.packetSize, 188)
    assert.equal(index.segments.length, 2)
    assert.deepEqual(
      index.segments.map((seg) => seg.durationMs),
      [10000, 6000]
    )
    assert.equal(index.segments[0].start, 0)
    assert.equal(index.segments[1].start, 4 * 188)
    assert.ok(index.psi.length > 0)
  })

  it('keeps a 33-bit PTS without wrapping through 32-bit math', () => {
    const origin = 2 ** 32
    const body = Buffer.concat([
      patPacket(),
      pmtPacket(),
      videoPacket(origin, { idr: true, rai: true }),
      videoPacket(origin + 90000, { idr: true, rai: true })
    ])
    const index = indexTsBuffer(body)
    assert.equal(index.segments.length, 1)
    assert.equal(index.segments[0].durationMs, 1000)
  })

  it('reads 192-byte packets and still times the video', () => {
    const body = Buffer.concat(
      [
        patPacket(),
        pmtPacket(),
        videoPacket(0, { idr: true }),
        videoPacket(10 * 90000, { idr: true })
      ].map((packet) => {
        const wrapped = Buffer.alloc(192)
        packet.copy(wrapped, 4)
        return wrapped
      })
    )
    const index = indexTsBuffer(body)
    assert.equal(index.packetSize, 192)
    assert.equal(index.segments.length, 1)
    assert.equal(index.segments[0].durationMs, 10000)
    assert.equal(index.segments[0].end % 192, 0)
  })

  it('rejects a file that is not a transport stream', () => {
    assert.throws(() => indexTsBuffer(Buffer.from('not a transport stream')), /MPEG-TS/)
  })
})

describe('transport stream playlist', () => {
  it('points each segment at a course-media url and prepends PSI on later segments', async () => {
    const body = sampleTs()
    const index = indexTsBuffer(body)
    const text = renderPlaylist(index, 'Demo Course', 'part/01.ts')
    assert.match(text, /#EXT-X-TARGETDURATION:10\n/)
    assert.match(
      text,
      /#EXTINF:10\.000,\ncourse-media:\/\/lesson\/\?course=Demo%20Course&file=part%2F01\.ts&tsSeg=0/
    )
    assert.match(text, /tsSeg=1/)
    assert.match(text, /#EXT-X-ENDLIST\n$/)

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-ts-'))
    const file = path.join(dir, '01.ts')
    fs.writeFileSync(file, body)

    const first = openTsSegment(file, index, 0)
    const opening = await readAll(first.stream)
    assert.equal(opening.length, first.length)
    assert.equal(pidAt(opening, 0), 0)
    assert.equal(opening.length, index.segments[0].end - index.segments[0].start)

    const second = openTsSegment(file, index, 1)
    const rest = await readAll(second.stream)
    assert.equal(rest.length, second.length)
    assert.equal(pidAt(rest, 0), 0)
    assert.equal(pidAt(rest, 188), PMT_PID)
    assert.equal(pidAt(rest, 376), VIDEO_PID)
    assert.ok(rest.length > index.segments[1].end - index.segments[1].start)
  })

  it('reuses a cached index when the file is unchanged', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-ts-cache-'))
    const file = path.join(dir, '01.ts')
    const cacheFile = path.join(dir, 'ts-index.json')
    fs.writeFileSync(file, sampleTs())

    const index = await loadTsIndex(file, cacheFile)
    assert.equal(index.segments[1].durationMs, 6000)

    clearTsIndexMemoryCache()
    const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    const key = Object.keys(raw.files)[0]
    raw.files[key].segments[1].durationMs = 4242
    fs.writeFileSync(cacheFile, JSON.stringify(raw))

    const again = await loadTsIndex(file, cacheFile)
    assert.equal(again.segments[1].durationMs, 4242)
  })
})
