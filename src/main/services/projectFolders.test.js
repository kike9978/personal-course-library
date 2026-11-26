import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  folderRelativeToRoot,
  normalizeFolderRelative,
  resolveFolderRelative
} from './projectFolders.js'

const win = { pathApi: path.win32, platform: 'win32' }
const mac = { pathApi: path.posix, platform: 'darwin' }

describe('normalizeFolderRelative', () => {
  it('uses forward slashes and drops empty parts', () => {
    assert.equal(normalizeFolderRelative('3d\\donut\\'), '3d/donut')
    assert.equal(normalizeFolderRelative('/3d//donut'), '3d/donut')
  })

  it('rejects parent and empty paths', () => {
    assert.equal(normalizeFolderRelative('../secret'), null)
    assert.equal(normalizeFolderRelative('a/./b'), null)
    assert.equal(normalizeFolderRelative('  '), null)
    assert.equal(normalizeFolderRelative(null), null)
  })

  it('stores accents in NFC so macOS and Windows names match', () => {
    const decomposed = 'disen\u0303o'
    assert.equal(normalizeFolderRelative(decomposed), 'diseño')
  })
})

describe('folderRelativeToRoot', () => {
  it('relates a Windows folder inside the root', () => {
    assert.equal(
      folderRelativeToRoot('D:\\Sync\\Proyectos', 'D:\\Sync\\Proyectos\\3D\\Donut', win),
      '3D/Donut'
    )
  })

  it('ignores case on Windows and macOS', () => {
    assert.equal(
      folderRelativeToRoot('d:\\sync\\proyectos', 'D:\\Sync\\Proyectos\\Donut', win),
      'Donut'
    )
    assert.equal(
      folderRelativeToRoot('/Users/ana/Sync/proyectos', '/Users/ana/Sync/Proyectos/Donut', mac),
      'Donut'
    )
  })

  it('returns null outside the root or for the root itself', () => {
    assert.equal(folderRelativeToRoot('/Users/ana/Sync', '/Users/ana/Other/x', mac), null)
    assert.equal(folderRelativeToRoot('/Users/ana/Sync', '/Users/ana/Sync', mac), null)
    assert.equal(folderRelativeToRoot('/Users/ana/Sync', '/Users/ana/SyncOld/x', mac), null)
    assert.equal(folderRelativeToRoot('C:\\Sync', 'D:\\Sync\\x', win), null)
    assert.equal(folderRelativeToRoot(null, '/x', mac), null)
  })
})

describe('resolveFolderRelative', () => {
  it('builds the local path from the shared relative one', () => {
    assert.equal(
      resolveFolderRelative('D:\\Sync\\Proyectos', '3D/Donut', win),
      'D:\\Sync\\Proyectos\\3D\\Donut'
    )
    assert.equal(
      resolveFolderRelative('/Users/ana/Sync/Proyectos', '3D/Donut', mac),
      '/Users/ana/Sync/Proyectos/3D/Donut'
    )
  })

  it('needs a root and a clean relative path', () => {
    assert.equal(resolveFolderRelative(null, 'x', mac), null)
    assert.equal(resolveFolderRelative('/root', '../x', mac), null)
  })
})
