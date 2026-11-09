import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  blocksToBody,
  bodyToBlocks,
  decideDelete,
  decideSync,
  normalizeDatabaseId,
  notionErrorMessage,
  notionPlace,
  wireHash
} from './notionSync.js'

describe('notion wire text', () => {
  it('hashes the same note when only line endings change', () => {
    const left = wireHash('Título  doble', 'Hola \r\n\r\n\r\nmundo')
    const right = wireHash('Título doble', 'Hola\n\nmundo')
    assert.equal(left, right)
  })

  it('round-trips markdown through one code block', () => {
    const body = 'Nota\n\n@[time:12.5](0:12)\n\n[[lesson|Uno|abc]]'
    const blocks = bodyToBlocks(body)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].type, 'code')
    assert.equal(blocksToBody(blocks), 'Nota\n\n@[time:12.5](0:12)\n\n[[lesson|Uno|abc]]')
  })

  it('reads a paragraph Notion added under the code block', () => {
    const blocks = [
      ...bodyToBlocks('Una línea'),
      {
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Escrito en Notion' }] }
      }
    ]
    assert.equal(blocksToBody(blocks), 'Una línea\nEscrito en Notion')
  })

  it('places a note on the same course and file as the sidebar', () => {
    const loose = notionPlace({ anchors: [] })
    assert.equal(loose.courseTitle, 'Sin curso')
    assert.equal(loose.fileTitle, null)

    const placed = notionPlace(
      {
        anchors: [
          {
            coursePath: '/library/pack',
            lessonRelativePath: '01 Orientation.mp4',
            lessonTitle: 'Orientation'
          }
        ]
      },
      { pack: '2D Action Animation Starter Pack' }
    )
    assert.equal(placed.courseTitle, '2D Action Animation Starter Pack')
    assert.equal(placed.fileTitle, 'Orientation')
    assert.equal(placed.courseKey, 'course:pack')

    const collapsed = notionPlace(
      {
        anchors: [{ coursePath: 'pack', lessonRelativePath: 'intro.mp4', lessonTitle: 'Pack' }]
      },
      { pack: 'Pack' }
    )
    assert.equal(collapsed.fileTitle, null)

    const journal = notionPlace({ anchors: [{ coursePath: 'pack' }] }, { pack: 'Pack' })
    assert.equal(journal.fileTitle, 'Del curso')
  })

  it('reads a database id from a Notion link', () => {
    const id = normalizeDatabaseId(
      'https://www.notion.so/Anotaciones-1a2b3c4d5e6f7890abcdef1234567890?v=1'
    )
    assert.equal(id, '1a2b3c4d-5e6f-7890-abcd-ef1234567890')
    assert.equal(
      normalizeDatabaseId(
        'https://app.notion.com/p/kikeprueba/41321eadd6278010ba0bfd4e972ad233?v=41321eadd6278026b027000c9c582c9f&source=copy_link'
      ),
      '41321ead-d627-8010-ba0b-fd4e972ad233'
    )
    assert.equal(normalizeDatabaseId(''), '')
    assert.equal(normalizeDatabaseId('no es un id'), '')
  })
})

describe('notion reconcile', () => {
  it('creates a page when the note has never been synced', () => {
    assert.equal(
      decideSync({ hasRemote: false, localHash: 'a', remoteHash: null, ackedHash: null }),
      'create'
    )
  })

  it('pushes when only the local text moved', () => {
    assert.equal(
      decideSync({ hasRemote: true, localHash: 'local', remoteHash: 'acked', ackedHash: 'acked' }),
      'push'
    )
  })

  it('pulls when only Notion moved', () => {
    assert.equal(
      decideSync({ hasRemote: true, localHash: 'acked', remoteHash: 'remote', ackedHash: 'acked' }),
      'pull'
    )
  })

  it('pauses when both sides moved', () => {
    assert.equal(
      decideSync({ hasRemote: true, localHash: 'local', remoteHash: 'remote', ackedHash: 'acked' }),
      'conflict'
    )
  })

  it('pauses when a page exists and this app has no cursor', () => {
    assert.equal(
      decideSync({ hasRemote: true, localHash: 'local', remoteHash: 'remote', ackedHash: null }),
      'conflict'
    )
  })

  it('relinks when both texts already match', () => {
    assert.equal(
      decideSync({ hasRemote: true, localHash: 'same', remoteHash: 'same', ackedHash: null }),
      'relink'
    )
  })

  it('archives a delete when Notion still has the synced text', () => {
    assert.equal(
      decideDelete({ hasRemote: true, remoteHash: 'acked', ackedHash: 'acked' }),
      'archive'
    )
  })

  it('pauses a delete when Notion changed after the last sync', () => {
    assert.equal(
      decideDelete({ hasRemote: true, remoteHash: 'remote', ackedHash: 'acked' }),
      'conflict'
    )
    assert.equal(decideDelete({ hasRemote: false, remoteHash: null, ackedHash: 'acked' }), 'drop')
  })
})

describe('notion errors', () => {
  it('names a missing share of the database', () => {
    assert.match(notionErrorMessage({ status: 404, code: 'object_not_found' }), /Conexiones/)
    assert.match(notionErrorMessage({ status: 401 }), /token/)
  })
})
