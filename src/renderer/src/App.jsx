import CoursesGrid from './components/CoursesGrid'
import { useState, useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import DebugModal from './components/DebugModal'
import Loader from './components/Loader'
import { Toaster } from 'react-hot-toast'

// function getNativeImageData(pathToImage) {
//   return ipcRenderer.invoke("getNativeImage", pathToImage);
// }

function FilterableCoursesGrid({ courses = [], isLoading, onRefresh }) {
  const [filterText, setFilterText] = useState('')
  const [isCardLayout, setIsCardLayout] = useState(true)
  const [isInProcessOnly, setisInProcessOnly] = useState(false)
  const [courseCount, setCourseCount] = useState(courses.length || 0)

  // Add useEffect to handle course list changes
  useEffect(() => {
    setCourseCount(courses.length || 0)
  }, [courses])

  return (
    <div>
      <SearchBar
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onCardLayoutChange={setIsCardLayout}
        onInProcessOnlyChange={setisInProcessOnly}
        isCardLayout={isCardLayout}
        isInProcessOnly={isInProcessOnly}
        courseCount={courseCount}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />
      {isLoading ? (
        <div className="loader-container">
          <Loader />
        </div>
      ) : (
        <CoursesGrid
          courses={courses}
          filterText={filterText}
          isCardLayout={isCardLayout}
          isInProcessOnly={isInProcessOnly}
          onSortedCourses={setCourseCount}
        />
      )}
    </div>
  )
}

// Add prop validation
FilterableCoursesGrid.defaultProps = {
  courses: [],
  isLoading: false,
  onRefresh: () => {}
}

function SearchBar({
  filterText,
  onFilterTextChange,
  onCardLayoutChange,
  isCardLayout,
  isInProcessOnly,
  onInProcessOnlyChange,
  courseCount,

  isLoading
}) {
  return (
    <div className="navbar bg-white shadow-lg p-4">
      <div className="navbar-header flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Catálogo de cursos</h1>
      </div>
      <div className="navbar-filters mt-4">
        <form className="flex items-center">
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

function App() {
  const [showDebug, setShowDebug] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [courses, setCourses] = useState([])

  const refreshCourses = async () => {
    setIsLoading(true)
    try {
      // Use the IPC to refresh course list
      const result = await window.ipcRenderer.invoke('refreshCourseList')

      // Update the global coursesCoverImages
      window.coursesCoverImages = result.coursesCoverImages

      // Update courses state
      setCourses(result.courses)

      console.log('Courses refreshed successfully')
    } catch (error) {
      console.error('Error refreshing courses:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Initial load
    const loadData = async () => {
      try {
        // Get courses from window.courseList
        const courseList = window.courseList || []

        // Artificial delay to ensure UI components are ready
        setTimeout(() => {
          setCourses(courseList)
          setIsLoading(false)
        }, 1000)
      } catch (error) {
        console.error('Error loading courses:', error)
        setIsLoading(false)
      }
    }

    loadData()

    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setShowDebug((prev) => !prev)
        console.log('Debug mode toggled')
      } else if (e.ctrlKey && e.key === 'r') {
        // Add keyboard shortcut for refresh
        refreshCourses()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ErrorBoundary>
      <div className="container">
        <Toaster position="top-right" />
        <FilterableCoursesGrid courses={courses} isLoading={isLoading} onRefresh={refreshCourses} />
        <button
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            zIndex: 1000,
            padding: '8px 16px',
            background: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
          onClick={() => {
            setShowDebug(true)
            console.log('Debug button clicked')
          }}
        >
          Debug
        </button>
        {showDebug && <DebugModal onClose={() => setShowDebug(false)} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
