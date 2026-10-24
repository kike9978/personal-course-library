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
  onOpenCourse,
  onSelect,
  onToggleInProcess,
  isSelected,
  tabIndex,
  onError,
  showLearningMeta = true
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
  const isRecentlyViewed = Boolean(course.learning?.isRecentlyViewed)
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

  const handleOpenCourse = (e) => {
    stopCardEvent(e)
    if (typeof onOpenCourse === 'function') {
      onOpenCourse(course)
    }
  }

  const handleOpenFolder = (e) => {
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
      onOpenCourse?.(course)
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
        onOpenCourse?.(course)
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

        <div className="course-card__marks">
          <button
            type="button"
            className={`status-ribbon${isInProcess ? '' : ' status-ribbon--off'}`}
            onMouseDown={stopCardEvent}
            onClick={toggleInProcess}
            title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
          >
            {isInProcess ? 'En curso' : '+ En curso'}
          </button>
          {isRecentlyViewed ? (
            <span className="status-ribbon status-ribbon--recent">Reciente</span>
          ) : null}
        </div>

        <div className="course-card__actions">
          <button
            type="button"
            className="card-action"
            onMouseDown={stopCardEvent}
            onClick={handleOpenCourse}
            title="Abrir curso"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            type="button"
            className="card-action"
            onMouseDown={stopCardEvent}
            onClick={handleOpenFolder}
            title="Abrir en explorador"
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
        {showLearningMeta && course.learning?.lastLessonTitle ? (
          <p className="course-card__resume" title={course.learning.lastLessonTitle}>
            {course.learning.status === 'completed'
              ? 'Completado'
              : `Continuar: ${course.learning.lastLessonTitle}`}
          </p>
        ) : null}
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
          {typeof course.rate === 'number' && course.rate > 0 ? (
            <span className="course-card__rate" title={`${course.rate}/5`}>
              {'★'.repeat(course.rate)}
            </span>
          ) : null}
          {showLearningMeta &&
          typeof course.learning?.percent === 'number' &&
          course.learning.playableCount > 0 ? (
            <span className="course-card__percent">{course.learning.percent}%</span>
          ) : null}
        </div>
        {showLearningMeta && course.learning?.playableCount > 0 ? (
          <div className="course-card__progress" aria-hidden="true">
            <div
              className="course-card__progress-bar"
              style={{ width: `${Math.min(100, course.learning.percent || 0)}%` }}
            />
          </div>
        ) : null}
        <div className="chips-container">
          {course.isNew ? <span className="badge badge--new">Nuevo</span> : null}
          {course.missingProps ? <span className="badge badge--warn">Sin props</span> : null}
          {(programs || []).slice(0, 3).map((program, index) => (
            <span key={`${program}-${index}`} className="badge badge--programs">
              {program}
            </span>
          ))}
          {(course.theme || []).slice(0, 2).map((theme, index) => (
            <span key={`theme-${theme}-${index}`} className="badge badge--theme">
              {theme}
            </span>
          ))}
          {course.learning?.status === 'completed' ? (
            <span className="badge badge--done">Completado</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default CourseCard
