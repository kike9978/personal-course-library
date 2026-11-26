import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'
import ChipAutocomplete from './ChipAutocomplete'
import { CourseDescriptionDialog } from './CourseDescription'
import { cn } from '../ui/cn'
import {
  btnGhost,
  btnPrimary,
  fieldControl,
  fieldLabel,
  dialogShell as dialogBase,
  dialogBody
} from '../ui/classes'

const dialogShell = cn(dialogBase, 'max-w-[460px]')
const dialogForm = dialogBody
const textArea = cn(fieldControl, 'min-h-[4.5rem] resize-y')

function StarRate({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-[0.2rem]" role="group" aria-label="Valoración">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={cn(
            'cursor-pointer border-0 bg-transparent px-[0.15rem] py-[0.1rem] text-xl leading-none text-[rgba(23,21,28,0.28)]',
            value >= n && 'text-coral-deep'
          )}
          aria-pressed={value >= n}
          onClick={() => onChange(value === n ? 0 : n)}
          title={`${n} estrella${n === 1 ? '' : 's'}`}
        >
          ★
        </button>
      ))}
      {value > 0 ? (
        <button
          type="button"
          className="ml-[0.35rem] cursor-pointer border-0 bg-transparent text-sm font-semibold text-ink-soft underline"
          onClick={() => onChange(0)}
        >
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
  themeOptions = [],
  mediaOptions = []
}) {
  const dialogRef = useRef(null)
  const [instructor, setInstructor] = useState(course.instructor || '')
  const [institution, setInstitution] = useState(course.institution || '')
  const [localCourseTitle, setLocalCourseTitle] = useState(course.title || '')
  const [localProgramsList, setLocalProgramsList] = useState(
    Array.isArray(course.programs) ? course.programs : []
  )
  const [localThemes, setLocalThemes] = useState(Array.isArray(course.theme) ? course.theme : [])
  const [localMedia, setLocalMedia] = useState(Array.isArray(course.media) ? course.media : [])
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
    setLocalMedia(Array.isArray(course.media) ? course.media : [])
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
        media: (Array.isArray(localMedia) ? localMedia : [])
          .map((item) => String(item).trim())
          .filter(Boolean),
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
      <dialog
        ref={dialogRef}
        className={dialogShell}
        onClose={onClose}
        onClick={handleBackdropClick}
      >
        <div className="flex items-center gap-[0.85rem] px-[1.15rem] pt-4 pb-2">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-cream-deep">
            {course.hasCover ? (
              <img
                className="h-full w-full object-cover"
                src={coverImg}
                alt=""
                onError={(e) => {
                  e.currentTarget.src = brandMark
                }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_30%,rgba(232,69,112,0.08),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(61,122,122,0.08),transparent_45%),var(--color-cream-deep)] text-ink-soft">
                <img
                  className="!h-7 !w-7 max-h-7 max-w-7 object-contain opacity-55"
                  src={brandMark}
                  alt=""
                  width={36}
                  height={36}
                />
              </div>
            )}
          </div>
          <div>
            <h3>Editar propiedades</h3>
            <p className="m-0 text-sm text-ink-soft">
              {course.title}
              {course.missingProps ? ' · Sin courseProps (se creará al guardar)' : ''}
            </p>
          </div>
        </div>

        <div className={dialogForm}>
          <div>
            <label className={fieldLabel} htmlFor="course-title">
              Nombre de curso
            </label>
            <textarea
              className={textArea}
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
            id="course-media"
            label="Medios"
            values={localMedia}
            options={mediaOptions}
            onChange={setLocalMedia}
            placeholder="Grafito, acuarela, tinta…"
            tone="media"
          />

          <ChipAutocomplete
            id="course-themes"
            label="Temas"
            values={localThemes}
            options={themeOptions}
            onChange={setLocalThemes}
            placeholder="Buscar o añadir tema…"
          />

          <div>
            <label className={fieldLabel}>Valoración</label>
            <StarRate value={rate} onChange={setRate} />
          </div>

          <div>
            <label className={fieldLabel} htmlFor="course-instructor">
              Instructor
            </label>
            <input
              className={fieldControl}
              id="course-instructor"
              type="text"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
            />
          </div>

          <div>
            <label className={fieldLabel} htmlFor="course-institution">
              Academia
            </label>
            <input
              className={fieldControl}
              id="course-institution"
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-[0.3rem] flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold tracking-[0.04em] text-ink-soft uppercase">
                Descripción
              </span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-coral-deep hover:underline"
                onClick={() => setWritingDescription(true)}
              >
                {description ? 'Reescribir' : 'Escribir'}
              </button>
            </div>
            <p
              className={cn(
                'm-0 line-clamp-3 text-sm leading-[1.4]',
                !description && 'text-ink-soft'
              )}
            >
              {description
                ? description.summary
                : 'Sin descripción. El encargo usa la ficha, el temario y una búsqueda en tu chat.'}
            </p>
          </div>

          <div>
            <label
              className="flex w-fit cursor-pointer items-center gap-2 text-base font-semibold tracking-normal text-ink normal-case"
              htmlFor="course-hide"
            >
              <input
                className="m-0 h-4 w-4 border-0 p-0 accent-coral-deep shadow-none focus:shadow-none"
                id="course-hide"
                type="checkbox"
                checked={hide}
                onChange={(e) => setHide(e.target.checked)}
              />
              <span>Ocultar</span>
            </label>
            <p className="mt-[0.35rem] mb-0 text-xs leading-[1.4] text-ink-soft">
              No entra en las listas ni en el resto de la app. Para volver a verlo, pon{' '}
              <code>hide</code> en <code>false</code> dentro de courseProps.json.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-[0.35rem]">
            <button type="button" className={btnGhost} onClick={handleClose}>
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimary}
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
