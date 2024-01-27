import CoursesGrid from './components/CoursesGrid'
import { useState } from 'react'

function FilterableCoursesGrid({ courses }) {
  const [filterText, setFilterText] = useState('')
  const [isCardLayout, setIsCardLayout] = useState(true)
  const [isInProcessOnly, setisInProcessOnly] = useState(false)
  const [courseCount, setCourseCount] = useState(courses.length)
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
    <div className="container">
      <FilterableCoursesGrid courses={window.courseList} />
    </div>
  )
}

export default App
