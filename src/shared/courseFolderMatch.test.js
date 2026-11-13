import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { courseCatalog, resolveFolderName, sameFolder } from './courseFolderMatch.js'

const folder = 'Domestika - Fundamentos de la tipografía'

describe('course folder match', () => {
  it('maps a decomposed folder name onto the library folder', () => {
    const stored = folder.normalize('NFD')
    assert.notEqual(stored, folder)
    assert.equal(resolveFolderName(stored, [folder, 'Lettering']), folder)
    assert.equal(sameFolder(stored, folder), true)
  })

  it('keeps an exact folder and does not guess when two folders fold together', () => {
    assert.equal(resolveFolderName(folder, [folder]), folder)
    const stored = folder.normalize('NFD')
    const resolved = resolveFolderName(stored, [folder, folder.toLowerCase()])
    assert.equal(resolved, stored)
  })

  it('finds the catalog course from the list string', () => {
    const catalog = courseCatalog([
      { path: folder, title: 'Fundamentos de la tipografía', institution: 'DOMESTIKA' }
    ])
    const course = catalog.get(folder.normalize('NFD'))
    assert.equal(course.title, 'Fundamentos de la tipografía')
    assert.equal(catalog.get('Missing'), null)
  })
})
