import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ClipboardCheck } from 'lucide-react'
import {
  buildProgramsBrief,
  coursesForProgramBatch,
  defaultPicks,
  mergePrograms,
  parseProgramsReply,
  pickKey,
  programVocabulary
} from '../../../shared/coursePrograms.js'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  btnPrimary,
  fieldControl,
  fieldLabel,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead,
  dialogTitle
} from '../ui/classes'
import { useBriefRoundtrip } from '../utils/briefRoundtrip'
import { cleanIpcError, outlineEntries } from '../utils/saveDescriptions'

const dialogShell = cn(
  dialogBase,
  'max-w-[42rem] open:max-h-[min(92vh,52rem)] open:overflow-auto [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55'
)
const searchInput =
  'w-full rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-ink outline-none focus:shadow-focus motion-reduce:animate-none'
const rowBase =
  'flex cursor-pointer items-start gap-[0.65rem] rounded-md px-[0.65rem] py-[0.55rem] hover:bg-coral/8'
const briefField = cn(fieldControl, 'min-h-[8rem] resize-y text-xs leading-[1.45]')
const pasteField = cn(fieldControl, 'min-h-[4.5rem] resize-y text-xs leading-[1.45]')
const stepTitle = 'm-0 font-display text-sm font-semibold text-ink'
const chipBase =
  'inline-flex items-center gap-1 rounded-full border px-[0.55rem] py-[0.2rem] text-xs font-semibold'
const chipCurrent = 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
const CONFIDENCE_LABEL = { high: 'segura', medium: 'probable', low: 'suposición' }
const MISSING_REASON = 'No vino en la respuesta.'

/**
 * Guess the programs a course teaches from what the library already knows about it.
 * Same round trip as descriptions: copy an encargo, paste the chat reply, review, save.
 * Saving only adds programs. Nothing already tagged is removed.
 */
function CourseProgramsBatch({ courses, initialPaths = null, onClose }) {
  const dialogRef = useRef(null)
  const alive = useRef(true)
  const pool = useMemo(() => coursesForProgramBatch(courses), [courses])
  const vocabulary = useMemo(() => programVocabulary(courses), [courses])
  const [picked, setPicked] = useState(() => {
    if (Array.isArray(initialPaths) && initialPaths.length) return new Set(initialPaths)
    return new Set(
      pool.filter((course) => !(course.programs || []).length).map((course) => course.path)
    )
  })
  const [query, setQuery] = useState('')
  const selected = useMemo(() => pool.filter((course) => picked.has(course.path)), [pool, picked])
  const omittedCount = Math.max(0, pool.length - selected.length)
  const pathKey = selected.map((course) => course.path).join('\n')
  const generateToken = useRef(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [checks, setChecks] = useState(() => new Set())

  const roundtrip = useBriefRoundtrip({
    kind: 'programs',
    accepts: (text) => parseProgramsReply(text, pool, { vocabulary }).ok
  })
  const { brief, setBrief, copy, copied, copyNote, paste, setPaste, detected, done } = roundtrip

  const parsed = useMemo(
    () => (paste.trim() ? parseProgramsReply(paste, pool, { vocabulary }) : null),
    [paste, pool, vocabulary]
  )
  const reviewItems = useMemo(() => (parsed?.ok ? parsed.items : []), [parsed])
  const selectedPaths = useMemo(() => new Set(selected.map((course) => course.path)), [selected])
  const problems = parsed?.ok
    ? (parsed.skips || []).filter(
        (skip) => skip.reason !== MISSING_REASON || selectedPaths.has(skip.path)
      )
    : []
  const checkedCount = checks.size

  useEffect(() => {
    setChecks(defaultPicks(reviewItems))
  }, [reviewItems])

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
    generateToken.current += 1
    setGenerating(false)
    setBrief('')
  }, [pathKey, setBrief])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return pool
    return pool.filter((course) =>
      `${course.title || ''} ${course.path || ''} ${course.institution || ''} ${(course.programs || []).join(' ')}`
        .toLowerCase()
        .includes(needle)
    )
  }, [pool, query])

  const handleCopyBrief = async () => {
    if (!selected.length || generating) return
    if (brief) {
      await copy(brief)
      return
    }
    const token = ++generateToken.current
    setGenerating(true)
    setError('')
    try {
      const entries = await outlineEntries(selected)
      if (!alive.current || token !== generateToken.current) return
      await copy(buildProgramsBrief(entries, { vocabulary, omittedCount }))
    } catch (err) {
      if (alive.current && token === generateToken.current) {
        setError(err?.message || 'No se pudo generar el encargo.')
      }
    } finally {
      if (alive.current && token === generateToken.current) setGenerating(false)
    }
  }

  const toggle = (setter, key) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const handleClose = () => {
    dialogRef.current?.close()
    onClose()
  }

  const handleSave = async () => {
    if (saving) return
    if (!parsed?.ok) {
      setError(parsed?.error || 'Pega la respuesta del chat.')
      return
    }
    if (typeof window.api?.updateCourse !== 'function') {
      setError('Reinicia la app para guardar programas.')
      return
    }
    const writes = reviewItems
      .map((item) => {
        const added = item.suggestions
          .filter((s) => checks.has(pickKey(item.path, s.name)))
          .map((s) => s.name)
        return added.length ? { item, programs: mergePrograms(item.current, added) } : null
      })
      .filter(Boolean)
    if (!writes.length) {
      setError('Marca al menos un programa.')
      return
    }
    setSaving(true)
    setError('')
    const failed = []
    let savedCount = 0
    for (const { item, programs } of writes) {
      try {
        await window.api.updateCourse(item.path, { programs })
        savedCount += 1
      } catch (err) {
        failed.push(`${item.title}: ${cleanIpcError(err)}`)
      }
    }
    if (!alive.current) return
    setSaving(false)
    if (savedCount) done()
    if (!failed.length) {
      toast.success(
        savedCount === 1
          ? 'Se guardaron los programas de 1 curso.'
          : `Se guardaron los programas de ${savedCount} cursos.`
      )
      handleClose()
      return
    }
    setError(failed.join('\n'))
  }

  const copyLabel = generating ? 'Preparando…' : copied ? 'Copiado' : 'Copiar encargo'
  const parseError = parsed && !parsed.ok ? parsed.error : ''

  return (
    <dialog
      ref={dialogRef}
      className={dialogShell}
      aria-labelledby="course-programs-batch-title"
      onCancel={(event) => {
        event.preventDefault()
        handleClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) handleClose()
      }}
    >
      <form
        className={dialogBody}
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <h3 id="course-programs-batch-title" className={dialogTitle}>
          Deducir programas
        </h3>
        <p className={dialogLead}>
          {reviewItems.length
            ? 'Revisa cada propuesta. Las suposiciones van desmarcadas. Solo se añaden programas; no se quita ninguno.'
            : 'El encargo lleva lo que ya sabe la app de cada curso: título, lecciones, descripción y tipos de archivo. Pégalo en tu chat y copia su respuesta. Al volver aquí, se detecta sola.'}
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
                  {selected.length} de {pool.length} marcados
                </span>
                <button
                  type="button"
                  className={cn(btnGhost, btnCompact)}
                  onClick={() =>
                    setPicked(
                      new Set(
                        pool
                          .filter((course) => !(course.programs || []).length)
                          .map((course) => course.path)
                      )
                    )
                  }
                >
                  Sin programas
                </button>
                <button
                  type="button"
                  className={cn(btnGhost, btnCompact)}
                  onClick={() => setPicked(new Set(pool.map((course) => course.path)))}
                  disabled={picked.size === pool.length}
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
                  const current = course.programs || []
                  return (
                    <label key={course.path} className={cn(rowBase, checked && 'bg-coral/12')}>
                      <input
                        className="mt-[0.2rem] shrink-0 accent-coral"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(setPicked, course.path)}
                      />
                      <span className="flex min-w-0 flex-col gap-[0.15rem]">
                        <span className="font-display leading-[1.25] font-semibold text-ink">
                          {course.title || course.path}
                        </span>
                        <span className="text-xs text-ink-soft">
                          {current.length ? current.join(', ') : 'Sin programas'}
                        </span>
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
              aria-label="Programas propuestos"
            >
              {reviewItems.map((item) => (
                <div
                  key={item.path}
                  className="flex flex-col gap-[0.35rem] rounded-md px-[0.55rem] py-[0.5rem]"
                >
                  <span className="font-display leading-[1.25] font-semibold text-ink">
                    {item.title}
                  </span>
                  <div className="flex flex-wrap gap-[0.35rem]">
                    {item.current.map((name) => (
                      <span key={name} className={cn(chipBase, chipCurrent)} title="Ya etiquetado">
                        {name}
                      </span>
                    ))}
                    {item.suggestions.map((s) => {
                      const key = pickKey(item.path, s.name)
                      const on = checks.has(key)
                      return (
                        <label
                          key={key}
                          className={cn(
                            chipBase,
                            'cursor-pointer',
                            on
                              ? 'border-teal/40 bg-teal/10 text-ink'
                              : 'border-ink/15 text-ink-soft'
                          )}
                          title={s.evidence || undefined}
                        >
                          <input
                            type="checkbox"
                            className="accent-coral"
                            checked={on}
                            onChange={() => toggle(setChecks, key)}
                          />
                          {s.name}
                          <span className="font-normal text-ink-soft">
                            · {CONFIDENCE_LABEL[s.confidence]}
                            {s.known ? '' : ' · nuevo'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  {item.suggestions.some((s) => s.evidence) ? (
                    <ul className="m-0 flex list-none flex-col gap-[0.1rem] p-0 text-xs text-ink-soft">
                      {item.suggestions
                        .filter((s) => s.evidence)
                        .map((s) => (
                          <li key={s.name}>
                            <strong className="font-semibold">{s.name}:</strong> {s.evidence}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {problems.length ? (
            <ul className="m-0 flex list-disc flex-col gap-[0.2rem] pl-[1.1rem] text-xs leading-[1.35] text-ink-soft">
              {problems.map((skip) => (
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
              <label className={cn(fieldLabel, 'sr-only')} htmlFor="course-programs-batch-paste">
                Respuesta
              </label>
              <textarea
                id="course-programs-batch-paste"
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
          <p className="m-0 text-sm leading-[1.4] whitespace-pre-line text-coral-deep" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-[0.35rem]">
          <button type="button" className={btnGhost} onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
          <button type="submit" className={btnPrimary} disabled={saving || !checkedCount}>
            {saving ? 'Guardando…' : checkedCount ? `Guardar ${checkedCount}` : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default CourseProgramsBatch
