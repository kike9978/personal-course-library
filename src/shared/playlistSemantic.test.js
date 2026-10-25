import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clusterCourses, semanticNeighborhood } from './playlistSemantic.js'

const courses = [
  {
    path: 'School - Storyboard Action',
    title: 'Storyboard Action',
    institution: 'School',
    theme: ['Storyboard'],
    description: { summary: 'Plan an action scene with boards, shots, and acting.' }
  },
  {
    path: 'School - Drawing People for Boards',
    title: 'Drawing People for Boards',
    institution: 'School',
    theme: ['Storyboard'],
    description: { summary: 'Draw people so a storyboard scene can move.' }
  },
  {
    path: 'Studio - Product Lighting',
    title: 'Product Lighting',
    institution: 'Studio',
    programs: ['Blender'],
    description: { summary: 'Light a plastic product on a table in Blender.' }
  }
]

describe('semantic neighborhood', () => {
  it('ranks storyboard courses ahead of lighting for a storyboard query', () => {
    const result = semanticNeighborhood(courses, { query: 'storyboard de una escena de acción' })
    assert.ok(result.courses.length >= 2)
    assert.equal(result.courses[0].path, 'School - Storyboard Action')
    assert.ok(result.courses.every((course) => course.path !== 'Studio - Product Lighting'))
    assert.match(result.title, /Storyboard/i)
  })

  it('keeps the seed course first and skips excluded folders', () => {
    const result = semanticNeighborhood(courses, {
      seedPath: 'School - Drawing People for Boards',
      exclude: ['Studio - Product Lighting']
    })
    assert.equal(result.courses[0].path, 'School - Drawing People for Boards')
    assert.ok(result.courses.some((course) => course.path === 'School - Storyboard Action'))
    assert.ok(result.courses.every((course) => course.path !== 'Studio - Product Lighting'))
  })

  it('splits two subjects into nested steps', () => {
    const mixed = [
      ...courses,
      {
        path: 'Studio - Studio Lighting',
        title: 'Studio Lighting',
        programs: ['Blender'],
        description: { summary: 'Light a product on a table with Blender lamps.' }
      }
    ]
    const groups = clusterCourses(mixed)
    assert.ok(groups.length >= 2)
    const names = groups.map((group) => group.courses.map((course) => course.path).join('|'))
    assert.equal(names.some((row) => row.includes('Storyboard') && row.includes('Product Lighting')), false)
  })

  it('returns nothing when the query has no shared words', () => {
    const result = semanticNeighborhood(courses, { query: 'quilting' })
    assert.deepEqual(result.courses, [])
  })
})
