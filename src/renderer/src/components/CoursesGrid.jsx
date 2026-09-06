import { useState, useCallback } from 'react'
import CourseRow from './CourseRow'
import CourseCard from './CourseCard'
import CourseEditModal from './CourseEditModal'
import ErrorDisplay from './ErrorDisplay'
import { toast } from 'react-hot-toast'

export default function CoursesGrid({ courses, isCardLayout }) {
  const [error, setError] = useState(null)
  const [selectedCourse, setSelectedCourse] = useState(null)

  const handleOpenModal = useCallback((course) => {
    setSelectedCourse(course)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedCourse(null)
  }, [])

  const handleCourseUpdated = useCallback(() => {
    toast.success('Course updated successfully!')
    setSelectedCourse(null)
  }, [])

  return (
    <>
      <ErrorDisplay error={error} />
      <div className={`courses-grid${!isCardLayout ? ' courses-grid--table' : ''}`}>
        {isCardLayout
          ? courses.map((course) => (
              <CourseCard
                key={course.path}
                course={course}
                onOpenModalClick={handleOpenModal}
                onError={setError}
              />
            ))
          : courses.map((course) => (
              <CourseRow key={course.path} course={course} onError={setError} />
            ))}
      </div>
      {selectedCourse && (
        <CourseEditModal
          course={selectedCourse}
          onCourseUpdated={handleCourseUpdated}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}
