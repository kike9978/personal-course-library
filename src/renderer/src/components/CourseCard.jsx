import { useState, useEffect, useRef } from 'react'
import { getInstitutionLogo, getCoverFallback, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'

function useCoverImage(coursePath, hasCover) {
  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [coverImg, setCoverImg] = useState(fallbackCover)
  const [coverFailed, setCoverFailed] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    setCoverFailed(false)
    if (!hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }

    let cancelled = false
    const load = () => {
      window.api
        .getCoverImageUrl(coursePath)
        .then((url) => {
          if (!cancelled && url) setCoverImg(url)
        })
        .catch(() => {
          if (!cancelled) setCoverImg(fallbackCover)
        })
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        load()
      },
      { threshold: 0.05, rootMargin: '120px' }
    )

    if (ref.current) observer.observe(ref.current)
    else load()

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [coursePath, hasCover, fallbackCover])

  return {
    ref,
    coverSrc: coverFailed ? fallbackCover : coverImg,
    onCoverError: () => {
      setCoverFailed(true)
      setCoverImg(fallbackCover)
    }
  }
}

function stopCardEvent(e) {
  e.preventDefault()
  e.stopPropagation()
}

function CourseCard({
  course,
  onOpenModalClick,
  onSelect,
  onToggleInProcess,
  isSelected,
  tabIndex,
  onError
}) {
  const {
    path: coursePath,
    title: courseTitle,
    institution,
    programs = [],
    isInProcess: initialInProcess,
    hasCover
  } = course

  const [isInProcess, setIsInProcess] = useState(Boolean(initialInProcess))
  const [institutionImg, setInstitutionImg] = useState(() =>
    absoluteAssetUrl(getInstitutionLogo(institution))
  )
  const { ref, coverSrc, onCoverError } = useCoverImage(coursePath, hasCover)

  useEffect(() => {
    setIsInProcess(Boolean(course.isInProcess))
  }, [course.isInProcess])

  useEffect(() => {
    setInstitutionImg(absoluteAssetUrl(getInstitutionLogo(institution)))
  }, [institution])

  const toggleInProcess = async (e) => {
    stopCardEvent(e)
    const newValue = !isInProcess
    const previous = isInProcess
    setIsInProcess(newValue)
    try {
      if (onToggleInProcess) {
        await onToggleInProcess(course, newValue)
      } else {
        const result = await window.api.updateCourseProperty(coursePath, 'isInProcess', newValue)
        if (!result.success) setIsInProcess(previous)
      }
    } catch (error) {
      setIsInProcess(previous)
      if (onError) onError(error)
    }
  }

  const handleOpen = (e) => {
    stopCardEvent(e)
    window.api.openCourseFolder(coursePath).catch((error) => {
      if (onError) onError(error)
    })
  }

  const handleEdit = (e) => {
    stopCardEvent(e)
    if (typeof onOpenModalClick === 'function') {
      onOpenModalClick(course)
    }
  }

  const handleSelect = () => {
    onSelect?.(course)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      window.api.openCourseFolder(coursePath).catch((error) => {
        if (onError) onError(error)
      })
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      onOpenModalClick?.(course)
    } else if (e.key === ' ') {
      e.preventDefault()
      handleSelect()
    }
  }

  return (
    <article
      ref={ref}
      className={`course-card${isSelected ? ' is-selected' : ''}`}
      onClick={handleSelect}
      onDoubleClick={(e) => {
        e.preventDefault()
        window.api.openCourseFolder(coursePath).catch((error) => {
          if (onError) onError(error)
        })
      }}
      onKeyDown={handleKeyDown}
      tabIndex={tabIndex ?? 0}
      data-course-path={coursePath}
    >
      <div className="course-card__cover">
        {hasCover ? (
          <img src={coverSrc} alt="" onError={onCoverError} />
        ) : (
          <div className="cover-placeholder">
            <img src={brandMark} alt="" width={28} height={28} />
          </div>
        )}

        <button
          type="button"
          className={`status-ribbon${isInProcess ? '' : ' status-ribbon--off'}`}
          onMouseDown={stopCardEvent}
          onClick={toggleInProcess}
          title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
        >
          {isInProcess ? 'En curso' : '+ En curso'}
        </button>

        <div className="course-card__actions">
          <button
            type="button"
            className="card-action"
            onMouseDown={stopCardEvent}
            onClick={handleOpen}
            title="Abrir carpeta"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
          </button>
          <button
            type="button"
            className="card-action"
            onMouseDown={stopCardEvent}
            onClick={handleEdit}
            title="Editar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="course-card__body">
        <h3 className="course-card__title" title={courseTitle}>
          {courseTitle}
        </h3>
        <div className="course-card__meta">
          {institutionImg ? (
            <img
              className="institution-logo"
              src={institutionImg}
              alt=""
              title={institution}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          {institution ? <span className="institution-name">{institution}</span> : null}
        </div>
        <div className="chips-container">
          {(programs || []).slice(0, 4).map((program, index) => (
            <span key={`${program}-${index}`} className="badge badge--programs">
              {program}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

export default CourseCard
