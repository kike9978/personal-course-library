import { useState, useEffect, useRef } from 'react'
import coverImage from '../assets/img/coverimage-test.svg'

// Import all institution images using a more reliable approach
const institutionImages = import.meta.glob('/src/assets/img/institutions/*.{png,jpg,jpeg,svg}', {
  eager: true
})

function CourseCard({
  courseTitle,
  institution,
  programs,
  coursePath,
  onOpenModalClick,
  institutionImgUrl
}) {
  const [courseData, setCourseData] = useState(() => window.readJSON(coursePath))
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [institutionImg, setInstitutionImg] = useState(null)
  const [coverImg, setCoverImg] = useState(window.coursesCoverImages[courseTitle] || coverImage)
  const cardRef = useRef(null)

  const isInProcess = courseData.isInProcess

  useEffect(() => {
    // Find the institution image
    const institutionLower = institution ? institution.toLowerCase() : ''
    console.log('Looking for institution image for:', institutionLower)

    // Debug available images
    console.log('Available institution images:', Object.keys(institutionImages))

    // Try to find a matching image
    let foundImage = null

    // First try exact match with institution name
    Object.keys(institutionImages).forEach((path) => {
      const filename = path.split('/').pop().toLowerCase()
      if (filename.includes(institutionLower)) {
        console.log('Found matching institution image:', path)
        foundImage = institutionImages[path].default || institutionImages[path]
      }
    })

    // If not found, try with the provided URL
    if (!foundImage && institutionImgUrl) {
      const imgName = institutionImgUrl.split('/').pop().toLowerCase()
      Object.keys(institutionImages).forEach((path) => {
        if (path.toLowerCase().includes(imgName)) {
          console.log('Found institution image by URL:', path)
          foundImage = institutionImages[path].default || institutionImages[path]
        }
      })
    }

    // If still not found, use default
    if (!foundImage) {
      console.log('Using default institution image')
      // Try to find a default image
      Object.keys(institutionImages).forEach((path) => {
        if (path.toLowerCase().includes('default')) {
          foundImage = institutionImages[path].default || institutionImages[path]
        }
      })
    }

    setInstitutionImg(foundImage)
    console.log('Set institution image to:', foundImage)

    // Lazy load cover image when card comes into view
    const loadCoverImage = async () => {
      if (window.coursesCoverImages[courseTitle]) {
        setCoverImg(window.coursesCoverImages[courseTitle])
      } else {
        try {
          // Use the new loadCoverImage function from preload
          const coverImageData = await window.fileSystem.loadCoverImage(coursePath)
          if (coverImageData) {
            setCoverImg(coverImageData)
          }
        } catch (error) {
          console.error('Error loading cover image:', error)
        }
      }
    }

    // Set up intersection observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadCoverImage()
          observer.disconnect() // Load once
        }
      },
      { threshold: 0.1 } // Load when 10% visible
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => observer.disconnect()

    // Listen for course updates
    const handleCourseUpdate = (event, updateData) => {
      if (updateData.coursePath === coursePath) {
        setCourseData((prevData) => ({
          ...prevData,
          [updateData.property]: updateData.value
        }))
      }
    }

    window.ipcRenderer.on('course-updated', handleCourseUpdate)

    return () => {
      window.ipcRenderer.removeListener('course-updated', handleCourseUpdate)
    }
  }, [institution, institutionImgUrl, courseTitle, coursePath])

  const handleCheckboxClick = async (e) => {
    e.preventDefault()
    const newValue = !isInProcess
    try {
      await window.ipcRenderer.invoke('write-course-property', {
        coursePath,
        property: 'isInProcess',
        value: newValue
      })
    } catch (error) {
      console.error('Error updating isInProcess:', error)
    }
  }

  const handleCardClick = (e) => {
    if (!e.target.closest('.in-progress') && !e.target.closest('.kebab-menu')) {
      window.openFolder(coursePath)
    }
  }

  const toggleDropdown = (e) => {
    e.preventDefault()
    e.stopPropagation() // Stop event propagation to prevent card click
    console.log('Dropdown button clicked!')
    setIsDropdownOpen(!isDropdownOpen)
  }

  const handleEditClick = (e) => {
    e.stopPropagation()
    console.log('Edit button clicked!')

    if (typeof onOpenModalClick === 'function') {
      try {
        onOpenModalClick(coursePath)
        console.log('Modal function called successfully')
      } catch (err) {
        console.error('Error calling modal function:', err)
        alert('Error opening edit modal: ' + err.message)
      }
    } else {
      console.error('onOpenModalClick is not a function!', typeof onOpenModalClick)
      alert('Could not open edit modal: function not available')
    }

    setIsDropdownOpen(false)
  }

  const programChips = programs.map((program, index) => {
    return (
      <div
        key={`${program}-${index}`}
        className="badge badge--programs bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded mr-1 mb-1"
      >
        <span>{program}</span>
      </div>
    )
  })

  return (
    <article
      ref={cardRef}
      onClick={handleCardClick}
      className="course-card p-4 border rounded-lg shadow-md hover:shadow-lg transition"
    >
      <img src={coverImg} alt="course thumbnail" className="w-full h-32 object-cover rounded-md" />
      <div className="kebab-menu relative">
        <button
          className="kebab-button p-2 rounded-full hover:bg-gray-200"
          onClick={toggleDropdown}
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="18" r="2" />
          </svg>
        </button>
        {isDropdownOpen && (
          <div className="dropdown-menu absolute right-0 mt-2 w-48 bg-white border border-gray-300 rounded-md shadow-lg z-10">
            <button
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={handleEditClick}
            >
              Edit Details
            </button>
          </div>
        )}
      </div>
      <div className="course-info mt-2">
        <div className="course-header flex items-center justify-between">
          <h3 className="text-lg font-semibold">{courseTitle && courseTitle}</h3>
          {institutionImg && (
            <img
              className="institution-logo h-8 w-8 rounded-full object-contain"
              src={institutionImg}
              alt={`${institution} logo`}
              title={institution}
              onError={(e) => {
                console.error('Failed to load institution image:', e)
                e.target.style.display = 'none'
              }}
            />
          )}
        </div>
        <div className="chips-container flex flex-wrap mt-2">{programChips}</div>
        <div className="completion-rate text-sm text-gray-500">100%</div>
        <label className="in-progress flex items-center mt-2">
          <input
            type="checkbox"
            checked={isInProcess}
            onChange={(e) => {
              handleCheckboxClick(e)
            }}
            className="mr-2"
          />{' '}
          En curso
        </label>
        <a
          href="http://"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Notas →
        </a>
      </div>
    </article>
  )
}

export default CourseCard
