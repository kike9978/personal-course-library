import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  anchorFromNotion,
  blocksToBody,
  bodyToBlocks,
  decideDelete,
  decideSync,
  filePageMarker,
  findingIdFromBlocks,
  mergeCourseProgress,
  playlistFromBody,
  playlistIdFromBlocks,
  playlistWire,
  progressFromBody,
  progressIdFromBlocks,
  progressIsEmpty,
  progressTrackKey,
  progressWire,
  markerBlocks,
  noteAssetNames,
  normalizeDatabaseId,
  isRetryableNotionError,
  notionAssetsToUpload,
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

  it('keeps a playlist id on its page without looking like a note', () => {
    const wire = playlistWire({
      title: 'Repaso',
      why: 'Cierre',
      coursePaths: ['pack'],
      childIds: ['child-1'],
      courseWhys: { pack: 'porque' }
    })
    const blocks = bodyToBlocks(wire.body, 'list-1', 'playlist')
    assert.equal(findingIdFromBlocks(blocks), '')
    assert.equal(playlistIdFromBlocks(blocks), 'list-1')
    assert.deepEqual(playlistFromBody(blocksToBody(blocks)), {
      why: 'Cierre',
      coursePaths: ['pack'],
      childIds: ['child-1'],
      courseWhys: { pack: 'porque' }
    })
    assert.equal(playlistWire({ title: 'Repaso', why: 'Cierre', coursePaths: ['pack'], childIds: ['child-1'], courseWhys: { pack: 'porque' } }).body, wire.body)
  })

  it('round-trips markdown through one code block', () => {
    const body = 'Nota\n\n@[time:12.5](0:12)\n\n[[lesson|Uno|abc]]'
    const blocks = bodyToBlocks(body)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].type, 'code')
    assert.equal(blocksToBody(blocks), 'Nota\n\n@[time:12.5](0:12)\n\n[[lesson|Uno|abc]]')
  })

  it('lists image and drawing files without putting them in the note text', () => {
    const body = [
      'Hola',
      '![Captura](course-media://note/?file=mw2pazt9-4b174209be23.jpg)',
      '![excalidraw:draw-1](course-media://note/?file=draw-1.png)'
    ].join('\n\n')
    assert.deepEqual(noteAssetNames(body), [
      'mw2pazt9-4b174209be23.jpg',
      'draw-1.png',
      'draw-1.excalidraw'
    ])
    const blocks = [
      ...bodyToBlocks(body, 'note-1'),
      {
        type: 'image',
        image: {
          caption: [{ plain_text: 'file:mw2pazt9-4b174209be23.jpg' }],
          file: { url: 'https://files.example/shot.jpg' }
        }
      }
    ]
    assert.equal(blocksToBody(blocks), body)
    assert.equal(findingIdFromBlocks(blocks), 'note-1')
  })

  it('keeps the finding id out of the note text', () => {
    const blocks = bodyToBlocks('Hola\n\nmundo', 'note-1')
    assert.equal(blocksToBody(blocks), 'Hola\n\nmundo')
    assert.equal(findingIdFromBlocks(blocks), 'note-1')
    assert.equal(blocksToBody(bodyToBlocks('', 'note-1')), '')
    assert.equal(blocksToBody(markerBlocks('node:file:course:pack::a.mp4@lesson')), '')
  })

  it('rebuilds an anchor from the shared course and file markers', () => {
    const lesson = anchorFromNotion({
      courseMarker: 'node:course:pack',
      fileMarker: 'node:file:course:pack::01 Orientation.mp4@lesson',
      fileTitle: 'Orientation'
    })
    assert.equal(lesson.coursePath, 'pack')
    assert.equal(lesson.lessonRelativePath, '01 Orientation.mp4')
    assert.equal(lesson.lessonTitle, 'Orientation')

    const project = anchorFromNotion({
      courseMarker: 'node:course:pack',
      fileMarker: 'node:file:course:pack::proj-1@project',
      fileTitle: 'Reel'
    })
    assert.equal(project.projectId, 'proj-1')
    assert.equal(project.projectTitle, 'Reel')
    assert.equal(project.lessonRelativePath, null)

    const journal = anchorFromNotion({
      courseMarker: 'node:course:pack',
      fileMarker: 'node:file:course:pack::__course__@course',
      fileTitle: 'Del curso'
    })
    assert.equal(journal.coursePath, 'pack')
    assert.equal(journal.lessonRelativePath, null)
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
    assert.equal(placed.fileKind, 'lesson')
    assert.equal(filePageMarker(placed), `node:${placed.fileKey}@lesson`)

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

describe('course progress wire', () => {
  it('stamps a progress page and round-trips the payload', () => {
    const wire = progressWire({
      inProcess: true,
      lessons: {
        'b.mp4': { completed: false, positionSec: 12.4, durationSec: 40, lastOpenedAt: 5 },
        'a.mp4': { completed: true, positionSec: 3, durationSec: 10, lastOpenedAt: 2 }
      },
      lastLessonRelativePath: 'b.mp4',
      lastLessonTitle: 'B',
      lastPositionSec: 12.4,
      lastOpenedAt: 5
    })
    const blocks = bodyToBlocks(wire.body, 'Pack', 'progress')
    assert.equal(progressIdFromBlocks(blocks), 'Pack')
    assert.equal(progressFromBody(blocksToBody(blocks)).inProcess, true)
    assert.equal(progressFromBody(wire.body).lessons['b.mp4'].positionSec, 12)
    assert.equal(progressIsEmpty(wire), false)
    assert.equal(progressIsEmpty(progressWire({ inProcess: false, lessons: {} })), true)
  })

  it('unions completed lessons and keeps the later last-watched lesson', () => {
    const merged = mergeCourseProgress(
      {
        inProcess: false,
        lessons: { 'a.mp4': { completed: true, positionSec: 10, durationSec: 10, lastOpenedAt: 1 } },
        lastLessonRelativePath: 'a.mp4',
        lastLessonTitle: 'A',
        lastPositionSec: 10,
        lastOpenedAt: 1
      },
      {
        inProcess: true,
        lessons: { 'b.mp4': { completed: true, positionSec: 8, durationSec: 8, lastOpenedAt: 4 } },
        lastLessonRelativePath: 'b.mp4',
        lastLessonTitle: 'B',
        lastPositionSec: 8,
        lastOpenedAt: 4
      }
    )
    assert.equal(merged.inProcess, false)
    assert.equal(merged.lessons['a.mp4'].completed, true)
    assert.equal(merged.lessons['b.mp4'].completed, true)
    assert.equal(merged.lastLessonRelativePath, 'b.mp4')
    assert.notEqual(
      progressTrackKey({ ...merged, inProcess: false }),
      progressTrackKey({ ...merged, inProcess: true })
    )
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

  it('explains a file Notion will not accept', () => {
    assert.match(
      notionErrorMessage({
        status: 400,
        message: "Provided `filename` has an extension that is not supported for the File Upload API."
      }),
      /dibujo/
    )
  })

  it('uploads a drawing as JSON, as its image, or not at all', () => {
    const names = ['shot.jpg', 'draw-1.png', 'draw-1.excalidraw']
    assert.deepEqual(
      notionAssetsToUpload(names, '').map((item) => item.name),
      ['shot.jpg', 'draw-1.png']
    )
    assert.deepEqual(notionAssetsToUpload(names, 'json'), [
      { name: 'shot.jpg', filename: 'shot.jpg', contentType: '' },
      { name: 'draw-1.png', filename: 'draw-1.png', contentType: '' },
      { name: 'draw-1.excalidraw', filename: 'draw-1.json', contentType: 'application/json' }
    ])
    assert.deepEqual(
      notionAssetsToUpload(names, 'local').map((item) => item.name),
      ['shot.jpg']
    )
  })

  it('explains a save that collided and leaves it retryable', () => {
    assert.match(
      notionErrorMessage({
        status: 409,
        code: 'conflict_error',
        message: 'Conflict occurred while saving. Please try again.'
      }),
      /al mismo tiempo/
    )
    assert.equal(isRetryableNotionError({ status: 409, code: 'conflict_error' }), true)
  })
})
