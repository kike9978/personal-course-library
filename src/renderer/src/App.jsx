import CoursesGrid from './components/CoursesGrid'
import { useState, useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary'



// function getNativeImageData(pathToImage) {
//   return ipcRenderer.invoke("getNativeImage", pathToImage);
// }

function FilterableCoursesGrid({ courses = [] }) {
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
      />
      <CoursesGrid
        courses={courses}
        filterText={filterText}
        isCardLayout={isCardLayout}
        isInProcessOnly={isInProcessOnly}
        onSortedCourses={setCourseCount}
      />
    </div>
  )
}

// Add prop validation
FilterableCoursesGrid.defaultProps = {
  courses: []
}

function SearchBar({
  filterText,
  onFilterTextChange,
  onCardLayoutChange,
  isCardLayout,
  isInProcessOnly,
  onInProcessOnlyChange,
  courseCount
}) {
  return (
    <div className="navbar">
      <h1>Catálogo de cursos</h1>
      <div className="navbar-filters">
        <form>
          <input
            type="text"
            value={filterText}
            placeholder="Buscar..."
            onChange={(e) => onFilterTextChange(e.target.value)}
          />
        </form>
        <p>Cursos: {courseCount}</p>
        <label>
          <input
            type="checkbox"
            checked={isCardLayout}
            onChange={(e) => onCardLayoutChange(e.target.checked)}
          />{' '}
          Mostrar vista de cards
        </label>
        <label>
          <input
            type="checkbox"
            checked={isInProcessOnly}
            onChange={(e) => onInProcessOnlyChange(e.target.checked)}
          />{' '}
          Filtrar cursos en progreso
        </label>
      </div>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <div className="container">
        <FilterableCoursesGrid courses={window.courseList || []} />
      </div>
    </ErrorBoundary>
  )
}

export default App
