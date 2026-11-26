import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectCourseFacets,
  courseMatchesLibraryFilters,
  libraryFiltersActive,
  projectPlaylists
} from './courseFilters.js'
import { EMPTY_COLUMN_FILTERS, compareCourses, matchesColumnFilters } from './courseTable.js'

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
    assert.equal(courseMatchesLibraryFilters({ ...lighting, hide: true }, {}), false)
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
    const rated = {
      ...lighting,
      isInProcess: false,
      learning: { excitement: 4, isRecentlyViewed: false }
    }
    assert.equal(courseMatchesLibraryFilters(rated, { minExcitement: 4 }), true)
    assert.equal(courseMatchesLibraryFilters(rated, { minExcitement: 2 }), true)
    assert.equal(courseMatchesLibraryFilters(rated, { minExcitement: 5 }), false)
    assert.equal(
      courseMatchesLibraryFilters(
        { ...rated, learning: { isRecentlyViewed: false } },
        { minExcitement: 1 }
      ),
      false
    )
    assert.equal(
      courseMatchesLibraryFilters({ ...rated, isInProcess: true }, { minExcitement: 4 }),
      false
    )
    assert.equal(
      courseMatchesLibraryFilters(
        { ...rated, learning: { excitement: 4, isRecentlyViewed: true } },
        { minExcitement: 4 }
      ),
      false
    )
    assert.equal(
      courseMatchesLibraryFilters(
        { ...rated, isInProcess: true },
        { minExcitement: 4, isInProcessOnly: true }
      ),
      true
    )
  })

  it('treats an empty filter set as inactive', () => {
    assert.equal(libraryFiltersActive({}), false)
    assert.equal(libraryFiltersActive({ query: '   ', minRate: 0 }), false)
    assert.equal(libraryFiltersActive({ theme: 'Color' }), true)
    assert.equal(libraryFiltersActive({ minExcitement: 0 }), false)
    assert.equal(libraryFiltersActive({ minExcitement: 3 }), true)
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

  it('filters the list by en curso and nuevos', () => {
    const filters = { ...EMPTY_COLUMN_FILTERS }
    const inProcess = { ...lighting, isInProcess: true, isNew: false }
    const fresh = {
      ...lighting,
      title: 'Fresh',
      isInProcess: false,
      isNew: true,
      learning: { isRecentlyViewed: false }
    }
    assert.equal(matchesColumnFilters(inProcess, { ...filters, status: 'inProcess' }), true)
    assert.equal(matchesColumnFilters(fresh, { ...filters, status: 'inProcess' }), false)
    assert.equal(matchesColumnFilters(fresh, { ...filters, status: 'new' }), true)
    assert.equal(matchesColumnFilters(inProcess, { ...filters, status: 'new' }), false)
    assert.equal(matchesColumnFilters(fresh, filters), true)
  })

  it('sorts courses by personal excitement before title', () => {
    const calm = { ...lighting, title: 'A', learning: { excitement: 1 } }
    const hot = { ...lighting, title: 'B', learning: { excitement: 5 } }
    assert.equal(compareCourses(calm, hot, 'excitement', 'desc') > 0, true)
    assert.equal(compareCourses(hot, { ...hot, title: 'C' }, 'excitement', 'desc') < 0, true)
  })
})

describe('gap filter', () => {
  it('keeps only courses missing a cover or a description', () => {
    const bare = { path: 'bare', title: 'Bare', hasCover: false }
    const full = { path: 'full', title: 'Full', hasCover: true, description: { summary: 'Hola' } }
    assert.equal(courseMatchesLibraryFilters(bare, { gap: 'cover' }), true)
    assert.equal(courseMatchesLibraryFilters(full, { gap: 'cover' }), false)
    assert.equal(courseMatchesLibraryFilters(bare, { gap: 'description' }), true)
    assert.equal(courseMatchesLibraryFilters(full, { gap: 'description' }), false)
    assert.equal(libraryFiltersActive({ gap: 'cover' }), true)
  })
})
