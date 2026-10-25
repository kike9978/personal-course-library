import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  buildCourseDescriptionBatchBrief,
  coursesForDescriptionBatch,
  parseCourseDescriptionBatch
} from '../../../shared/courseDescription.js'

function cleanIpcError(err) {
  return String(err?.message || 'No se pudo guardar.')
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .trim()
}

async function saveParsedDescriptions(parsed) {
  if (typeof window.api.saveCourseDescriptionBatch === 'function') {
    const result = await window.api.saveCourseDescriptionBatch(
      parsed.items.map((item) => ({ coursePath: item.path, payload: item.raw }))
    )
    return {
      savedCount: result?.savedCount || 0,
      savedPaths: result?.savedPaths || [],
      skips: Array.isArray(result?.skips) ? result.skips : []
    }
  }
  if (typeof window.api.updateCourse !== 'function') {
    throw new Error('Reinicia la app para guardar descripciones.')
  }
  const savedPaths = []
  const skips = []
  for (const item of parsed.items) {
    try {
      await window.api.updateCourse(item.path, {
        description: { ...item.description, updatedAt: new Date().toISOString() }
      })
      savedPaths.push(item.path)
    } catch (err) {
      skips.push({
        path: item.path,
        title: item.title,
        reason: err?.message || 'No se pudo escribir courseProps.json.'
      })
    }
  }
  return { savedCount: savedPaths.length, savedPaths, skips }
}

function CourseDescriptionBatch({ courses, onClose }) {
  const dialogRef = useRef(null)
  const briefRef = useRef(null)
  const alive = useRef(true)
  const waiting = useMemo(() => coursesForDescriptionBatch(courses), [courses])
  const waitingKey = waiting.map((course) => course.path).join('\n')
  const seenWaiting = useRef(waitingKey)
  const reviewRef = useRef(null)
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
  const [skipByPath, setSkipByPath] = useState(() => new Map())
  const [strays, setStrays] = useState([])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? waiting.filter((course) => {
          const hay =
            `${course.title || ''} ${course.path || ''} ${course.institution || ''}`.toLowerCase()
          return hay.includes(needle)
        })
      : waiting
    if (!skipByPath.size) return pool
    return pool.filter((course) => skipByPath.has(course.path) || picked.has(course.path))
  }, [waiting, query, skipByPath, picked])

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
    if (reviewRef.current) {
      const keep = new Set(reviewRef.current.map((skip) => skip.path))
      setPicked(
        new Set(waiting.filter((course) => keep.has(course.path)).map((course) => course.path))
      )
      return
    }
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

  const canCopy = Boolean(brief) && !generating

  const handleCopy = async () => {
    if (!canCopy) return
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

  const showSkips = (courseSkips, strayRows) => {
    const byPath = new Map()
    for (const skip of courseSkips) {
      if (!skip?.path || byPath.has(skip.path)) continue
      byPath.set(skip.path, skip.reason || 'No se guardó.')
    }
    reviewRef.current = courseSkips.filter((skip) => skip?.path)
    setSkipByPath(byPath)
    setStrays(strayRows)
    setQuery('')
    setPaste('')
    setBrief('')
    setPicked(new Set(reviewRef.current.map((skip) => skip.path)))
  }

  const handleSave = async () => {
    if (saving) return
    const parsed = parseCourseDescriptionBatch(paste, selected)
    const strayRows = (parsed.skips || []).filter((skip) => !skip.path)
    const courseSkips = (parsed.skips || []).filter((skip) => skip.path)
    if (!parsed.ok) {
      showSkips(courseSkips, strayRows)
      setError(courseSkips.length || strayRows.length ? '' : parsed.error || 'No se guardó nada.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await saveParsedDescriptions(parsed)
      if (!alive.current) return
      const saved = new Set(result.savedPaths || [])
      const reasons = new Map(courseSkips.map((skip) => [skip.path, skip]))
      for (const skip of result.skips || []) {
        if (skip?.path && !saved.has(skip.path)) reasons.set(skip.path, skip)
      }
      for (const course of selected) {
        if (saved.has(course.path) || reasons.has(course.path)) continue
        reasons.set(course.path, {
          path: course.path,
          title: course.title || course.path,
          reason: 'No vino en la respuesta.'
        })
      }
      const left = [...reasons.values()].filter((skip) => !saved.has(skip.path))
      const savedCount = result.savedCount || 0
      if (!left.length && !strayRows.length) {
        if (savedCount === 1) toast.success('Se guardó 1 descripción.')
        else toast.success(`Se guardaron ${savedCount} descripciones.`)
        handleClose()
        return
      }
      showSkips(left, strayRows)
      if (savedCount === 0) toast.error('No se guardó ninguna. El motivo está en cada curso.')
      else {
        toast.success(
          `Se guardaron ${savedCount}. ${left.length} quedaron fuera, con el motivo al lado.`
        )
      }
    } catch (err) {
      if (!alive.current) return
      const known = new Set(courseSkips.map((skip) => skip.path))
      const failedSave = (parsed.items || [])
        .filter((item) => !known.has(item.path))
        .map((item) => ({
          path: item.path,
          title: item.title,
          reason: 'No se pudo guardar esta descripción.'
        }))
      showSkips([...courseSkips, ...failedSave], strayRows)
      const shown = courseSkips.length + failedSave.length + strayRows.length
      setError(shown ? '' : cleanIpcError(err))
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
          {skipByPath.size
            ? 'Estos cursos no se guardaron. El motivo está debajo del nombre. Genera otro encargo para ellos.'
            : 'Marca los cursos que entran en este encargo. El guardado usa solo esos.'}
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
              onClick={() => {
                reviewRef.current = null
                setPicked(new Set(waiting.map((course) => course.path)))
              }}
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

        {strays.length ? (
          <ul className="course-description__strays">
            {strays.map((skip) => (
              <li key={`${skip.title}-${skip.reason}`}>
                <strong>{skip.title || 'Sin nombre'}</strong>
                {': '}
                {skip.reason}
              </li>
            ))}
          </ul>
        ) : null}
        <div
          className="import-props__list course-description__pick"
          aria-label="Cursos del encargo"
        >
          {filtered.length === 0 ? (
            <p className="import-props__empty">No hay cursos que coincidan.</p>
          ) : (
            filtered.map((course) => {
              const checked = picked.has(course.path)
              const reason = skipByPath.get(course.path)
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
                    {reason ? (
                      <span className="course-description__error">{reason}</span>
                    ) : course.institution ? (
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
                : brief || (selected.length ? 'Pulsa Generar encargo.' : 'Marca al menos un curso.')
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
              disabled={!canCopy}
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
