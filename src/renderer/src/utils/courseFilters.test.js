import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectCourseFacets,
  courseMatchesLibraryFilters,
  libraryFiltersActive,
  projectPlaylists
} from './courseFilters.js'

const lighting = {
  path: 'lighting',
  title: 'Lighting',
  institution: 'Schoolism',
  instructor: 'Ada',
  programs: ['Concept'],
  theme: ['Color'],
  notesSearchText: 'rim light',
  isInProcess: true,
  isNew: false,
  missingProps: false,
  rate: 4,
  learning: { isRecentlyViewed: true }
}

describe('library course filters', () => {
  it('matches the library search fields', () => {
    assert.equal(courseMatchesLibraryFilters(lighting, { query: 'rim' }), true)
    assert.equal(courseMatchesLibraryFilters(lighting, { query: 'ada' }), true)
    assert.equal(courseMatchesLibraryFilters(lighting, { query: 'missing' }), false)
  })

  it('applies status, facet, and rating checks together', () => {
    assert.equal(
      courseMatchesLibraryFilters(lighting, {
        isInProcessOnly: true,
        program: 'Concept',
        theme: 'Color',
        institution: 'Schoolism',
        minRate: 4,
        recentlyViewedOnly: true
      }),
      true
    )
    assert.equal(courseMatchesLibraryFilters(lighting, { isNewOnly: true }), false)
    assert.equal(courseMatchesLibraryFilters(lighting, { missingPropsOnly: true }), false)
    assert.equal(courseMatchesLibraryFilters(lighting, { minRate: 5 }), false)
  })

  it('treats an empty filter set as inactive', () => {
    assert.equal(libraryFiltersActive({}), false)
    assert.equal(libraryFiltersActive({ query: '   ', minRate: 0 }), false)
    assert.equal(libraryFiltersActive({ theme: 'Color' }), true)
  })

  it('ranks programs and themes by how often they appear', () => {
    const facets = collectCourseFacets([
      lighting,
      { ...lighting, path: 'b', programs: ['Concept', 'Story'], theme: ['Story'] },
      { institution: 'Gnomon', programs: ['Story'], theme: [] }
    ])
    assert.deepEqual(facets.institutions, ['Gnomon', 'Schoolism'])
    assert.deepEqual(facets.programs, ['Concept', 'Story'])
    assert.deepEqual(facets.themes, ['Color', 'Story'])
  })

  it('hides non-matching courses without rewriting the stored list', () => {
    const stored = [
      {
        id: 'pl',
        coursePaths: ['lighting', 'other', 'gone']
      }
    ]
    const byPath = new Map([
      ['lighting', lighting],
      ['other', { ...lighting, path: 'other', title: 'Other', isInProcess: false }]
    ])
    assert.equal(projectPlaylists(stored, byPath, {}), stored)
    const shown = projectPlaylists(stored, byPath, { isInProcessOnly: true })
    assert.deepEqual(shown[0].coursePaths, ['lighting'])
    assert.deepEqual(stored[0].coursePaths, ['lighting', 'other', 'gone'])
  })
})
