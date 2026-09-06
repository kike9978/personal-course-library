import { useState, useEffect, useCallback, useRef } from 'react'
import CoursesGrid from './components/CoursesGrid'
import ErrorBoundary from './components/ErrorBoundary'
import Loader from './components/Loader'
import { Toaster, toast } from 'react-hot-toast'

function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function LibrarySetup({ onPathSet }) {
  const [isPicking, setIsPicking] = useState(false)

  const handlePick = async () => {
    setIsPicking(true)
    try {
      const result = await window.api.pickLibraryFolder()
      if (!result.canceled && result.valid) {
        toast.success('Library folder selected')
        onPathSet(result.path)
      }
    } catch (error) {
      toast.error(error.message || 'Could not set library folder')
    } finally {
      setIsPicking(false)
    }
  }

  return (
    <div className="library-setup">
      <h1>Personal Course Library</h1>
      <p>Select the folder that contains your courses to get started.</p>
      <button type="button" onClick={handlePick} disabled={isPicking}>
        {isPicking ? 'Opening…' : 'Choose library folder'}
      </button>
    </div>
  )
}

function SearchBar({
  filterText,
  onFilterTextChange,
  onCardLayoutChange,
  isCardLayout,
  isInProcessOnly,
  onInProcessOnlyChange,
  courseCount,
  isLoading,
  onRefresh,
  libraryPath,
  onChangeLibrary
}) {
  return (
    <div className="navbar bg-white shadow-lg p-4">
      <div className="navbar-header flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Catálogo de cursos</h1>
        <div className="navbar-actions">
          <button
            type="button"
            className="nav-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh courses (Ctrl+R)"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={onChangeLibrary}
            title={libraryPath || ''}
          >
            Change folder
          </button>
        </div>
      </div>
      {libraryPath && (
        <p className="library-path" title={libraryPath}>
          {libraryPath}
        </p>
      )}
      <div className="navbar-filters mt-4">
        <form className="flex items-center" onSubmit={(e) => e.preventDefault()}>
          <input
            type="text"
            value={filterText}
            placeholder="Buscar..."
            onChange={(e) => onFilterTextChange(e.target.value)}
            className="px-4 py-2 rounded border border-gray-300 text-gray-800 focus:outline-none focus:ring focus:border-blue-500"
          />
        </form>
        <p className="text-gray-600">Cursos: {courseCount}</p>
        <label className="flex items-center text-gray-600">
          <input
            type="checkbox"
            checked={isCardLayout}
            onChange={(e) => onCardLayoutChange(e.target.checked)}
            className="mr-2"
          />
          Mostrar vista de cards
        </label>
        <label className="flex items-center text-gray-600">
          <input
            type="checkbox"
            checked={isInProcessOnly}
            onChange={(e) => onInProcessOnlyChange(e.target.checked)}
            className="mr-2"
          />
          Filtrar cursos en progreso
        </label>
      </div>
    </div>
  )
}

function FilterableCoursesGrid({ courses, isLoading, onRefresh, libraryPath, onChangeLibrary }) {
  const [filterText, setFilterText] = useState('')
  const [isCardLayout, setIsCardLayout] = useState(true)
  const [isInProcessOnly, setIsInProcessOnly] = useState(false)
  const debouncedFilter = useDebouncedValue(filterText, 200)

  const filteredCourses = courses.filter((course) => {
    if (course.error) return false
    const searchLower = debouncedFilter.toLowerCase()
    const title = (course.title || '').toLowerCase()
    const institution = (course.institution || '').toLowerCase()
    const matchesText =
      !searchLower || title.includes(searchLower) || institution.includes(searchLower)
    const processCheck = !isInProcessOnly || course.isInProcess
    return matchesText && processCheck
  })

  const sortedCourses = [...filteredCourses].sort((a, b) =>
    (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
  )

  return (
    <div>
      <SearchBar
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onCardLayoutChange={setIsCardLayout}
        onInProcessOnlyChange={setIsInProcessOnly}
        isCardLayout={isCardLayout}
        isInProcessOnly={isInProcessOnly}
        courseCount={sortedCourses.length}
        onRefresh={onRefresh}
        isLoading={isLoading}
        libraryPath={libraryPath}
        onChangeLibrary={onChangeLibrary}
      />
      {isLoading && courses.length === 0 ? (
        <div className="loader-container">
          <Loader />
        </div>
      ) : (
        <CoursesGrid courses={sortedCourses} isCardLayout={isCardLayout} />
      )}
    </div>
  )
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [libraryPath, setLibraryPath] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const loadingRef = useRef(false)

  const loadCourses = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    try {
      const lib = await window.api.getLibraryPath()
      if (!lib.valid) {
        setNeedsSetup(true)
        setLibraryPath(null)
        setCourses([])
        return
      }
      setNeedsSetup(false)
      setLibraryPath(lib.path)
      const list = await window.api.listCourses()
      setCourses(list)
    } catch (error) {
      console.error('Error loading courses:', error)
      toast.error(error.message || 'Failed to load courses')
      setCourses([])
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  const refreshCourses = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    try {
      const list = await window.api.refreshCourses()
      setCourses(list)
      toast.success('Courses refreshed')
    } catch (error) {
      console.error('Error refreshing courses:', error)
      toast.error(error.message || 'Failed to refresh')
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  const handleChangeLibrary = useCallback(async () => {
    try {
      const result = await window.api.pickLibraryFolder()
      if (!result.canceled && result.valid) {
        setLibraryPath(result.path)
        setNeedsSetup(false)
        await loadCourses()
        toast.success('Library folder updated')
      }
    } catch (error) {
      toast.error(error.message || 'Could not change library folder')
    }
  }, [loadCourses])

  useEffect(() => {
    loadCourses()

    const unsubscribeUpdated = window.api.onCourseUpdated((update) => {
      setCourses((prev) =>
        prev.map((course) =>
          course.path === update.coursePath ? { ...course, ...update.fullData } : course
        )
      )
    })

    const unsubscribeLibrary = window.api.onLibraryChanged(() => {
      loadCourses()
    })

    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        refreshCourses()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubscribeUpdated()
      unsubscribeLibrary()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [loadCourses, refreshCourses])

  return (
    <ErrorBoundary>
      <div className="container">
        <Toaster position="top-right" />
        {needsSetup ? (
          <LibrarySetup
            onPathSet={(path) => {
              setLibraryPath(path)
              setNeedsSetup(false)
              loadCourses()
            }}
          />
        ) : (
          <FilterableCoursesGrid
            courses={courses}
            isLoading={isLoading}
            onRefresh={refreshCourses}
            libraryPath={libraryPath}
            onChangeLibrary={handleChangeLibrary}
          />
        )}
      </div>
    </ErrorBoundary>
  )
}

export default App
