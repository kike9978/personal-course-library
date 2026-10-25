import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PLAYLIST_COVER_H,
  PLAYLIST_PLACE_GAP,
  boxesOverlap,
  buildFlow,
  contentHeight,
  courseNodeY,
  frameSlots,
  orderPlaylists,
  placeWithoutOverlap,
  playlistAtPoint,
  reorderCoursePaths,
  withFittedHeight
} from './playlistLayout.js'

describe('playlist layout', () => {
  it('grows the frame with each course', () => {
    assert.equal(contentHeight(0), 164)
    assert.ok(contentHeight(2) > contentHeight(1))
    const fitted = withFittedHeight({
      id: 'pl',
      title: 'Lista',
      position: { x: 10, y: 20 },
      size: { width: 100, height: 50 },
      coursePaths: ['a', 'b']
    })
    assert.equal(fitted.size.width, 280)
    assert.equal(fitted.size.height, contentHeight(2))
  })

  it('reorders from the dragged card offset', () => {
    const paths = ['a', 'b', 'c']
    assert.deepEqual(reorderCoursePaths(paths, 'c', courseNodeY(0)), ['c', 'a', 'b'])
    assert.deepEqual(reorderCoursePaths(paths, 'a', courseNodeY(2)), ['b', 'c', 'a'])
    assert.deepEqual(reorderCoursePaths(paths, 'a', courseNodeY(0) + 20), ['a', 'b', 'c'])
  })

  it('hits the topmost playlist under a point', () => {
    const back = {
      id: 'back',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 400 },
      coursePaths: []
    }
    const front = {
      id: 'front',
      position: { x: 40, y: 40 },
      size: { width: 300, height: 200 },
      coursePaths: []
    }
    assert.equal(playlistAtPoint([back, front], { x: 80, y: 80 })?.id, 'front')
    assert.equal(playlistAtPoint([back, front], { x: 10, y: 10 })?.id, 'back')
    assert.equal(playlistAtPoint([back, front], { x: 900, y: 10 }), null)
  })

  it('builds a parent frame and ordered course nodes', () => {
    const courses = new Map([
      ['lighting', { path: 'lighting', title: 'Lighting', institution: 'School', hasCover: true }]
    ])
    const { nodes, edges } = buildFlow(
      [
        {
          id: 'pl1',
          title: 'Ruta',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 400 },
          coursePaths: ['lighting', 'missing-one']
        }
      ],
      courses
    )
    assert.equal(nodes[0].id, 'pl1')
    assert.equal(nodes[0].type, 'playlist')
    assert.equal(nodes[1].parentId, 'pl1')
    assert.equal(nodes[1].data.title, 'Lighting')
    assert.equal(nodes[2].data.missing, true)
    assert.equal(nodes[2].position.y, courseNodeY(1))
    assert.equal(nodes[1].data.continues, true)
    assert.equal(nodes[2].data.continues, false)
    assert.equal(nodes[1].data.bigCover, false)
    assert.equal(edges.length, 0)

    const covers = buildFlow(
      [
        {
          id: 'pl1',
          title: 'Ruta',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 220 },
          coursePaths: ['lighting']
        }
      ],
      courses,
      { cardHeight: PLAYLIST_COVER_H }
    )
    assert.equal(covers.nodes[1].height, PLAYLIST_COVER_H)
    assert.equal(covers.nodes[1].data.bigCover, true)
    assert.ok(covers.nodes[0].height >= contentHeight(1, PLAYLIST_COVER_H))
  })

  it('keeps a new list off existing frames', () => {
    const existing = withFittedHeight({
      id: 'taken',
      position: { x: 100, y: 80 },
      size: { width: 320, height: 900 },
      coursePaths: ['a', 'b', 'c', 'd']
    })
    const open = placeWithoutOverlap([existing], { width: 320, height: 164 }, { x: 500, y: 80 })
    assert.deepEqual(open, { x: 500, y: 80 })

    const blocked = placeWithoutOverlap(
      [existing],
      { width: 320, height: 164 },
      { x: existing.position.x, y: existing.position.y }
    )
    const placed = { ...blocked, width: 320, height: 164 }
    const occupied = { ...existing.position, ...existing.size }
    assert.equal(boxesOverlap(placed, occupied, PLAYLIST_PLACE_GAP), false)
    assert.equal(blocked.x, existing.position.x + existing.size.width + PLAYLIST_PLACE_GAP)
    assert.equal(blocked.y, existing.position.y)

    const second = placeWithoutOverlap(
      [
        existing,
        withFittedHeight({
          id: 'beside',
          position: blocked,
          size: { width: 320, height: 164 },
          coursePaths: []
        })
      ],
      { width: 320, height: 164 },
      { x: existing.position.x, y: existing.position.y }
    )
    const beside = { ...blocked, width: 320, height: 164 }
    assert.equal(
      boxesOverlap({ ...second, width: 320, height: 164 }, occupied, PLAYLIST_PLACE_GAP),
      false
    )
    assert.equal(
      boxesOverlap({ ...second, width: 320, height: 164 }, beside, PLAYLIST_PLACE_GAP),
      false
    )
  })

  it('packs overlapping lists into separated rows', () => {
    const paths = (id, count) => Array.from({ length: count }, (_, index) => `${id}-${index}`)
    const lists = [
      {
        id: 'a',
        title: 'A',
        position: { x: 40, y: 40 },
        size: { width: 320, height: 900 },
        coursePaths: paths('a', 4)
      },
      {
        id: 'b',
        title: 'B',
        position: { x: 50, y: 60 },
        size: { width: 320, height: 900 },
        coursePaths: paths('b', 2)
      },
      {
        id: 'c',
        title: 'C',
        position: { x: 70, y: 90 },
        size: { width: 320, height: 900 },
        coursePaths: paths('c', 1)
      }
    ]
    const ordered = orderPlaylists(lists, { originX: 48, originY: 48, maxRowWidth: 700 })
    assert.deepEqual(
      ordered.map((playlist) => playlist.position),
      [
        { x: 48, y: 48 },
        { x: 48 + 320 + PLAYLIST_PLACE_GAP, y: 48 },
        { x: 48, y: 48 + contentHeight(4) + PLAYLIST_PLACE_GAP }
      ]
    )
    assert.equal(ordered[0].title, 'A')
    assert.deepEqual(ordered[2].coursePaths, paths('c', 1))

    const frames = ordered.map((playlist) => {
      const fitted = withFittedHeight(playlist)
      return { ...fitted.position, ...fitted.size }
    })
    assert.equal(boxesOverlap(frames[0], frames[1], PLAYLIST_PLACE_GAP), false)
    assert.equal(boxesOverlap(frames[0], frames[2], PLAYLIST_PLACE_GAP), false)
    assert.equal(boxesOverlap(frames[1], frames[2], PLAYLIST_PLACE_GAP), false)
  })

  it('draws a nested lista inside its parent and hides the child frame', () => {
    const courses = new Map([
      ['boards', { path: 'boards', title: 'Boards', institution: 'School' }]
    ])
    const { nodes } = buildFlow(
      [
        {
          id: 'path',
          title: 'Camino',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 200 },
          coursePaths: [],
          childIds: ['step']
        },
        {
          id: 'step',
          title: 'Figura',
          parentId: 'path',
          position: { x: 900, y: 900 },
          size: { width: 320, height: 200 },
          coursePaths: ['boards'],
          courseWhys: { boards: 'Primero la gente' }
        }
      ],
      courses
    )
    assert.equal(
      nodes.some((node) => node.id === 'step'),
      false
    )
    assert.equal(nodes[0].data.nests[0].title, 'Figura')
    assert.ok(nodes[0].data.nests[0].height > nodes[0].data.nests[0].y)
    const course = nodes.find((node) => node.type === 'course')
    assert.equal(course.parentId, 'path')
    assert.equal(course.data.playlistId, 'step')
    assert.equal(course.data.nested, true)
    assert.equal(course.position.x, 18)
    assert.ok(course.position.y > nodes[0].data.nests[0].y)
    assert.ok(
      course.position.y + course.height < nodes[0].data.nests[0].y + nodes[0].data.nests[0].height
    )
    assert.equal(course.data.why, 'Primero la gente')
    assert.ok(nodes[0].height > contentHeight(0))
    assert.equal(nodes[0].height, nodes[0].data.minHeight)
  })

  it('shrinks a parent to the nested lista instead of keeping the old height', () => {
    const child = {
      id: 'step',
      parentId: 'path',
      title: 'After Effects',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 900 },
      coursePaths: ['a', 'b', 'c', 'd']
    }
    const parent = {
      id: 'path',
      title: '2D',
      position: { x: 10, y: 20 },
      size: { width: 320, height: 900 },
      coursePaths: [],
      childIds: ['step']
    }
    const byId = new Map([
      [parent.id, parent],
      [child.id, child]
    ])
    const fitted = withFittedHeight(parent, undefined, byId)
    assert.equal(fitted.size.height, frameSlots(parent, byId).height)
    assert.ok(fitted.size.height < 700)
  })
})
