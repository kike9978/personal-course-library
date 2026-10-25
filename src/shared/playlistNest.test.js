import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { settleNesting } from './playlistNest.js'

describe('nested playlists', () => {
  it('keeps one level and points each child at its parent', () => {
    const settled = settleNesting([
      { id: 'path', title: 'Camino', childIds: ['step', 'missing', 'step'] },
      { id: 'step', title: 'Figura', childIds: ['deeper'] },
      { id: 'deeper', title: 'Detalle', childIds: [] }
    ])
    const path = settled.find((playlist) => playlist.id === 'path')
    const step = settled.find((playlist) => playlist.id === 'step')
    const deeper = settled.find((playlist) => playlist.id === 'deeper')
    assert.deepEqual(path.childIds, ['step'])
    assert.equal(path.parentId, '')
    assert.equal(step.parentId, 'path')
    assert.deepEqual(step.childIds, [])
    assert.equal(deeper.parentId, '')
  })
})
