import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  applyLessonDurations,
  clearDurationMemoryCache,
  probeDuration,
  pruneCourseEntries
} from './mediaDuration.js'

function box(type, payload) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + payload.length)
  head.write(type, 4, 4, 'ascii')
  return Buffer.concat([head, payload])
}

function mvhd(timescale, duration) {
  const body = Buffer.alloc(100)
  body.writeUInt32BE(timescale, 12)
  body.writeUInt32BE(duration, 16)
  return box('mvhd', body)
}

function vintSize(length) {
  if (length < 0x7f) return Buffer.from([0x80 | length])
  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(0x4000 | length)
  return buf
}

function element(id, data) {
  return Buffer.concat([id, vintSize(data.length), data])
}

const ID = {
  ebml: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  segment: Buffer.from([0x18, 0x53, 0x80, 0x67]),
  info: Buffer.from([0x15, 0x49, 0xa9, 0x66]),
  scale: Buffer.from([0x2a, 0xd7, 0xb1]),
  duration: Buffer.from([0x44, 0x89]),
  cluster: Buffer.from([0x1f, 0x43, 0xb6, 0x75])
}

function writePcr(buf, offset, base) {
  const value = BigInt(base)
  buf[offset] = Number((value >> 25n) & 0xffn)
  buf[offset + 1] = Number((value >> 17n) & 0xffn)
  buf[offset + 2] = Number((value >> 9n) & 0xffn)
  buf[offset + 3] = Number((value >> 1n) & 0xffn)
  buf[offset + 4] = Number(((value & 1n) << 7n) | 0x7en)
  buf[offset + 5] = 0
}

function pcrPacket(base) {
  const pkt = Buffer.alloc(188, 0xff)
  pkt[0] = 0x47
  pkt[1] = 0x00
  pkt[2] = 0x00
  pkt[3] = 0x20
  pkt[4] = 183
  pkt[5] = 0x10
  writePcr(pkt, 6, base)
  return pkt
}

function nullTsPacket() {
  const pkt = Buffer.alloc(188, 0xff)
  pkt[0] = 0x47
  pkt[1] = 0x1f
  pkt[2] = 0xff
  pkt[3] = 0x10
  return pkt
}

function writeTemp(name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-duration-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, body)
  return { dir, file }
}

describe('probeDuration', () => {
  it('reads an mp4 length when moov sits after mdat', async () => {
    const body = Buffer.concat([
      box('ftyp', Buffer.from('isom')),
      box('mdat', Buffer.alloc(64)),
      box('moov', mvhd(1000, 125000))
    ])
    const { file } = writeTemp('late.mp4', body)
    assert.equal(await probeDuration(file), 125)
  })

  it('reads a matroska duration without scanning past the cluster', async () => {
    const scale = Buffer.alloc(3)
    scale.writeUIntBE(1_000_000, 0, 3)
    const duration = Buffer.alloc(8)
    duration.writeDoubleBE(90_000)
    const info = Buffer.concat([element(ID.scale, scale), element(ID.duration, duration)])
    const segment = Buffer.concat([element(ID.info, info), element(ID.cluster, Buffer.alloc(4096))])
    const body = Buffer.concat([
      element(ID.ebml, Buffer.from('matroska')),
      element(ID.segment, segment)
    ])
    const { file } = writeTemp('clip.mkv', body)
    assert.equal(await probeDuration(file), 90)
  })

  it('reads a transport stream length from the first and last PCR', async () => {
    const { file } = writeTemp(
      'clip.ts',
      Buffer.concat([pcrPacket(0), nullTsPacket(), pcrPacket(125 * 90000)])
    )
    assert.equal(await probeDuration(file), 125)
  })

  it('reads a 192-byte transport stream length', async () => {
    const body = Buffer.concat(
      [pcrPacket(0), nullTsPacket(), pcrPacket(2 * 90000)].map((packet) => {
        const wrapped = Buffer.alloc(192)
        packet.copy(wrapped, 4)
        return wrapped
      })
    )
    const { file } = writeTemp('clip.m2ts', body)
    assert.equal(await probeDuration(file), 2)
  })

  it('reads an avi length from the avih header', async () => {
    const avih = Buffer.alloc(8 + 56)
    avih.write('avih', 0, 4, 'ascii')
    avih.writeUInt32LE(56, 4)
    avih.writeUInt32LE(33333, 8)
    avih.writeUInt32LE(300, 24)
    const { file } = writeTemp('clip.avi', avih)
    const seconds = await probeDuration(file)
    assert.ok(Math.abs(seconds - 9.9999) < 0.01)
  })

  it('reads a wav length from the data chunk size', async () => {
    const fmt = Buffer.alloc(8 + 16)
    fmt.write('fmt ', 0, 4, 'ascii')
    fmt.writeUInt32LE(16, 4)
    fmt.writeUInt32LE(176400, 16)
    const data = Buffer.alloc(8)
    data.write('data', 0, 4, 'ascii')
    data.writeUInt32LE(176400, 4)
    const riff = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVE'),
      fmt,
      data
    ])
    const { file } = writeTemp('voice.wav', riff)
    assert.equal(await probeDuration(file), 1)
  })

  it('reads a flac length from the stream info block', async () => {
    const info = Buffer.alloc(34)
    info[10] = 0x0a
    info[11] = 0xc4
    info[12] = 0x40
    info[16] = 0xac
    info[17] = 0x44
    const header = Buffer.alloc(4)
    header.writeUIntBE(34, 1, 3)
    const body = Buffer.concat([Buffer.from('fLaC'), header, info])
    const { file } = writeTemp('take.flac', body)
    assert.equal(await probeDuration(file), 1)
  })

  it('estimates an mp3 length from the first frame bitrate', async () => {
    const frame = Buffer.from([0xff, 0xfb, 0x90, 0x00])
    const body = Buffer.concat([frame, Buffer.alloc(16000 - 4)])
    const { file } = writeTemp('song.mp3', body)
    const seconds = await probeDuration(file)
    assert.ok(Math.abs(seconds - 1) < 0.05)
  })
})

describe('applyLessonDurations', () => {
  it('reuses the cache when the file has not changed', async () => {
    const body = Buffer.concat([box('ftyp', Buffer.from('isom')), box('moov', mvhd(1000, 10000))])
    const { dir, file } = writeTemp('a.mp4', body)
    const cacheFile = path.join(dir, 'cache.json')
    const lesson = { kind: 'video', relativePath: 'a.mp4' }
    await applyLessonDurations(dir, 'Demo', [lesson], { cacheFile })
    assert.equal(lesson.durationSec, 10)

    const again = { kind: 'video', relativePath: 'a.mp4' }
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    const key = Object.keys(cache.files)[0]
    cache.files[key].d = 42
    fs.writeFileSync(cacheFile, JSON.stringify(cache))
    clearDurationMemoryCache()
    await applyLessonDurations(dir, 'Demo', [again], { cacheFile })
    assert.equal(again.durationSec, 42)
  })
})

describe('pruneCourseEntries', () => {
  it('drops this course entries for files it no longer has and keeps other courses', () => {
    const cache = {
      files: {
        'Demo/a.mp4': { d: 1 },
        'Demo/old.mp4': { d: 2 },
        'Other/old.mp4': { d: 3 }
      }
    }
    assert.equal(pruneCourseEntries(cache, 'Demo', [{ relativePath: 'a.mp4' }]), true)
    assert.deepEqual(Object.keys(cache.files).sort(), ['Demo/a.mp4', 'Other/old.mp4'])
    assert.equal(pruneCourseEntries(cache, 'Demo', [{ relativePath: 'a.mp4' }]), false)
  })
})
