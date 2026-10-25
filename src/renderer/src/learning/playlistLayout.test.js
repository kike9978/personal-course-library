import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PLAYLIST_COVER_H,
  buildFlow,
  contentHeight,
  courseNodeY,
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
})
