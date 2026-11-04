import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  applyCoursePick,
  collectExportCoursePaths,
  courseFolderName,
  folderIsInsideLibrary
} from './courseExportSelection.js'

describe('course folder names', () => {
  it('keeps the library folder and drops parent segments', () => {
    assert.equal(courseFolderName('Lighting'), 'Lighting')
    assert.equal(courseFolderName('library/Lighting/'), 'Lighting')
    assert.equal(courseFolderName('..'), '')
    assert.equal(courseFolderName(''), '')
  })

  it('accepts only a folder nested in the library', () => {
    const library = path.resolve('/library')
    assert.equal(folderIsInsideLibrary(library, path.resolve('/library/Lighting')), true)
    assert.equal(folderIsInsideLibrary(library, library), false)
    assert.equal(folderIsInsideLibrary(library, path.resolve('/etc/passwd')), false)
    assert.equal(folderIsInsideLibrary(library, path.resolve('/library/../etc')), false)
  })
})

describe('course pick', () => {
  const order = ['a', 'b', 'c', 'd']

  it('toggles one course and remembers the anchor', () => {
    const first = applyCoursePick(new Set(), order, 'b')
    assert.deepEqual([...first.selected], ['b'])
    assert.equal(first.anchor, 'b')
    const second = applyCoursePick(first.selected, order, 'b', { anchor: first.anchor })
    assert.equal(second.selected.size, 0)
  })

  it('adds the visible range from the anchor', () => {
    const picked = applyCoursePick(new Set(['b']), order, 'd', { range: true, anchor: 'b' })
    assert.deepEqual([...picked.selected], ['b', 'c', 'd'])
  })
})

describe('export paths from lists', () => {
  const playlists = [
    { id: 'root', coursePaths: ['A', 'B'], childIds: ['child'] },
    { id: 'child', coursePaths: ['B', 'C'], childIds: [] },
    { id: 'other', coursePaths: ['D'], childIds: [] }
  ]

  it('unions checked courses with a list and its nested lists', () => {
    const names = collectExportCoursePaths(playlists, {
      coursePaths: ['D', 'A'],
      playlistIds: ['root']
    })
    assert.deepEqual(names, ['D', 'A', 'B', 'C'])
  })

  it('walks a nested list on its own without the parent', () => {
    const names = collectExportCoursePaths(playlists, { playlistIds: ['child'] })
    assert.deepEqual(names, ['B', 'C'])
  })
})
