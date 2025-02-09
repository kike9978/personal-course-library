import CourseRow from './CourseRow'
import CourseCard from './CourseCard'
import CourseEditModal from './CourseEditModal'
import { useState, useMemo, useEffect } from 'react'
import path from 'path'
import ErrorDisplay from './ErrorDisplay'
import DebugModal from './DebugModal'

export default function CoursesGrid({
  courses,
  filterText,
  isCardLayout,
  isInProcessOnly,
  onSortedCourses
}) {
  const [modalCourseTitle, setModalCourseTitle] = useState('')
  const [modalProgramsList, setModalProgramsList] = useState([])
  const [currentCoursePath, setCurrentCoursePath] = useState('')
  const [error, setError] = useState(null)
  const [showDebug, setShowDebug] = useState(false)

  console.log('Courses:', courses)
  console.log('Is Array:', Array.isArray(courses))

  // Memoized filtered and sorted courses data
  const { courseListCard, courseListList, filteredCount } = useMemo(() => {
    try {
      if (!Array.isArray(courses)) {
        console.error('Courses is not an array:', courses)
        return { courseListCard: [], courseListList: [], filteredCount: 0 }
      }

      const filteredCourses = courses.filter(course => {
        try {
          const courseObject = window.readJSON(course)
          const searchLower = filterText.toLowerCase()
          const matchesText = 
            courseObject.title.toLowerCase().includes(searchLower) ||
            courseObject.institution.toLowerCase().includes(searchLower)
          
          const processCheck = !isInProcessOnly || courseObject.isInProcess
          return matchesText && processCheck
        } catch (error) {
          setError(error)
          window.fileSystem.handleError(error)
          return false
        }
      })

      const sortedCourses = [...filteredCourses].sort((a, b) => {
        try {
          const aTitle = window.readJSON(a).title.toLowerCase()
          const bTitle = window.readJSON(b).title.toLowerCase()
          return aTitle.localeCompare(bTitle)
        } catch (error) {
          setError(error)
          window.fileSystem.handleError(error)
          return 0
        }
      })

      // Generate UI components
      const [cards, rows] = sortedCourses.reduce(
        ([cardsAcc, rowsAcc], course) => {
          try {
            const courseObject = window.readJSON(course)
            const commonProps = {
              key: course,
              onClick: () => window.openFolder(course),
            }

            const card = (
              <CourseCard
                {...commonProps}
                courseTitle={courseObject.title}
                institution={courseObject.institution}
                programs={courseObject.programs}
                isInProcess={courseObject.isInProcess}
                coursePath={course}
                onOpenModalClick={() => {
                  setModalCourseTitle(courseObject.title)
                  setModalProgramsList(courseObject.programs)
                  setCurrentCoursePath(path.join(window.fileSystem.basePath, course, 'courseProps.json'))
                }}
              />
            )

            const row = (
              <CourseRow
                {...commonProps}
                courseTitle={courseObject.title}
                programs={courseObject.programs}
              />
            )

            return [[...cardsAcc, card], [...rowsAcc, row]]
          } catch (error) {
            setError(error)
            window.fileSystem.handleError(error)
            return [cardsAcc, rowsAcc]
          }
        },
        [[], []]
      )

      return {
        courseListCard: cards,
        courseListList: rows,
        filteredCount: sortedCourses.length
      }
    } catch (error) {
      setError(error)
      window.fileSystem.handleError(error)
      return { courseListCard: [], courseListList: [], filteredCount: 0 }
    }
  }, [courses, filterText, isInProcessOnly])

  // Update parent after render
  useEffect(() => {
    onSortedCourses(filteredCount)
  }, [filteredCount, onSortedCourses])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setShowDebug(true)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <ErrorDisplay error={error} />
      <div className={`courses-grid${!isCardLayout ? ' courses-grid--table' : ''}`}>
        {isCardLayout ? courseListCard : courseListList}
      </div>
      <CourseEditModal
        path={currentCoursePath}
        courseTitle={modalCourseTitle}
        onCourseTitleChange={setModalCourseTitle}
        programsList={modalProgramsList}
        onProgramsListChange={setModalProgramsList}
      />
      {showDebug && <DebugModal onClose={() => setShowDebug(false)} />}
    </>
  )
}
