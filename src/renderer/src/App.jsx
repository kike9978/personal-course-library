import CoursesGrid from "./components/CoursesGrid"
import { useState } from 'react'


function FilterableCoursesGrid({ courses }) {
  const [filterText, setFilterText] = useState('')
  const [isCardLayout, setIsCardLayout] = useState(true)

  return (
    <div>
      <SearchBar
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onCardLayoutChange={setIsCardLayout}
        isCardLayout={isCardLayout}
      />
      <CoursesGrid courses={courses} filterText={filterText} isCardLayout={isCardLayout} />
    </div>
  )
}

function SearchBar({ filterText, onFilterTextChange, onCardLayoutChange, isCardLayout
}) {
  return (
    <div className="navbar">
      <h1>Catálogo de cursos</h1>
      <label >
        <input
          type="checkbox"
          checked={isCardLayout}
          onChange={e => onCardLayoutChange(e.target.checked)}
        />{" "}
        Mostrar vista de cards
      </label>
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
