import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getCoverFallback, getInstitutionLogo, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'

function CourseDetailPanel({ course, onClose, onEdit, onToggleInProcess }) {
  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [coverImg, setCoverImg] = useState(fallbackCover)
  const institutionImg = absoluteAssetUrl(getInstitutionLogo(course.institution))

  useEffect(() => {
    let cancelled = false
    if (!course.hasCover) {
      setCoverImg(fallbackCover)
      return undefined
    }
    window.api
      .getCoverImageUrl(course.path)
      .then((url) => {
        if (!cancelled && url) setCoverImg(url)
      })
      .catch(() => {
        if (!cancelled) setCoverImg(fallbackCover)
      })
    return () => {
      cancelled = true
    }
  }, [course.path, course.hasCover, fallbackCover])

  const handleOpen = async () => {
    try {
      await window.api.openCourseFolder(course.path)
    } catch (error) {
      toast.error(error.message || 'No se pudo abrir la carpeta')
    }
  }

  const handleToggle = async () => {
    try {
      await onToggleInProcess(course, !course.isInProcess)
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar')
    }
  }

  return (
    <aside className="detail-panel" aria-label="Detalle del curso">
      <div className="detail-panel__cover">
        <button
          type="button"
          className="card-action detail-panel__close"
          onClick={onClose}
          title="Cerrar"
          aria-label="Cerrar panel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
        {course.hasCover ? (
          <img
            src={coverImg}
            alt=""
            onError={(e) => {
              e.currentTarget.src = brandMark
            }}
          />
        ) : (
          <div className="cover-placeholder">
            <img src={brandMark} alt="" width={28} height={28} />
          </div>
        )}
      </div>

      <div className="detail-panel__body">
        <h2 className="detail-panel__title">{course.title}</h2>

        <div className="detail-meta">
          <div>
            <strong>Academia</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {institutionImg ? (
                <img className="institution-logo" src={institutionImg} alt="" />
              ) : null}
              <span>{course.institution || '—'}</span>
            </div>
          </div>
          <div>
            <strong>Instructor</strong>
            <div>{course.instructor || '—'}</div>
          </div>
          <div>
            <strong>Programas</strong>
            <div className="chips-container" style={{ marginTop: '0.35rem' }}>
              {(course.programs || []).length ? (
                course.programs.map((program, index) => (
                  <span key={`${program}-${index}`} className="badge badge--programs">
                    {program}
                  </span>
                ))
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
          <div>
            <strong>Estado</strong>
            <div>{course.isInProcess ? 'En curso' : 'Sin empezar / pausado'}</div>
          </div>
        </div>

        <div className="detail-actions">
          <button type="button" className="icon-btn" onClick={handleOpen}>
            Abrir carpeta
          </button>
          <button
            type="button"
            className={`icon-btn ${course.isInProcess ? 'icon-btn--ghost' : 'icon-btn--teal'}`}
            onClick={handleToggle}
          >
            {course.isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={() => onEdit(course)}>
            Editar detalles
          </button>
        </div>
      </div>
    </aside>
  )
}

export default CourseDetailPanel
