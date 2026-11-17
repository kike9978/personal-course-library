import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  applyLessonDurations,
  clearDurationMemoryCache,
  probeDuration
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
    const segment = Buffer.concat([
      element(ID.info, info),
      element(ID.cluster, Buffer.alloc(4096))
    ])
    const body = Buffer.concat([
      element(ID.ebml, Buffer.from('matroska')),
      element(ID.segment, segment)
    ])
    const { file } = writeTemp('clip.mkv', body)
    assert.equal(await probeDuration(file), 90)
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
    const riff = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), fmt, data])
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
