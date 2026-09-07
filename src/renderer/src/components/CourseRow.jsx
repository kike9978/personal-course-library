import { useEffect, useState } from 'react'
import { getInstitutionLogo, getCoverFallback, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'

function CourseRow({
  course,
  onOpenModalClick,
  onOpenCourse,
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
    hasCover,
    isInProcess: initialInProcess
  } = course

  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [coverImg, setCoverImg] = useState(fallbackCover)
  const [coverFailed, setCoverFailed] = useState(false)
  const [isInProcess, setIsInProcess] = useState(Boolean(initialInProcess))
  const [institutionImg, setInstitutionImg] = useState(() =>
    absoluteAssetUrl(getInstitutionLogo(institution))
  )

  useEffect(() => {
    setInstitutionImg(absoluteAssetUrl(getInstitutionLogo(institution)))
  }, [institution])

  useEffect(() => {
    setIsInProcess(Boolean(course.isInProcess))
  }, [course.isInProcess])

  useEffect(() => {
    setCoverFailed(false)
    if (!hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }

    let cancelled = false
    window.api
      .getCoverImageUrl(coursePath)
      .then((url) => {
        if (!cancelled && url) setCoverImg(url)
      })
      .catch(() => {
        if (!cancelled) setCoverImg(fallbackCover)
      })

    return () => {
      cancelled = true
    }
  }, [coursePath, hasCover, fallbackCover])

  const handleOpenCourse = () => {
    onOpenCourse?.(course)
  }

  const handleOpenFolder = () => {
    window.api.openCourseFolder(coursePath).catch((error) => {
      if (onError) onError(error)
    })
  }

  const toggleInProcess = async (e) => {
    e.preventDefault()
    e.stopPropagation()
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleOpenCourse()
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      onOpenModalClick?.(course)
    } else if (e.key === ' ') {
      e.preventDefault()
      onSelect?.(course)
    }
  }

  return (
    <div
      role="button"
      tabIndex={tabIndex ?? 0}
      className={`course-row${isSelected ? ' is-selected' : ''}`}
      onClick={() => onSelect?.(course)}
      onDoubleClick={handleOpenCourse}
      onKeyDown={handleKeyDown}
      data-course-path={coursePath}
    >
      <div className="course-row__thumb">
        {hasCover && !coverFailed ? (
          <img
            src={coverImg}
            alt=""
            onError={() => {
              setCoverFailed(true)
              setCoverImg(fallbackCover)
            }}
          />
        ) : (
          <div className="cover-placeholder">
            <img src={brandMark} alt="" width={28} height={28} />
          </div>
        )}
      </div>
      <h3 title={courseTitle}>{courseTitle}</h3>
      <div className="course-row__side">
        {course.isNew ? <span className="badge badge--new">Nuevo</span> : null}
        {course.missingProps ? <span className="badge badge--warn">Sin props</span> : null}
        {typeof course.rate === 'number' && course.rate > 0 ? (
          <span className="course-card__rate">{'★'.repeat(course.rate)}</span>
        ) : null}
        {typeof course.learning?.percent === 'number' && course.learning.playableCount > 0 ? (
          <span className="course-row__percent">{course.learning.percent}%</span>
        ) : null}
        {course.learning?.lastLessonTitle ? (
          <span className="course-row__resume" title={course.learning.lastLessonTitle}>
            {course.learning.lastLessonTitle}
          </span>
        ) : null}
        {isInProcess ? <span className="status-ribbon status-ribbon--inline">En curso</span> : null}
        {course.learning?.status === 'completed' ? (
          <span className="badge badge--done">Completado</span>
        ) : null}
        {institutionImg ? (
          <img
            className="institution-logo"
            alt=""
            src={institutionImg}
            title={institution}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        {(programs || []).slice(0, 3).map((program, index) => (
          <span key={`${program}-${index}`} className="badge badge--programs">
            {program}
          </span>
        ))}
      </div>
      <div className="course-row__actions">
        <button
          type="button"
          className="card-action"
          title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={toggleInProcess}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </button>
        <button
          type="button"
          className="card-action"
          title="Abrir curso"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            handleOpenCourse()
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          type="button"
          className="card-action"
          title="Abrir en explorador"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            handleOpenFolder()
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
        </button>
        <button
          type="button"
          className="card-action"
          title="Editar"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onOpenModalClick?.(course)
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default CourseRow
