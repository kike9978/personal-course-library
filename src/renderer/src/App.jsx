import CoursesGrid from "./components/CoursesGrid"
import { useState } from 'react'

function FilterableCoursesGrid({ courses }) {
  const [filterText, setFilterText] = useState('')

  return (
    <div>
      <SearchBar filterText={filterText} onFilterTextChange={setFilterText} />
      <CoursesGrid courses={courses} filterText={filterText} />
    </div>
  )
}

function SearchBar({ filterText, onFilterTextChange,
}) {
  return (
    <div className="navbar">
      <h1>Catálogo de cursos</h1>
      <form>
        <input
          type="text"
          value={filterText}
          placeholder="Buscar..."
          onChange={(e) => onFilterTextChange(e.target.value)}
        />
      </form>
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
