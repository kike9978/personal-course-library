import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ClipboardCheck } from 'lucide-react'
import {
  buildCourseDescriptionBatchBrief,
  coursesForDescriptionBatch,
  parseCourseDescriptionBatch
} from '../../../shared/courseDescription.js'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  btnPrimary,
  fieldControl,
  fieldLabel,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead as sharedDialogLead,
  dialogTitle as sharedDialogTitle
} from '../ui/classes'
import { useBriefRoundtrip } from '../utils/briefRoundtrip'
import { cleanIpcError, outlineEntries, saveParsedDescriptions } from '../utils/saveDescriptions'

const dialogShell = cn(
  dialogBase,
  'max-w-[42rem] open:max-h-[min(92vh,52rem)] open:overflow-auto [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55'
)
const dialogForm = dialogBody
const dialogTitle = sharedDialogTitle
const dialogLead = sharedDialogLead
const searchInput =
  'w-full rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-ink outline-none focus:shadow-focus motion-reduce:animate-none'
const rowBase =
  'flex cursor-pointer items-start gap-[0.65rem] rounded-md px-[0.65rem] py-[0.55rem] hover:bg-coral/8'
const briefField = cn(fieldControl, 'min-h-[8rem] resize-y text-xs leading-[1.45]')
const pasteField = cn(fieldControl, 'min-h-[4.5rem] resize-y text-xs leading-[1.45]')
const stepTitle = 'm-0 font-display text-sm font-semibold text-ink'
const MISSING_REASON = 'No vino en la respuesta.'

function CourseDescriptionBatch({ courses, onClose }) {
  const dialogRef = useRef(null)
  const alive = useRef(true)
  const waiting = useMemo(() => coursesForDescriptionBatch(courses), [courses])
  const waitingKey = waiting.map((course) => course.path).join('\n')
  const seenWaiting = useRef(waitingKey)
  const reviewRef = useRef(null)
  const [picked, setPicked] = useState(() => new Set(waiting.map((course) => course.path)))
  const [query, setQuery] = useState('')
  const selected = useMemo(
    () => waiting.filter((course) => picked.has(course.path)),
    [waiting, picked]
  )
  const omittedCount = Math.max(0, waiting.length - selected.length)
  const pathKey = selected.map((course) => course.path).join('\n')
  const generateToken = useRef(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [skipByPath, setSkipByPath] = useState(() => new Map())
  const [strays, setStrays] = useState([])
  const [edits, setEdits] = useState(() => new Map())
  const [excluded, setExcluded] = useState(() => new Set())

  const roundtrip = useBriefRoundtrip({
    kind: 'descriptions',
    accepts: (text) => parseCourseDescriptionBatch(text, waiting).ok
  })
  const { brief, setBrief, copy, copied, copyNote, paste, setPaste, detected, done } = roundtrip

  // Parse against every course still waiting, so a reply copied earlier still lands
  // even if the marks changed since.
  const parsed = useMemo(
    () => (paste.trim() ? parseCourseDescriptionBatch(paste, waiting) : null),
    [paste, waiting]
  )
  const reviewItems = parsed?.ok ? parsed.items : []
  const keptItems = reviewItems.filter((item) => !excluded.has(item.path))
  const selectedPaths = useMemo(() => new Set(selected.map((course) => course.path)), [selected])
  const missingFromReply = parsed?.ok
    ? (parsed.skips || []).filter(
        (skip) => skip.path && skip.reason === MISSING_REASON && selectedPaths.has(skip.path)
      )
    : []
  const rowProblems = parsed?.ok
    ? (parsed.skips || []).filter((skip) => skip.reason !== MISSING_REASON)
    : []

  useEffect(() => {
    setEdits(new Map())
    setExcluded(new Set())
  }, [paste])

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
  }, [pathKey, setBrief])

  const handleCopyBrief = async () => {
    if (!selected.length || generating) return
    if (brief) {
      await copy(brief)
      return
    }
    const token = ++generateToken.current
    const list = selected
    setGenerating(true)
    setError('')
    try {
      const entries = await outlineEntries(list)
      if (!alive.current || token !== generateToken.current) return
      const text = buildCourseDescriptionBatchBrief(entries, { omittedCount })
      await copy(text)
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

  const toggleExcluded = (path) => {
    setExcluded((prev) => {
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
    if (!parsed) {
      setError('Pega la respuesta del chat.')
      return
    }
    if (!parsed.ok) {
      setError(parsed.error || 'No se guardó nada.')
      return
    }
    if (!keptItems.length) {
      setError('Marca al menos una descripción.')
      return
    }
    const items = keptItems.map((item) => {
      const summary = edits.get(item.path)
      if (summary == null) return item
      return {
        ...item,
        description: { ...item.description, summary },
        raw: { ...item.raw, summary }
      }
    })
    const strayRows = rowProblems.filter((skip) => !skip.path)
    setSaving(true)
    setError('')
    try {
      const result = await saveParsedDescriptions(items)
      if (!alive.current) return
      const saved = new Set(result.savedPaths || [])
      const reasons = new Map()
      for (const skip of [...rowProblems, ...missingFromReply, ...(result.skips || [])]) {
        if (skip?.path && !saved.has(skip.path)) reasons.set(skip.path, skip)
      }
      const left = [...reasons.values()]
      const savedCount = result.savedCount || 0
      if (savedCount) done()
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
      if (alive.current) setError(cleanIpcError(err))
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  const copyLabel = generating ? 'Preparando…' : copied ? 'Copiado' : 'Copiar encargo'
  const parseError = parsed && !parsed.ok ? parsed.error : ''

  return (
    <dialog
      ref={dialogRef}
      className={dialogShell}
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
        className={dialogForm}
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <h3 id="course-description-batch-title" className={dialogTitle}>
          Descripciones
        </h3>
        <p className={dialogLead}>
          {reviewItems.length
            ? 'Revisa cada descripción. Puedes corregir el texto o desmarcar las que no quieras guardar.'
            : skipByPath.size
              ? 'Estos cursos no se guardaron. El motivo está debajo del nombre. Copia otro encargo para ellos.'
              : 'Copia el encargo, pégalo en tu chat y copia su respuesta. Al volver aquí, la respuesta se detecta sola.'}
        </p>

        {!reviewItems.length ? (
          <>
            <div className="flex flex-col gap-[0.55rem]">
              <input
                type="search"
                data-search-field=""
                className={searchInput}
                placeholder="Filtrar cursos…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault()
                }}
                aria-label="Filtrar cursos"
              />
              <div className="flex flex-wrap items-center gap-[0.35rem]">
                <span className="text-sm font-semibold text-ink-soft">
                  {selected.length} de {waiting.length} marcados
                </span>
                <button
                  type="button"
                  className={cn(btnGhost, btnCompact)}
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
                  className={cn(btnGhost, btnCompact)}
                  onClick={() => setPicked(new Set())}
                  disabled={picked.size === 0}
                >
                  Ninguno
                </button>
              </div>
            </div>

            {strays.length ? (
              <ul className="m-0 flex list-disc flex-col gap-[0.2rem] pl-[1.1rem] text-xs leading-[1.35] text-coral-deep">
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
              className="flex max-h-[min(32vh,280px)] flex-col gap-[0.35rem] overflow-auto rounded-md border border-ink/10 bg-surface p-[0.15rem]"
              aria-label="Cursos del encargo"
            >
              {filtered.length === 0 ? (
                <p className="m-0 p-4 text-center text-base text-ink-soft">
                  No hay cursos que coincidan.
                </p>
              ) : (
                filtered.map((course) => {
                  const checked = picked.has(course.path)
                  const reason = skipByPath.get(course.path)
                  return (
                    <label key={course.path} className={cn(rowBase, checked && 'bg-coral/12')}>
                      <input
                        className="mt-[0.2rem] shrink-0 accent-coral"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCourse(course.path)}
                      />
                      <span className="flex min-w-0 flex-col gap-[0.15rem]">
                        <span className="font-display leading-[1.25] font-semibold text-ink">
                          {course.title || course.path}
                        </span>
                        {reason ? (
                          <span className="text-sm leading-[1.4] text-coral-deep">{reason}</span>
                        ) : course.institution ? (
                          <span className="text-xs text-ink-soft">{course.institution}</span>
                        ) : null}
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            <div className="flex flex-col gap-[0.45rem]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={stepTitle}>1 · Encargo para el chat</p>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={handleCopyBrief}
                  disabled={!selected.length || generating}
                >
                  {copyLabel}
                </button>
              </div>
              {copyNote ? <p className="m-0 text-xs text-coral-deep">{copyNote}</p> : null}
              {brief ? (
                <details className="text-sm text-ink-soft" open={Boolean(copyNote)}>
                  <summary className="cursor-pointer select-none">Ver encargo</summary>
                  <textarea
                    className={cn(briefField, 'mt-2')}
                    readOnly
                    spellCheck={false}
                    value={brief}
                    aria-label="Encargo"
                    onFocus={(event) => event.target.select()}
                  />
                </details>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="flex flex-col gap-[0.45rem]">
          <p className={stepTitle}>
            {reviewItems.length ? 'Revisa antes de guardar' : '2 · Respuesta'}
          </p>
          {detected && reviewItems.length ? (
            <p className="m-0 inline-flex items-center gap-1.5 text-sm font-semibold text-teal">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Respuesta detectada en el portapapeles
            </p>
          ) : null}
          {reviewItems.length ? (
            <div
              className="flex max-h-[min(50vh,420px)] flex-col gap-[0.5rem] overflow-auto rounded-md border border-ink/10 bg-surface p-[0.35rem]"
              aria-label="Descripciones de la respuesta"
            >
              {reviewItems.map((item) => {
                const kept = !excluded.has(item.path)
                const summary = edits.get(item.path) ?? item.description.summary
                return (
                  <div
                    key={item.path}
                    className={cn(
                      'flex items-start gap-[0.65rem] rounded-md px-[0.55rem] py-[0.5rem]',
                      kept ? 'bg-teal/6' : 'opacity-55'
                    )}
                  >
                    <input
                      className="mt-[0.25rem] shrink-0 accent-coral"
                      type="checkbox"
                      checked={kept}
                      onChange={() => toggleExcluded(item.path)}
                      aria-label={`Guardar ${item.title}`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-[0.3rem]">
                      <span className="font-display leading-[1.25] font-semibold text-ink">
                        {item.title}
                      </span>
                      <textarea
                        className={cn(
                          fieldControl,
                          'min-h-[4.2rem] resize-y text-sm leading-[1.45]'
                        )}
                        value={summary}
                        disabled={!kept}
                        aria-label={`Descripción de ${item.title}`}
                        onChange={(event) =>
                          setEdits((prev) => new Map(prev).set(item.path, event.target.value))
                        }
                      />
                      <span className="text-xs text-ink-soft">
                        {item.description.outcomes?.length || 0} resultados
                        {item.description.audience ? ` · ${item.description.audience}` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
          {missingFromReply.length ? (
            <p className="m-0 text-xs text-ink-soft">
              {missingFromReply.length === 1
                ? '1 curso marcado no vino en la respuesta.'
                : `${missingFromReply.length} cursos marcados no vinieron en la respuesta.`}
            </p>
          ) : null}
          {rowProblems.length ? (
            <ul className="m-0 flex list-disc flex-col gap-[0.2rem] pl-[1.1rem] text-xs leading-[1.35] text-coral-deep">
              {rowProblems.map((skip) => (
                <li key={`${skip.path || skip.title}-${skip.reason}`}>
                  <strong>{skip.title || 'Sin nombre'}</strong>
                  {': '}
                  {skip.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {reviewItems.length ? (
            <button
              type="button"
              className={cn(btnGhost, btnCompact, 'self-start')}
              onClick={() => setPaste('')}
              disabled={saving}
            >
              Descartar respuesta
            </button>
          ) : (
            <>
              <label className={cn(fieldLabel, 'sr-only')} htmlFor="course-description-batch-paste">
                Respuesta
              </label>
              <textarea
                id="course-description-batch-paste"
                className={pasteField}
                spellCheck={false}
                value={paste}
                placeholder="Se rellena sola al volver del chat. También puedes pegar aquí el JSON."
                onChange={(event) => {
                  setPaste(event.target.value)
                  if (error) setError('')
                }}
              />
              {parseError ? <p className="m-0 text-xs text-coral-deep">{parseError}</p> : null}
            </>
          )}
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
          <button type="submit" className={btnPrimary} disabled={saving || !keptItems.length}>
            {saving ? 'Guardando…' : keptItems.length ? `Guardar ${keptItems.length}` : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default CourseDescriptionBatch
