import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { writeFileAtomic, writeFileAtomicSync } from './atomicFile.js'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-file-'))
}

describe('writeFileAtomicSync', () => {
  it('creates missing folders and replaces the file whole', () => {
    const dir = tempDir()
    const file = path.join(dir, 'nested', 'store.json')
    writeFileAtomicSync(file, '{"a":1}')
    writeFileAtomicSync(file, '{"a":2}')
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":2}')
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['store.json'])
  })

  it('leaves the old file in place when the write fails', () => {
    const dir = tempDir()
    const file = path.join(dir, 'store.json')
    writeFileAtomicSync(file, 'old')
    // A folder where the file should be makes the rename fail after the temp is written.
    const blocked = path.join(dir, 'blocked')
    fs.mkdirSync(path.join(blocked, 'inner'), { recursive: true })
    assert.throws(() => writeFileAtomicSync(blocked, 'new'))
    assert.equal(fs.readFileSync(file, 'utf8'), 'old')
    assert.deepEqual(fs.readdirSync(dir).sort(), ['blocked', 'store.json'])
  })
})

describe('writeFileAtomic', () => {
  it('writes text and buffers', async () => {
    const dir = tempDir()
    const file = path.join(dir, 'props.json')
    await writeFileAtomic(file, 'one')
    await writeFileAtomic(file, Buffer.from('two'))
    assert.equal(fs.readFileSync(file, 'utf8'), 'two')
    assert.deepEqual(fs.readdirSync(dir), ['props.json'])
  })
})
