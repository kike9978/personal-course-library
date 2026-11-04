import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { zipFolders } from './zipFolders.js'

describe('zipFolders', () => {
  it('stores a course folder under its library name', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-zip-'))
    const course = path.join(root, 'Lighting')
    fs.mkdirSync(course)
    fs.writeFileSync(path.join(course, 'courseProps.json'), '{"title":"Lighting"}\n')
    const dest = path.join(root, 'out.zip')

    const totals = []
    await zipFolders([{ name: 'Lighting', folder: course }], dest, {
      onProgress: (progress) => totals.push(progress.totalBytes)
    })
    const fileBytes = fs.statSync(path.join(course, 'courseProps.json')).size
    assert.ok(totals.length > 0)
    assert.ok(totals.every((total) => total === fileBytes))

    const zip = fs.readFileSync(dest)
    const stored = zip.includes(Buffer.from('Lighting/courseProps.json'))
    const storedAlt = zip.includes(Buffer.from('Lighting\\courseProps.json'))
    assert.equal(stored || storedAlt, true)
    assert.equal(fs.existsSync(dest), true)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('stops the current file when cancel is requested', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-zip-'))
    const course = path.join(root, 'Lighting')
    fs.mkdirSync(course)
    fs.writeFileSync(path.join(course, 'video.bin'), Buffer.alloc(8 * 1024 * 1024, 7))
    const dest = path.join(root, 'out.zip')
    let abort = null

    const error = await zipFolders([{ name: 'Lighting', folder: course }], dest, {
      registerAbort: (fn) => {
        abort = fn
      },
      onProgress: (progress) => {
        if (progress.processedBytes > 0) abort?.()
      }
    }).then(
      () => null,
      (caught) => caught
    )

    assert.equal(error?.code, 'CANCELED')
    assert.equal(fs.existsSync(dest), false)
    fs.rmSync(root, { recursive: true, force: true })
  })
})
