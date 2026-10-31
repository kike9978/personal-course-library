import { useEffect, useState } from 'react'
import { isCourseHidden } from '../../../shared/courseHide.js'

export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** Same course match the library header uses. Column filters stay with the table. */
export function courseMatchesLibraryFilters(course, filters = {}) {
  if (isCourseHidden(course)) return false
  const searchLower = String(filters.query || '')
    .trim()
    .toLowerCase()
  const title = (course?.title || '').toLowerCase()
  const institution = (course?.institution || '').toLowerCase()
  const instructor = (course?.instructor || '').toLowerCase()
  const programsText = (course?.programs || []).join(' ').toLowerCase()
  const themesText = (course?.theme || []).join(' ').toLowerCase()
  const notesText = (course?.notesSearchText || '').toLowerCase()
  const matchesText =
    !searchLower ||
    title.includes(searchLower) ||
    institution.includes(searchLower) ||
    instructor.includes(searchLower) ||
    programsText.includes(searchLower) ||
    themesText.includes(searchLower) ||
    notesText.includes(searchLower) ||
    (course?.path || '').toLowerCase().includes(searchLower)
  if (!matchesText) return false
  if (filters.isInProcessOnly && !course?.isInProcess) return false
  if (filters.isNewOnly && !course?.isNew) return false
  if (filters.recentlyViewedOnly && !course?.learning?.isRecentlyViewed) return false
  if (filters.missingPropsOnly && !course?.missingProps) return false
  if (filters.institution && course?.institution !== filters.institution) return false
  if (filters.program && !(course?.programs || []).includes(filters.program)) return false
  if (filters.theme && !(course?.theme || []).includes(filters.theme)) return false
  if (filters.minRate && (Number(course?.rate) || 0) < Number(filters.minRate)) return false
  return true
}

export function libraryFiltersActive(filters = {}) {
  return Boolean(
    String(filters.query || '').trim() ||
    filters.isInProcessOnly ||
    filters.isNewOnly ||
    filters.recentlyViewedOnly ||
    filters.missingPropsOnly ||
    filters.institution ||
    filters.program ||
    filters.theme ||
    Number(filters.minRate) > 0
  )
}

export function collectCourseFacets(courses) {
  const institutions = new Set()
  const programs = new Map()
  const themes = new Map()
  for (const course of courses || []) {
    if (course?.institution) institutions.add(course.institution)
    for (const program of course?.programs || []) {
      if (program) programs.set(program, (programs.get(program) || 0) + 1)
    }
    for (const theme of course?.theme || []) {
      if (theme) themes.set(theme, (themes.get(theme) || 0) + 1)
    }
  }
  const byCount = (map) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name)
  return {
    institutions: [...institutions].sort((a, b) => a.localeCompare(b)),
    programs: byCount(programs),
    themes: byCount(themes)
  }
}

/** Display copy of listas with only the courses that match. Stored lists stay intact. */
export function projectPlaylists(playlists, courseByPath, filters) {
  if (!libraryFiltersActive(filters)) return playlists
  return (Array.isArray(playlists) ? playlists : []).map((playlist) => ({
    ...playlist,
    coursePaths: (playlist.coursePaths || []).filter((path) => {
      const course = courseByPath?.get(path)
      return Boolean(course) && courseMatchesLibraryFilters(course, filters)
    })
  }))
}
