import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupAnnotationsByWeek } from './annotationGroups.js'
import { buildAnnotationTree, openIdsForItem } from './annotationTree.js'

const titles = {
  '/courses/color': 'Colorful Illustrations',
  '/courses/concept': 'Concept Art'
}

describe('buildAnnotationTree', () => {
  it('nests files under courses and folds a duplicate loose heading', () => {
    const tree = buildAnnotationTree(
      [
        {
          key: '::loose',
          coursePath: null,
          title: 'Sin curso',
          items: [{ id: 'a' }]
        },
        {
          key: '/courses/color::file:lesson',
          coursePath: '/courses/color',
          title: 'week 01',
          items: [{ id: 'b', coursePath: '/courses/color' }]
        },
        {
          key: '/courses/color::course',
          coursePath: '/courses/color',
          title: 'Del curso',
          items: [{ id: 'c', coursePath: '/courses/color' }]
        }
      ],
      { groupMode: 'target', courseColumn: true, titles }
    )

    assert.deepEqual(
      tree.map((node) => node.title),
      ['Colorful Illustrations', 'Sin curso']
    )
    assert.equal(tree[1].children, undefined)
    assert.deepEqual(
      tree[1].items.map((item) => item.id),
      ['a']
    )
    assert.deepEqual(
      tree[0].children.map((node) => node.title),
      ['week 01', 'Del curso']
    )
  })

  it('keeps a single file level inside one course', () => {
    const tree = buildAnnotationTree(
      [{ key: 'file:lesson', title: 'week 01', items: [{ id: 'b' }] }],
      { groupMode: 'target', courseColumn: false, titles }
    )
    assert.deepEqual(tree, [{ id: 'file:lesson', title: 'week 01', items: [{ id: 'b' }] }])
  })

  it('nests topic notes by course in the library list', () => {
    const tree = buildAnnotationTree(
      [
        {
          key: 'topic:light',
          title: 'Luz',
          courseCount: 2,
          items: [
            { id: 'a', coursePath: '/courses/concept' },
            { id: 'b', coursePath: '/courses/color' }
          ]
        }
      ],
      { groupMode: 'topic', courseColumn: true, titles }
    )
    assert.equal(tree[0].title, 'Luz')
    assert.deepEqual(
      tree[0].children.map((node) => node.title),
      ['Colorful Illustrations', 'Concept Art']
    )
  })

  it('nests a week by course in the library list', () => {
    const tree = buildAnnotationTree(
      [
        {
          key: 'week:2026-11-16',
          title: 'Esta semana',
          items: [
            { id: 'a', coursePath: '/courses/color' },
            { id: 'b', coursePath: null }
          ]
        }
      ],
      { groupMode: 'week', courseColumn: true, titles }
    )
    assert.equal(tree[0].title, 'Esta semana')
    assert.deepEqual(
      tree[0].children.map((node) => node.title),
      ['Colorful Illustrations', 'Sin curso']
    )
  })

  it('keeps week notes in one list inside a course', () => {
    const tree = buildAnnotationTree(
      [{ key: 'week:2026-11-16', title: 'Esta semana', items: [{ id: 'a' }, { id: 'b' }] }],
      { groupMode: 'week', courseColumn: false, titles }
    )
    assert.deepEqual(tree, [
      { id: 'week:2026-11-16', title: 'Esta semana', items: [{ id: 'a' }, { id: 'b' }] }
    ])
  })
})

describe('groupAnnotationsByWeek', () => {
  const now = new Date(2026, 10, 18, 12).getTime()

  it('buckets notes by Monday week, newest first', () => {
    const groups = groupAnnotationsByWeek(
      [
        { id: 'old', createdAt: new Date(2026, 10, 2, 9).getTime() },
        { id: 'sun', createdAt: new Date(2026, 10, 15, 23).getTime() },
        { id: 'today', createdAt: new Date(2026, 10, 18, 8).getTime() },
        { id: 'mon', createdAt: new Date(2026, 10, 16, 1).getTime() },
        { id: 'none', createdAt: null }
      ],
      { now }
    )
    assert.deepEqual(
      groups.map((group) => group.title),
      ['Esta semana', 'Semana pasada', '2–8 nov 2026', 'Sin fecha']
    )
    assert.deepEqual(
      groups.map((group) => group.items.map((item) => item.id)),
      [['today', 'mon'], ['sun'], ['old'], ['none']]
    )
    assert.equal(groups[0].key, 'week:2026-11-16')
  })

  it('labels a week that crosses a month', () => {
    const groups = groupAnnotationsByWeek(
      [{ id: 'cross', createdAt: new Date(2026, 9, 28, 10).getTime() }],
      { now }
    )
    assert.equal(groups[0].title, '26 oct – 1 nov 2026')
  })
})

describe('openIdsForItem', () => {
  it('returns every ancestor of the matching note', () => {
    const tree = [
      {
        id: 'course',
        children: [{ id: 'file', items: [{ id: 'note' }] }]
      }
    ]
    assert.deepEqual(
      openIdsForItem(tree, (item) => item.id === 'note'),
      ['course', 'file']
    )
  })
})
