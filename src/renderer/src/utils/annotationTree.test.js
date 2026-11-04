import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
      ['Sin curso', 'Colorful Illustrations']
    )
    assert.equal(tree[0].children, undefined)
    assert.deepEqual(
      tree[0].items.map((item) => item.id),
      ['a']
    )
    assert.deepEqual(
      tree[1].children.map((node) => node.title),
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
