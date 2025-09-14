import CourseRow from './CourseRow'
import CourseCard from './CourseCard'
import CourseEditModal from './CourseEditModal'
import { useState, useMemo, useEffect, useCallback } from 'react'
import ErrorDisplay from './ErrorDisplay'
import Toast from './Toast'
import { Toaster, toast } from 'react-hot-toast'

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
  const [toast, setToast] = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedCoursePath, setSelectedCoursePath] = useState(null)
  const [selectedCourseTitle, setSelectedCourseTitle] = useState('')
  const [selectedCoursePrograms, setSelectedCoursePrograms] = useState([])
  const [courseDataCache, setCourseDataCache] = useState({})

  console.log('Courses:', courses)
  console.log('Is Array:', Array.isArray(courses))

  // Preload course data
  useEffect(() => {
    const preloadCourseData = async () => {
      if (!Array.isArray(courses)) return

      const newCache = { ...courseDataCache }
      for (const course of courses) {
        if (!newCache[course]) {
          try {
            newCache[course] = window.readJSON(course)
          } catch (err) {
            console.error(`Error loading data for ${course}:`, err)
            newCache[course] = { title: course, error: true }
          }
        }
      }
      setCourseDataCache(newCache)
    }

    preloadCourseData()

    // Listen for course updates
    const handleCourseUpdate = (event, updateData) => {
      setCourseDataCache((prev) => ({
        ...prev,
        [updateData.coursePath]: updateData.fullData
      }))
    }

    window.ipcRenderer.on('course-updated', handleCourseUpdate)

    return () => {
      window.ipcRenderer.removeListener('course-updated', handleCourseUpdate)
    }
  }, [courses])

  // Function to show toast
  const showToast = (message, type = 'success', duration = 3000) => {
    setToast({ message, type, duration })
  }

  // MOVED THIS FUNCTION UP - Define handleOpenModal before it's used
  const handleOpenModal = useCallback(
    (coursePath) => {
      try {
        console.log('Opening modal for course:', coursePath)
        const courseData = courseDataCache[coursePath] || window.readJSON(coursePath)
        setSelectedCoursePath(coursePath)
        setSelectedCourseTitle(courseData.title || '')
        setSelectedCoursePrograms(courseData.programs || [])
      } catch (err) {
        console.error('Failed to open modal:', err)
        toast.error(`Error opening edit form: ${err.message}`)
      }
    },
    [courseDataCache]
  )

  const handleCloseModal = useCallback(() => {
    setSelectedCoursePath(null)
    setSelectedCourseTitle('')
    setSelectedCoursePrograms([])
  }, [])

  // Function to handle course updates
  const handleCourseUpdated = useCallback((path, updatedData) => {
    console.log('Course updated:', path, updatedData)
    showToast('Course updated successfully!', 'success')
    // Force a refresh of the UI
    setRefreshTrigger((prev) => prev + 1)

    // If we have updated data, we can use it to update our state
    if (updatedData) {
      console.log('Updated data received:', updatedData)
    }
  }, [])

  // Define openEditModal as a useCallback to prevent unnecessary re-renders
  const openEditModal = useCallback(
    (coursePath) => {
      try {
        console.log('Opening edit modal for course:', coursePath)
        const courseObject = courseDataCache[coursePath] || window.readJSON(coursePath)
        setModalCourseTitle(courseObject.title || '')
        setModalProgramsList(courseObject.programs || [])

        // Instead of using path.join, use string concatenation or a helper function
        const fullPath = `${window.fileSystem.basePath}/${coursePath}/courseProps.json`
        setCurrentCoursePath(fullPath)

        console.log('Modal state set:', {
          title: courseObject.title,
          programs: courseObject.programs,
          path: fullPath
        })

        // The modal will be shown via the useEffect in CourseEditModal
      } catch (error) {
        console.error('Error opening edit modal:', error)
        setError(error)
        showToast(`Error opening edit modal: ${error.message}`, 'error')
        if (window.fileSystem && typeof window.fileSystem.handleError === 'function') {
          window.fileSystem.handleError(error)
        }
      }
    },
    [courseDataCache]
  )

  // Memoized filtered and sorted courses data
  const { courseListCard, courseListList, filteredCount } = useMemo(() => {
    try {
      if (!Array.isArray(courses)) {
        console.error('Courses is not an array:', courses)
        return { courseListCard: [], courseListList: [], filteredCount: 0 }
      }

      const filteredCourses = courses.filter((course) => {
        try {
          const courseObject = courseDataCache[course] || window.readJSON(course)
          const searchLower = filterText.toLowerCase()
          const matchesText =
            courseObject.title.toLowerCase().includes(searchLower) ||
            courseObject.institution.toLowerCase().includes(searchLower)

          const processCheck = !isInProcessOnly || courseObject.isInProcess
          return matchesText && processCheck
        } catch (error) {
          setError(error)
          if (window.fileSystem && typeof window.fileSystem.handleError === 'function') {
            window.fileSystem.handleError(error)
          }
          return false
        }
      })

      // Sort courses alphabetically by title
      const sortedCourses = [...filteredCourses].sort((a, b) => {
        try {
          const dataA = courseDataCache[a] || window.readJSON(a)
          const dataB = courseDataCache[b] || window.readJSON(b)
          const titleA = dataA.title.toLowerCase()
          const titleB = dataB.title.toLowerCase()
          return titleA.localeCompare(titleB)
        } catch (error) {
          setError(error)
          if (window.fileSystem && typeof window.fileSystem.handleError === 'function') {
            window.fileSystem.handleError(error)
          }
          return 0
        }
      })

      // Generate UI components
      const [cards, rows] = sortedCourses.reduce(
        ([cardsAcc, rowsAcc], course) => {
          try {
            const courseObject = courseDataCache[course] || window.readJSON(course)

            // Create card component with explicit onOpenModalClick prop
            const card = (
              <CourseCard
                key={`${course}-${refreshTrigger}`} // Add refreshTrigger to force re-render
                courseTitle={courseObject.title}
                institution={courseObject.institution}
                programs={courseObject.programs}
                isInProcess={courseObject.isInProcess}
                coursePath={course}
                onOpenModalClick={handleOpenModal} // Use handleOpenModal instead of openEditModal
                institutionImgUrl={`/src/assets/img/institutions/${courseObject.institution.toLowerCase()}.png`}
              />
            )

            const row = (
              <CourseRow
                key={`${course}-${refreshTrigger}`} // Add refreshTrigger to force re-render
                courseTitle={courseObject.title}
                institution={courseObject.institution}
                programs={courseObject.programs}
                onClick={() => window.openFolder(course)}
                institutionImgUrl={`/src/assets/img/institutions/${courseObject.institution.toLowerCase()}.png`}
              />
            )

            return [
              [...cardsAcc, card],
              [...rowsAcc, row]
            ]
          } catch (error) {
            setError(error)
            if (window.fileSystem && typeof window.fileSystem.handleError === 'function') {
              window.fileSystem.handleError(error)
            }
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
      if (window.fileSystem && typeof window.fileSystem.handleError === 'function') {
        window.fileSystem.handleError(error)
      }
      return { courseListCard: [], courseListList: [], filteredCount: 0 }
    }
  }, [courses, filterText, isInProcessOnly, refreshTrigger, handleOpenModal, courseDataCache])

  // Update parent after render
  useEffect(() => {
    onSortedCourses(filteredCount)
  }, [filteredCount, onSortedCourses])


  return (
    <>
      <ErrorDisplay error={error} />
      <div className={`courses-grid${!isCardLayout ? ' courses-grid--table' : ''}`}>
        <Toaster position="top-right" />
        {isCardLayout ? courseListCard : courseListList}
      </div>
      {selectedCoursePath && (
        <CourseEditModal
          path={selectedCoursePath}
          courseTitle={selectedCourseTitle}
          programsList={selectedCoursePrograms}
          onCourseUpdated={handleCourseUpdated}
          onClose={handleCloseModal}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
