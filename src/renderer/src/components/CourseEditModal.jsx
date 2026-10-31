import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'
import ChipAutocomplete from './ChipAutocomplete'
import { CourseDescriptionDialog } from './CourseDescription'

function StarRate({ value, onChange }) {
  return (
    <div className="star-rate" role="group" aria-label="Valoración">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-rate__btn${value >= n ? ' is-on' : ''}`}
          aria-pressed={value >= n}
          onClick={() => onChange(value === n ? 0 : n)}
          title={`${n} estrella${n === 1 ? '' : 's'}`}
        >
          ★
        </button>
      ))}
      {value > 0 ? (
        <button type="button" className="star-rate__clear" onClick={() => onChange(0)}>
          Quitar
        </button>
      ) : null}
    </div>
  )
}

function CourseEditModal({
  course,
  onCourseUpdated,
  onClose,
  programOptions = [],
  themeOptions = []
}) {
  const dialogRef = useRef(null)
  const [instructor, setInstructor] = useState(course.instructor || '')
  const [institution, setInstitution] = useState(course.institution || '')
  const [localCourseTitle, setLocalCourseTitle] = useState(course.title || '')
  const [localProgramsList, setLocalProgramsList] = useState(
    Array.isArray(course.programs) ? course.programs : []
  )
  const [localThemes, setLocalThemes] = useState(Array.isArray(course.theme) ? course.theme : [])
  const [rate, setRate] = useState(Number(course.rate) || 0)
  const [hide, setHide] = useState(course.hide === true)
  const [isSaving, setIsSaving] = useState(false)
  const [coverImg, setCoverImg] = useState(absoluteAssetUrl(getCoverFallback()))
  const [writingDescription, setWritingDescription] = useState(false)
  const [localDescription, setLocalDescription] = useState(null)

  useEffect(() => {
    setLocalCourseTitle(course.title || '')
    setLocalProgramsList(Array.isArray(course.programs) ? course.programs : [])
    setLocalThemes(Array.isArray(course.theme) ? course.theme : [])
    setInstructor(course.instructor || '')
    setInstitution(course.institution || '')
    setRate(Number(course.rate) || 0)
    setHide(course.hide === true)
    setWritingDescription(false)
    setLocalDescription(null)

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
      if (course.missingProps) {
        await window.api.generateCourseProps(course.path)
      }

      const programsArray = (Array.isArray(localProgramsList) ? localProgramsList : [])
        .map((p) => String(p).trim())
        .filter(Boolean)
      const themesArray = (Array.isArray(localThemes) ? localThemes : [])
        .map((t) => String(t).trim())
        .filter(Boolean)

      const updates = {
        title: localCourseTitle,
        programs: programsArray,
        theme: themesArray,
        rate,
        instructor,
        institution,
        hide
      }

      const result = await window.api.updateCourse(course.path, updates)
      if (!result.success) {
        throw new Error(result.error || 'Failed to update course')
      }

      toast.success(hide ? 'Curso oculto' : 'Curso actualizado')
      if (onCourseUpdated) {
        onCourseUpdated(course.path, {
          ...result.data,
          theme: themesArray,
          rate,
          missingProps: false,
          hasProps: true
        })
      }
      handleClose()
    } catch (err) {
      console.error('Error saving course details:', err)
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setIsSaving(false)
    }
  }

  const description = localDescription || (course.description?.summary ? course.description : null)

  return (
    <>
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
              {course.missingProps ? ' · Sin courseProps (se creará al guardar)' : ''}
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

          <ChipAutocomplete
            id="course-themes"
            label="Temas"
            values={localThemes}
            options={themeOptions}
            onChange={setLocalThemes}
            placeholder="Buscar o añadir tema…"
          />

          <div className="field">
            <label>Valoración</label>
            <StarRate value={rate} onChange={setRate} />
          </div>

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

          <div className="field">
            <div className="course-edit__description">
              <span>Descripción</span>
              <button
                type="button"
                className="course-edit__write"
                onClick={() => setWritingDescription(true)}
              >
                {description ? 'Reescribir' : 'Escribir'}
              </button>
            </div>
            <p className={`course-edit__description-preview${description ? '' : ' is-empty'}`}>
              {description
                ? description.summary
                : 'Sin descripción. El encargo usa la ficha, el temario y una búsqueda en tu chat.'}
            </p>
          </div>

          <div className="field">
            <label className="course-edit__hide" htmlFor="course-hide">
              <input
                id="course-hide"
                type="checkbox"
                checked={hide}
                onChange={(e) => setHide(e.target.checked)}
              />
              <span>Ocultar</span>
            </label>
            <p className="course-edit__hide-note">
              No entra en las listas ni en el resto de la app. Para volver a verlo, pon{' '}
              <code>hide</code> en <code>false</code> dentro de courseProps.json.
            </p>
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
      {writingDescription ? (
        <CourseDescriptionDialog
          course={course}
          description={description}
          onClose={() => setWritingDescription(false)}
          onSaved={(saved) => {
            if (saved?.summary) setLocalDescription(saved)
          }}
        />
      ) : null}
    </>
  )
}

export default CourseEditModal
