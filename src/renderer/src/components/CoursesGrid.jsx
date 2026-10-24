import { useEffect, useRef, useState } from 'react'
import CourseCard from './CourseCard'
import CourseTable from './CourseTable'
import ErrorDisplay from './ErrorDisplay'

export default function CoursesGrid({
  courses,
  isCardLayout,
  selectedPath,
  onSelectCourse,
  onOpenCourse,
  onOpenModal,
  onToggleInProcess,
  focusIndex,
  columnSort,
  onColumnSort,
  columnFilters,
  onColumnFilter,
  institutions,
  programs,
  themes
}) {
  const [error, setError] = useState(null)
  const gridRef = useRef(null)

  useEffect(() => {
    if (focusIndex == null || focusIndex < 0) return
    const course = courses[focusIndex]
    if (!course || !gridRef.current) return
    const escape =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(course.path)
        : course.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const el = gridRef.current.querySelector(`[data-course-path="${escape}"]`)
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true })
    }
  }, [focusIndex, courses, isCardLayout])

  if (!courses.length && isCardLayout) {
    return (
      <div className="empty-state">
        <h3>Ningún curso coincide</h3>
        <p>Prueba otra búsqueda, quita filtros o refresca la biblioteca.</p>
      </div>
    )
  }

  return (
    <>
      <ErrorDisplay error={error} />
      <div
        ref={gridRef}
        className={`courses-grid${!isCardLayout ? ' courses-grid--table' : ''}`}
        role={isCardLayout ? 'listbox' : undefined}
        aria-label="Lista de cursos"
      >
        {isCardLayout ? (
          courses.map((course, index) => (
            <CourseCard
              key={course.path}
              course={course}
              onOpenCourse={onOpenCourse}
              onOpenModalClick={onOpenModal}
              onSelect={onSelectCourse}
              onToggleInProcess={onToggleInProcess}
              isSelected={selectedPath === course.path}
              tabIndex={focusIndex === index ? 0 : -1}
              onError={setError}
            />
          ))
        ) : (
          <CourseTable
            courses={courses}
            selectedPath={selectedPath}
            onSelectCourse={onSelectCourse}
            onOpenCourse={onOpenCourse}
            onOpenModal={onOpenModal}
            onToggleInProcess={onToggleInProcess}
            focusIndex={focusIndex}
            onError={setError}
            columnSort={columnSort}
            onColumnSort={onColumnSort}
            columnFilters={columnFilters}
            onColumnFilter={onColumnFilter}
            institutions={institutions}
            programs={programs}
            themes={themes}
          />
        )}
      </div>
    </>
  )
}
