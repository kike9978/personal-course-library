import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coverQueryFor,
  imageFileFromTransfer,
  imageUrlFromTransfer,
  transferMayHoldImage
} from './coverDrop.js'

function transfer(data = {}, { files = [], types } = {}) {
  return {
    getData: (type) => data[type] || '',
    files,
    items: [],
    types: types || [...Object.keys(data), ...(files.length ? ['Files'] : [])]
  }
}

describe('imageUrlFromTransfer', () => {
  it('reads the first https line of a uri list and skips comments', () => {
    const dt = transfer({ 'text/uri-list': '# comment\nhttps://img.test/a.jpg\nhttps://b' })
    assert.equal(imageUrlFromTransfer(dt), 'https://img.test/a.jpg')
  })

  it('falls back to the img src of dragged html and unescapes ampersands', () => {
    const dt = transfer({ 'text/html': '<a><img alt="" src="https://img.test/x?a=1&amp;b=2"></a>' })
    assert.equal(imageUrlFromTransfer(dt), 'https://img.test/x?a=1&b=2')
  })

  it('ignores plain http and non urls', () => {
    assert.equal(imageUrlFromTransfer(transfer({ 'text/plain': 'http://img.test/a.jpg' })), '')
    assert.equal(imageUrlFromTransfer(transfer({ 'text/plain': 'hola' })), '')
  })

  it('accepts data image urls', () => {
    const dt = transfer({ 'text/plain': 'data:image/png;base64,AAAA' })
    assert.equal(imageUrlFromTransfer(dt), 'data:image/png;base64,AAAA')
  })
})

describe('imageFileFromTransfer', () => {
  it('picks the first supported image file', () => {
    const gif = { name: 'a.gif', type: 'image/gif' }
    const png = { name: 'b.png', type: 'image/png' }
    assert.equal(imageFileFromTransfer(transfer({}, { files: [gif, png] })), png)
  })

  it('returns null with no image', () => {
    assert.equal(
      imageFileFromTransfer(transfer({}, { files: [{ name: 'a.txt', type: 'text/plain' }] })),
      null
    )
  })
})

describe('transferMayHoldImage', () => {
  it('is true for files and links, false for app drags', () => {
    assert.equal(transferMayHoldImage(transfer({}, { types: ['Files'] })), true)
    assert.equal(transferMayHoldImage(transfer({}, { types: ['text/uri-list'] })), true)
    assert.equal(transferMayHoldImage(transfer({}, { types: ['application/x-course'] })), false)
  })
})

describe('coverQueryFor', () => {
  it('joins institution and title', () => {
    assert.equal(
      coverQueryFor({ institution: ' Domestika ', title: 'Storyboard' }),
      'Domestika Storyboard'
    )
    assert.equal(coverQueryFor({ title: 'Solo' }), 'Solo')
    assert.equal(
      coverQueryFor({ institution: 'SaaSWAVE', title: 'SaaSWAVE Course' }),
      'SaaSWAVE Course'
    )
  })
})
