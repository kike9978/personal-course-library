import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isCourseHidden,
  playlistForDisplay,
  restoreHiddenCourseWhys,
  retainHiddenCoursePaths,
  visibleFinding
} from './courseHide.js'

describe('course hide', () => {
  it('hides only an explicit true flag', () => {
    assert.equal(isCourseHidden({ hide: true }), true)
    assert.equal(isCourseHidden({ hide: false }), false)
    assert.equal(isCourseHidden({}), false)
    assert.equal(isCourseHidden({ hide: 'true' }), false)
  })

  it('keeps a hidden course on the saved playlist when the editor omits it', () => {
    const hidden = new Set(['School - Old'])
    const paths = retainHiddenCoursePaths(
      ['School - New'],
      ['School - Old', 'School - New'],
      hidden
    )
    assert.deepEqual(paths, ['School - New', 'School - Old'])
    const whys = restoreHiddenCourseWhys(
      { 'School - New': 'Ahora' },
      { 'School - Old': 'Luego' },
      hidden
    )
    assert.deepEqual(whys, { 'School - New': 'Ahora', 'School - Old': 'Luego' })
  })

  it('omits hidden courses from the playlist shown in the app', () => {
    const shown = playlistForDisplay(
      {
        id: 'list',
        coursePaths: ['School - New', 'School - Old'],
        courseWhys: { 'School - New': 'Ahora', 'School - Old': 'Luego' }
      },
      new Set(['School - Old'])
    )
    assert.deepEqual(shown.coursePaths, ['School - New'])
    assert.deepEqual(shown.courseWhys, { 'School - New': 'Ahora' })
  })

  it('drops notes that only belong to a hidden course', () => {
    const hidden = new Set(['School - Old'])
    assert.equal(
      visibleFinding({ id: 'a', anchors: [{ coursePath: 'School - Old' }] }, hidden),
      null
    )
    const mixed = visibleFinding(
      {
        id: 'b',
        anchors: [{ coursePath: 'School - Old' }, { coursePath: 'School - New' }]
      },
      hidden
    )
    assert.deepEqual(mixed.anchors, [{ coursePath: 'School - New' }])
    const loose = visibleFinding({ id: 'c', anchors: [] }, hidden)
    assert.equal(loose.id, 'c')
  })
})
