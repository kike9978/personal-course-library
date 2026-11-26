import { useEffect, useRef, useState } from 'react'
import {
  buildCourseDescriptionBrief,
  parseCourseDescription
} from '../../../shared/courseDescription.js'
import { cn } from '../ui/cn'
import {
  btnGhost,
  btnPrimary,
  fieldControl,
  fieldLabel,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead as sharedDialogLead,
  dialogTitle as sharedDialogTitle
} from '../ui/classes'

const dialogShell = cn(dialogBase, 'max-w-[40rem] open:max-h-[min(90vh,48rem)] open:overflow-auto [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55')
const dialogForm = dialogBody
const dialogTitle = sharedDialogTitle
const dialogLead = sharedDialogLead
const briefField = cn(fieldControl, 'min-h-[8rem] resize-y text-xs leading-[1.45]')
const pasteField = cn(fieldControl, 'min-h-[6.5rem] resize-y text-xs leading-[1.45]')

export function CourseDescriptionDialog({ course, description, onClose, onSaved }) {
  const dialogRef = useRef(null)
  const briefRef = useRef(null)
  const [brief, setBrief] = useState('')
  const [briefReady, setBriefReady] = useState(false)
  const [paste, setPaste] = useState('')
  const [error, setError] = useState('')
  const [copyNote, setCopyNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) dialog.showModal()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let cancelled = false
    setBriefReady(false)
    setBrief('')
    window.api
      .scanCourse(course.path)
      .then((tree) => {
        if (cancelled) return
        setBrief(buildCourseDescriptionBrief(course, tree, description))
        setBriefReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setBrief(
          buildCourseDescriptionBrief(course, null, description, { outlineUnreadable: true })
        )
        setBriefReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [course, description])

  const handleClose = () => {
    dialogRef.current?.close()
    onClose()
  }

  const handleCopy = async () => {
    if (!briefReady || !brief) return
    setCopyNote('')
    try {
      await navigator.clipboard.writeText(brief)
      setCopied(true)
    } catch {
      briefRef.current?.focus()
      briefRef.current?.select()
      setCopyNote('No se pudo copiar solo. El encargo sigue en el cuadro para que lo selecciones.')
    }
  }

  const handleSave = async () => {
    if (saving) return
    const parsed = parseCourseDescription(paste, course.title)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await window.api.saveCourseDescription(course.path, parsed.raw)
      if (alive.current) {
        onSaved?.(saved?.description || parsed.description)
        handleClose()
      }
    } catch (err) {
      if (alive.current) setError(err?.message || 'No se guardó nada.')
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={dialogShell}
      aria-labelledby="course-description-title"
      onCancel={(event) => {
        event.preventDefault()
        handleClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) handleClose()
      }}
    >
      <form
        className={dialogForm}
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <h3 id="course-description-title" className={dialogTitle}>
          Descripción
        </h3>
        <p className={dialogLead}>
          Copia el encargo, pégalo en tu chat y trae el JSON. El chat busca la página del curso.
          Esta app no llama a un modelo.
        </p>

        <div>
          <label className={fieldLabel} htmlFor="course-description-brief">
            Encargo
          </label>
          <textarea
            id="course-description-brief"
            ref={briefRef}
            className={briefField}
            readOnly
            spellCheck={false}
            value={briefReady ? brief : 'Leyendo el temario…'}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-[0.35rem]">
          <span className="text-xs text-ink-soft">{copyNote}</span>
          <button type="button" className={btnGhost} onClick={handleCopy} disabled={!briefReady}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="course-description-paste">
            Respuesta
          </label>
          <textarea
            id="course-description-paste"
            className={pasteField}
            spellCheck={false}
            value={paste}
            placeholder="Pega aquí el JSON del chat"
            onChange={(event) => {
              setPaste(event.target.value)
              if (error) setError('')
            }}
          />
        </div>
        {error ? (
          <p className="m-0 text-sm leading-[1.4] text-coral-deep" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-[0.35rem]">
          <button type="button" className={btnGhost} onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function CourseDescription({ course }) {
  const [expanded, setExpanded] = useState(false)
  const description = course.description?.summary ? course.description : null
  const panelId = 'detail-description-panel'

  useEffect(() => {
    setExpanded(false)
  }, [course.path])

  const outcomes = description?.outcomes || []
  const sourceUrl = description?.source?.url || ''

  return (
    <section className="flex flex-col gap-[0.35rem]" aria-label="Descripción">
      <h3 className="m-0">
        <button
          type="button"
          className="group flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent p-0 text-left font-display text-md font-semibold text-ink hover:text-coral-deep focus-visible:rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-focus"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((open) => !open)}
        >
          Descripción
          <svg
            className="h-[0.7rem] w-[0.7rem] shrink-0 text-current transition-transform duration-150 ease-pop group-aria-expanded:rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </h3>

      <div
        id={panelId}
        className={cn('flex-col gap-[0.35rem]', expanded ? 'flex' : 'hidden')}
        hidden={!expanded}
      >
        {!description ? (
          <p className="m-0 text-sm leading-[1.4] text-ink-soft">
            Sin descripción. Se escribe desde Editar detalles.
          </p>
        ) : (
          <>
            <p className="m-0 text-sm leading-[1.45]">{description.summary}</p>
            {description.audience ? (
              <p className="m-0 text-xs leading-[1.4] text-ink-soft">
                {description.audience}
              </p>
            ) : null}
            {outcomes.length ? (
              <ul className="m-0 flex list-disc flex-col gap-[0.15rem] pl-[1.1rem] text-sm leading-[1.35]">
                {outcomes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {sourceUrl ? (
              <p className="m-0 text-xs [&_a]:font-semibold [&_a]:text-teal">
                <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
                  {description.source.title || 'Fuente'}
                </a>
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

export default CourseDescription
