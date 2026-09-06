import { useEffect, useRef, useState } from 'react'
import CourseRow from './CourseRow'
import CourseCard from './CourseCard'
import ErrorDisplay from './ErrorDisplay'

export default function CoursesGrid({
  courses,
  isCardLayout,
  selectedPath,
  onSelectCourse,
  onOpenModal,
  onToggleInProcess,
  focusIndex
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

  if (!courses.length) {
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
        role="listbox"
        aria-label="Lista de cursos"
      >
        {isCardLayout
          ? courses.map((course, index) => (
              <CourseCard
                key={course.path}
                course={course}
                onOpenModalClick={onOpenModal}
                onSelect={onSelectCourse}
                onToggleInProcess={onToggleInProcess}
                isSelected={selectedPath === course.path}
                tabIndex={focusIndex === index ? 0 : -1}
                onError={setError}
              />
            ))
          : courses.map((course, index) => (
              <CourseRow
                key={course.path}
                course={course}
                onOpenModalClick={onOpenModal}
                onSelect={onSelectCourse}
                onToggleInProcess={onToggleInProcess}
                isSelected={selectedPath === course.path}
                tabIndex={focusIndex === index ? 0 : -1}
                onError={setError}
              />
            ))}
      </div>
    </>
  )
}
