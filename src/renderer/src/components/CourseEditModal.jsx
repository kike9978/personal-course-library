import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'
import ChipAutocomplete from './ChipAutocomplete'

function CourseEditModal({ course, onCourseUpdated, onClose, programOptions = [] }) {
  const dialogRef = useRef(null)
  const [instructor, setInstructor] = useState(course.instructor || '')
  const [institution, setInstitution] = useState(course.institution || '')
  const [localCourseTitle, setLocalCourseTitle] = useState(course.title || '')
  const [localProgramsList, setLocalProgramsList] = useState(
    Array.isArray(course.programs) ? course.programs : []
  )
  const [isSaving, setIsSaving] = useState(false)
  const [coverImg, setCoverImg] = useState(absoluteAssetUrl(getCoverFallback()))

  useEffect(() => {
    setLocalCourseTitle(course.title || '')
    setLocalProgramsList(Array.isArray(course.programs) ? course.programs : [])
    setInstructor(course.instructor || '')
    setInstitution(course.institution || '')

    let cancelled = false
    if (course.hasCover) {
      window.api
        .getCoverImageUrl(course.path)
        .then((url) => {
          if (!cancelled && url) setCoverImg(url)
        })
        .catch(() => {})
    } else {
      setCoverImg(absoluteAssetUrl(getCoverFallback()))
    }

    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) {
        try {
          dialog.showModal()
        } catch (err) {
          console.error('Failed to open edit dialog:', err)
        }
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [course])

  const handleClose = () => {
    if (dialogRef.current) {
      dialogRef.current.close()
    }
    if (onClose) onClose()
  }

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      handleClose()
    }
  }

  const handleSaveAll = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      const programsArray = (Array.isArray(localProgramsList) ? localProgramsList : [])
        .map((p) => String(p).trim())
        .filter(Boolean)

      const updates = {
        title: localCourseTitle,
        programs: programsArray,
        instructor,
        institution
      }

      const result = await window.api.updateCourse(course.path, updates)
      if (!result.success) {
        throw new Error(result.error || 'Failed to update course')
      }

      toast.success('Curso actualizado')
      if (onCourseUpdated) {
        onCourseUpdated(course.path, result.data)
      }
      handleClose()
    } catch (err) {
      console.error('Error saving course details:', err)
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onClick={handleBackdropClick}>
      <div className="dialog__preview">
        <div className="dialog__preview-cover">
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
              <img src={brandMark} alt="" width={36} height={36} />
            </div>
          )}
        </div>
        <div>
          <h3>Editar propiedades</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--clr-ink-soft)' }}>
            {course.title}
          </p>
        </div>
      </div>

      <div className="dialog__form">
        <div className="field">
          <label htmlFor="course-title">Nombre de curso</label>
          <textarea
            id="course-title"
            value={localCourseTitle}
            onChange={(e) => setLocalCourseTitle(e.target.value)}
          />
        </div>

        <ChipAutocomplete
          id="course-programs"
          label="Programas"
          values={localProgramsList}
          options={programOptions}
          onChange={setLocalProgramsList}
          placeholder="Buscar o añadir programa…"
        />

        <div className="field">
          <label htmlFor="course-instructor">Instructor</label>
          <input
            id="course-instructor"
            type="text"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="course-institution">Academia</label>
          <input
            id="course-institution"
            type="text"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSaveAll}
            disabled={isSaving}
          >
            {isSaving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default CourseEditModal
