import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  buildCourseDescriptionBatchBrief,
  coursesForDescriptionBatch,
  parseCourseDescriptionBatch
} from '../../../shared/courseDescription.js'

async function saveParsedDescriptions(parsed) {
  if (typeof window.api.saveCourseDescriptionBatch === 'function') {
    const result = await window.api.saveCourseDescriptionBatch(
      parsed.items.map((item) => ({ coursePath: item.path, payload: item.raw }))
    )
    return result?.savedCount || 0
  }
  if (typeof window.api.updateCourse !== 'function') {
    throw new Error('Reinicia la app para guardar descripciones.')
  }
  for (const item of parsed.items) {
    await window.api.updateCourse(item.path, {
      description: { ...item.description, updatedAt: new Date().toISOString() }
    })
  }
  return parsed.items.length
}

function CourseDescriptionBatch({ courses, onClose }) {
  const dialogRef = useRef(null)
  const briefRef = useRef(null)
  const alive = useRef(true)
  const waiting = useMemo(() => coursesForDescriptionBatch(courses), [courses])
  const waitingKey = waiting.map((course) => course.path).join('\n')
  const seenWaiting = useRef(waitingKey)
  const [picked, setPicked] = useState(
    () => new Set(coursesForDescriptionBatch(courses).map((course) => course.path))
  )
  const [query, setQuery] = useState('')
  const selected = useMemo(
    () => waiting.filter((course) => picked.has(course.path)),
    [waiting, picked]
  )
  const omittedCount = Math.max(0, waiting.length - selected.length)
  const pathKey = selected.map((course) => course.path).join('\n')
  const generateToken = useRef(0)
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [paste, setPaste] = useState('')
  const [error, setError] = useState('')
  const [copyNote, setCopyNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return waiting
    return waiting.filter((course) => {
      const hay =
        `${course.title || ''} ${course.path || ''} ${course.institution || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [waiting, query])

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
    if (seenWaiting.current === waitingKey) return
    seenWaiting.current = waitingKey
    setPicked(new Set(waiting.map((course) => course.path)))
  }, [waitingKey, waiting])

  useEffect(() => {
    generateToken.current += 1
    setGenerating(false)
    setBrief('')
    setCopied(false)
  }, [pathKey])

  const handleGenerate = async () => {
    if (!selected.length || generating) return
    const token = ++generateToken.current
    const list = selected
    const omitted = omittedCount
    setGenerating(true)
    setBrief('')
    setCopied(false)
    setCopyNote('')
    try {
      const entries = await Promise.all(
        list.map(async (course) => {
          try {
            const outline = await window.api.scanCourse(course.path)
            return { course, outline, outlineUnreadable: false }
          } catch {
            return { course, outline: null, outlineUnreadable: true }
          }
        })
      )
      if (!alive.current || token !== generateToken.current) return
      setBrief(buildCourseDescriptionBatchBrief(entries, { omittedCount: omitted }))
    } catch (err) {
      if (alive.current && token === generateToken.current) {
        setError(err?.message || 'No se pudo generar el encargo.')
      }
    } finally {
      if (alive.current && token === generateToken.current) setGenerating(false)
    }
  }

  const toggleCourse = (path) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleClose = () => {
    dialogRef.current?.close()
    onClose()
  }

  const handleCopy = async () => {
    if (generating || !brief) return
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
    const parsed = parseCourseDescriptionBatch(paste, selected)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    try {
      const savedCount = await saveParsedDescriptions(parsed)
      const dropped = parsed.dropped + Math.max(0, parsed.items.length - savedCount)
      if (savedCount === 1 && dropped === 0) toast.success('Se guardó 1 descripción.')
      else if (dropped === 0) toast.success(`Se guardaron ${savedCount} descripciones.`)
      else toast.success(`Se guardaron ${savedCount}. ${dropped} no se usaron.`)
      if (alive.current) handleClose()
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
      aria-labelledby="course-description-batch-title"
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
        <h3 id="course-description-batch-title">Descripciones</h3>
        <p className="dialog__lead">
          Marca los cursos que entran en este encargo. El guardado usa solo esos.
        </p>

        <div className="import-props__toolbar">
          <input
            type="search"
            className="import-props__search"
            placeholder="Filtrar cursos…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            aria-label="Filtrar cursos"
          />
          <div className="import-props__bulk">
            <span className="import-props__count">
              {selected.length} de {waiting.length} marcados
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => setPicked(new Set(waiting.map((course) => course.path)))}
              disabled={picked.size === waiting.length}
            >
              Todos
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => setPicked(new Set())}
              disabled={picked.size === 0}
            >
              Ninguno
            </button>
          </div>
        </div>

        <div
          className="import-props__list course-description__pick"
          aria-label="Cursos del encargo"
        >
          {filtered.length === 0 ? (
            <p className="import-props__empty">No hay cursos que coincidan.</p>
          ) : (
            filtered.map((course) => {
              const checked = picked.has(course.path)
              return (
                <label
                  key={course.path}
                  className={`import-props__row${checked ? ' is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCourse(course.path)}
                  />
                  <span className="import-props__meta">
                    <span className="import-props__title">{course.title || course.path}</span>
                    <span className="import-props__folder">{course.path}</span>
                    {course.institution ? (
                      <span className="import-props__hint">{course.institution}</span>
                    ) : null}
                  </span>
                </label>
              )
            })
          )}
        </div>
        <div className="field">
          <label htmlFor="course-description-batch-brief">Encargo</label>
          <textarea
            id="course-description-batch-brief"
            ref={briefRef}
            className="course-description__brief"
            readOnly
            spellCheck={false}
            value={
              generating
                ? 'Leyendo los temarios…'
                : brief ||
                  (selected.length ? 'Pulsa Generar encargo.' : 'Marca al menos un curso.')
            }
          />
        </div>
        <div className="dialog__actions dialog__actions--spread">
          <span className="course-description__note">{copyNote}</span>
          <div className="dialog__actions-btns">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleGenerate}
              disabled={!selected.length || generating}
            >
              {generating ? 'Generando…' : 'Generar encargo'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleCopy}
              disabled={generating || !brief}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="course-description-batch-paste">Respuesta</label>
          <textarea
            id="course-description-batch-paste"
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
          <button type="submit" className="btn btn--primary" disabled={saving || !selected.length}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default CourseDescriptionBatch
