import CourseRow from './CourseRow'
import CourseCard from './CourseCard'
import CourseEditModal from './CourseEditModal'
import { useState, useMemo, useEffect } from 'react'

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

  // Memoized filtered and sorted courses data
  const { courseListCard, courseListList, filteredCount } = useMemo(() => {
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
        return false
      }
    })

    const sortedCourses = [...filteredCourses].sort((a, b) => {
      try {
        const aTitle = window.readJSON(a).title.toLowerCase()
        const bTitle = window.readJSON(b).title.toLowerCase()
        return aTitle.localeCompare(bTitle)
      } catch {
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
                setCurrentCoursePath(`${window.extensions.windows}${course}\\courseProps.json`)
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
        } catch {
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
  }, [courses, filterText, isInProcessOnly])

  // Update parent after render
  useEffect(() => {
    onSortedCourses(filteredCount)
  }, [filteredCount, onSortedCourses])

  return (
    <>
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
    </>
  )
}
