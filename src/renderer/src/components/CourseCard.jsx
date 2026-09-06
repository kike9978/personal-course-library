import { useState, useEffect, useRef } from 'react'
import { getInstitutionLogo, getCoverFallback, absoluteAssetUrl } from '../utils/images'

function CourseCard({ course, onOpenModalClick, onError }) {
  const {
    path: coursePath,
    title: courseTitle,
    institution,
    programs = [],
    isInProcess: initialInProcess,
    hasCover
  } = course

  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [isInProcess, setIsInProcess] = useState(Boolean(initialInProcess))
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [coverImg, setCoverImg] = useState(fallbackCover)
  const [coverFailed, setCoverFailed] = useState(false)
  const [institutionImg, setInstitutionImg] = useState(() =>
    absoluteAssetUrl(getInstitutionLogo(institution))
  )
  const cardRef = useRef(null)

  useEffect(() => {
    setIsInProcess(Boolean(course.isInProcess))
  }, [course.isInProcess])

  useEffect(() => {
    setInstitutionImg(absoluteAssetUrl(getInstitutionLogo(institution)))
  }, [institution])

  useEffect(() => {
    setCoverFailed(false)
    if (!hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }

    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        window.api
          .getCoverImageUrl(coursePath)
          .then((url) => {
            if (!cancelled && url) setCoverImg(url)
          })
          .catch((error) => {
            console.error('Error loading cover image:', error)
            if (!cancelled) setCoverImg(fallbackCover)
            if (onError) onError(error)
          })
      },
      { threshold: 0.1 }
    )

    if (cardRef.current) observer.observe(cardRef.current)

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [coursePath, hasCover, onError, fallbackCover])

  useEffect(() => {
    const unsubscribe = window.api.onCourseUpdated((update) => {
      if (update.coursePath === coursePath && update.property === 'isInProcess') {
        setIsInProcess(Boolean(update.value))
      }
    })
    return unsubscribe
  }, [coursePath])

  const handleCheckboxClick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const newValue = !isInProcess
    const previous = isInProcess
    setIsInProcess(newValue)
    try {
      const result = await window.api.updateCourseProperty(coursePath, 'isInProcess', newValue)
      if (!result.success) {
        setIsInProcess(previous)
      }
    } catch (error) {
      setIsInProcess(previous)
      console.error('Error updating isInProcess:', error)
      if (onError) onError(error)
    }
  }

  const handleCardClick = (e) => {
    if (!e.target.closest('.in-progress') && !e.target.closest('.kebab-menu')) {
      window.api.openCourseFolder(coursePath).catch((error) => {
        console.error(error)
        if (onError) onError(error)
      })
    }
  }

  const toggleDropdown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDropdownOpen((open) => !open)
  }

  const handleEditClick = (e) => {
    e.stopPropagation()
    if (typeof onOpenModalClick === 'function') {
      onOpenModalClick(course)
    }
    setIsDropdownOpen(false)
  }

  return (
    <article
      ref={cardRef}
      onClick={handleCardClick}
      className="course-card p-4 border rounded-lg shadow-md hover:shadow-lg transition"
    >
      <img
        src={coverFailed ? fallbackCover : coverImg}
        alt=""
        className="w-full h-32 object-cover rounded-md"
        onError={() => {
          setCoverFailed(true)
          setCoverImg(fallbackCover)
        }}
      />
      <div className="kebab-menu relative">
        <button
          type="button"
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
              type="button"
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
          <h3 className="text-lg font-semibold">{courseTitle}</h3>
          {institutionImg && (
            <img
              className="institution-logo h-8 w-8 rounded-full object-contain"
              src={institutionImg}
              alt=""
              title={institution}
              onError={(e) => {
                const fallback = absoluteAssetUrl(getInstitutionLogo(null))
                if (fallback && e.currentTarget.src !== fallback) {
                  e.currentTarget.src = absoluteAssetUrl(fallback)
                } else {
                  e.currentTarget.style.display = 'none'
                }
              }}
            />
          )}
        </div>
        <div className="chips-container flex flex-wrap mt-2">
          {programs.map((program, index) => (
            <div
              key={`${program}-${index}`}
              className="badge badge--programs bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded mr-1 mb-1"
            >
              <span>{program}</span>
            </div>
          ))}
        </div>
        <label className="in-progress flex items-center mt-2">
          <input
            type="checkbox"
            checked={isInProcess}
            onChange={handleCheckboxClick}
            className="mr-2"
          />{' '}
          En curso
        </label>
      </div>
    </article>
  )
}

export default CourseCard
