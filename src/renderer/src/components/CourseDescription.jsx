import { useEffect, useRef, useState } from 'react'
import {
  buildCourseDescriptionBrief,
  parseCourseDescription
} from '../../../shared/courseDescription.js'

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
      className="dialog dialog--description"
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
        className="dialog__form"
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <h3 id="course-description-title">Descripción</h3>
        <p className="dialog__lead">
          Copia el encargo, pégalo en tu chat y trae el JSON. El chat busca la página del curso.
          Esta app no llama a un modelo.
        </p>

        <div className="field">
          <label htmlFor="course-description-brief">Encargo</label>
          <textarea
            id="course-description-brief"
            ref={briefRef}
            className="course-description__brief"
            readOnly
            spellCheck={false}
            value={briefReady ? brief : 'Leyendo el temario…'}
          />
        </div>
        <div className="dialog__actions dialog__actions--spread">
          <span className="course-description__note">{copyNote}</span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleCopy}
            disabled={!briefReady}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        <div className="field">
          <label htmlFor="course-description-paste">Respuesta</label>
          <textarea
            id="course-description-paste"
            className="course-description__paste"
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
          <p className="course-description__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
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
    <section className="detail-description" aria-label="Descripción">
      <h3 className="detail-description__head">
        <button
          type="button"
          className="detail-description__toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((open) => !open)}
        >
          Descripción
          <svg
            className="detail-description__chevron"
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

      <div id={panelId} className="detail-description__body" hidden={!expanded}>
        {!description ? (
          <p className="detail-description__empty">
            Sin descripción. Se escribe desde Editar detalles.
          </p>
        ) : (
          <>
            <p className="detail-description__summary">{description.summary}</p>
            {description.audience ? (
              <p className="detail-description__audience">{description.audience}</p>
            ) : null}
            {outcomes.length ? (
              <ul className="detail-description__outcomes">
                {outcomes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {sourceUrl ? (
              <p className="detail-description__source">
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
