import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Check, ClipboardCheck, ExternalLink, Flag, ScanSearch, Sparkles } from 'lucide-react'
import {
  buildProgramsBrief,
  coursesForProgramBatch,
  defaultPicks,
  mergePrograms,
  parseProgramsReply,
  pickKey,
  picksWhere,
  programKey,
  programTally,
  programVocabulary,
  randomCourseSample
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
  dialogTitle,
  segmented,
  segmentedItem
} from '../ui/classes'
import { useBriefRoundtrip } from '../utils/briefRoundtrip'
import { cleanIpcError, outlineEntries } from '../utils/saveDescriptions'
import { useCoverImage } from './CourseCard'

const dialogShell = cn(
  dialogBase,
  'max-w-[68rem] open:max-h-[min(94vh,60rem)] open:overflow-auto [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55'
)
const searchInput =
  'w-full rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-ink outline-none focus:shadow-focus motion-reduce:animate-none'
const gridBox =
  'grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] content-start gap-3 overflow-auto rounded-md border border-ink/10 bg-cream/40 p-3'
const briefField = cn(fieldControl, 'min-h-[8rem] resize-y text-xs leading-[1.45]')
const pasteField = cn(fieldControl, 'min-h-[4.5rem] resize-y text-xs leading-[1.45]')
const stepTitle = 'm-0 font-display text-sm font-semibold text-ink'
const toolbarLabel = 'text-2xs font-semibold tracking-[0.07em] text-ink-soft uppercase'
const chipBase =
  'inline-flex items-center gap-1 rounded-full border px-[0.55rem] py-[0.2rem] text-xs font-semibold'
const chipCurrent = 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
const filterChip =
  'inline-flex cursor-pointer items-center gap-1 rounded-full border px-[0.6rem] py-[0.2rem] text-xs font-semibold transition-colors'
const CONFIDENCE_LABEL = { high: 'segura', medium: 'probable', low: 'suposición' }
const MISSING_REASON = 'No vino en la respuesta.'

/** Words for each field the dialog can fill. */
const KINDS = {
  programs: {
    tab: 'Programas',
    one: 'programa',
    many: 'programas',
    none: 'Sin programas',
    briefKind: 'programs',
    how: 'La app busca archivos de proyecto (.blend, .aep, .psd…) y nombres de programas en el título, las lecciones y la descripción, y aprende de los cursos que ya tienen programas. Sin chat.',
    chatHint:
      'El encargo le pide al chat que busque la página oficial de cada curso (sección «Software» o «Requisitos»), la web del instructor o el tráiler, y que cite la URL.'
  },
  media: {
    tab: 'Medios',
    one: 'medio',
    many: 'medios',
    none: 'Sin medios',
    briefKind: 'media',
    how: 'La app busca medios tradicionales (grafito, carboncillo, tinta, acuarela, gouache, óleo…) en el título, las lecciones y la descripción, y aprende de los cursos que ya tienen medios. En cursos con programas, lo que encuentra baja a «probable»: puede ser un pincel digital que imita el medio. Sin chat.',
    chatHint:
      'El encargo le pide al chat que busque la página oficial de cada curso (sección «Materiales»; Domestika la tiene en casi todos), la web del instructor o el tráiler, y que cite la URL.'
  }
}
const flagBtn =
  'inline-flex cursor-pointer items-center gap-1 rounded-full border px-[0.55rem] py-[0.2rem] text-xs font-semibold transition-colors [&_svg]:size-3.5'
const flagOn = 'border-warn-text/40 bg-warn-text/10 text-warn-text'
const flagOff = 'border-ink/12 text-ink-soft hover:border-ink/25 hover:text-ink'

/** Toggle that marks a course to check by hand later. Library filter: «Por revisar». */
function ReviewFlag({ on, onToggle, compact = false }) {
  return (
    <button
      type="button"
      className={cn(flagBtn, on ? flagOn : flagOff, compact && 'px-[0.45rem] py-0')}
      aria-pressed={on}
      title={on ? 'Quitar la marca de revisión' : 'Marcar para revisarlo a mano después'}
      onClick={onToggle}
    >
      <Flag aria-hidden="true" fill={on ? 'currentColor' : 'none'} />
      {on ? 'Por revisar' : 'Revisar'}
    </button>
  )
}
const DEFAULT_SAMPLE = 25
/** Past this many courses a chat starts skipping rows or cutting the reply short. */
const LARGE_BRIEF = 60

/** Cover with a check badge. The whole tile is the hit area when `onToggle` is set. */
function CoverTile({ course, checked, onToggle, label, children }) {
  const { ref, coverSrc, onCoverError } = useCoverImage(
    course.path,
    course.hasCover,
    course.coverStamp
  )
  const Tag = onToggle ? 'button' : 'div'
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface shadow-card transition-[border-color,box-shadow]',
        checked ? 'border-coral/60 ring-2 ring-coral/25' : 'border-ink/10'
      )}
    >
      <Tag
        type={onToggle ? 'button' : undefined}
        className={cn(
          'relative block aspect-video w-full overflow-hidden border-0 bg-ink/5 p-0',
          onToggle && 'cursor-pointer'
        )}
        onClick={onToggle}
        aria-pressed={onToggle ? checked : undefined}
        aria-label={onToggle ? label : undefined}
      >
        <img
          src={coverSrc}
          alt=""
          loading="lazy"
          onError={onCoverError}
          className={cn('size-full object-cover', !checked && onToggle && 'opacity-80')}
        />
        {onToggle ? (
          <span
            className={cn(
              'absolute top-2 left-2 grid size-6 place-items-center rounded-md border shadow-card',
              checked ? 'border-coral bg-coral text-white' : 'border-white/80 bg-white/85'
            )}
            aria-hidden="true"
          >
            {checked ? <Check className="size-4" strokeWidth={3} /> : null}
          </span>
        ) : null}
      </Tag>
      <div className="flex min-w-0 flex-1 flex-col gap-[0.4rem] p-[0.65rem]">
        <span
          className="line-clamp-2 font-display text-sm leading-[1.25] font-semibold text-ink"
          title={course.title || course.path}
        >
          {course.title || course.path}
        </span>
        {children}
      </div>
    </div>
  )
}

/**
 * Programs a course teaches. The app detects them on its own first: project files on disk,
 * program names in the title, lessons and description, and what the rest of the library uses.
 * Courses with no clue can go to the person's chat, which is told to look them up on the web.
 * Saving only adds programs. Nothing already tagged is removed.
 */
/** Programas or Medios. Switching remounts the batch so each field starts clean. */
function CourseProgramsBatch({ courses, initialPaths = null, initialField = 'programs', onClose }) {
  const [field, setField] = useState(initialField === 'media' ? 'media' : 'programs')
  return (
    <ToolBatch
      key={field}
      field={field}
      onFieldChange={setField}
      courses={courses}
      initialPaths={initialPaths}
      onClose={onClose}
    />
  )
}

function ToolBatch({ field, onFieldChange, courses, initialPaths, onClose }) {
  const kind = KINDS[field]
  const tagsOf = (course) => course?.[field] || []
  const dialogRef = useRef(null)
  const alive = useRef(true)
  const pool = useMemo(() => coursesForProgramBatch(courses, field), [courses, field])
  const byPath = useMemo(() => new Map(pool.map((course) => [course.path, course])), [pool])
  const vocabulary = useMemo(() => programVocabulary(courses, [], field), [courses, field])
  const [picked, setPicked] = useState(() => {
    if (Array.isArray(initialPaths) && initialPaths.length) return new Set(initialPaths)
    // Detection has no size limit, so every course still without programs starts marked.
    return new Set(pool.filter((course) => !tagsOf(course).length).map((course) => course.path))
  })
  const [detection, setDetection] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [sampleSize, setSampleSize] = useState(DEFAULT_SAMPLE)
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
    kind: kind.briefKind,
    accepts: (text) => parseProgramsReply(text, pool, { vocabulary, field }).ok
  })
  const { brief, setBrief, copy, copied, copyNote, paste, setPaste, detected, done } = roundtrip

  const parsed = useMemo(
    () => (paste.trim() ? parseProgramsReply(paste, pool, { vocabulary, field }) : null),
    [paste, pool, vocabulary, field]
  )
  const chatItems = useMemo(() => (parsed?.ok ? parsed.items : []), [parsed])
  const source = chatItems.length ? 'chat' : detection?.items.length ? 'detect' : ''
  const reviewItems = useMemo(
    () => (chatItems.length ? chatItems : detection?.items || []),
    [chatItems, detection]
  )
  const tally = useMemo(() => programTally(reviewItems), [reviewItems])
  const allPicks = useMemo(() => picksWhere(reviewItems, () => true), [reviewItems])
  const selectedPaths = useMemo(() => new Set(selected.map((course) => course.path)), [selected])
  const problems =
    source === 'chat'
      ? (parsed.skips || []).filter(
          (skip) => skip.reason !== MISSING_REASON || selectedPaths.has(skip.path)
        )
      : detection
        ? detection.skips
        : []
  // Courses the detector could not place: these are the ones worth a web search.
  const leftovers = useMemo(
    () =>
      source === 'detect' || (detection && !chatItems.length)
        ? (detection?.skips || []).filter((skip) => skip.path).map((skip) => skip.path)
        : [],
    [source, detection, chatItems.length]
  )
  const checkedCount = checks.size
  const checkedCourses = reviewItems.filter((item) =>
    item.suggestions.some((s) => checks.has(pickKey(item.path, s.name)))
  ).length

  // Default ticks follow a new paste or a new detection run only.
  // A course update mid-review keeps the person's ticks.
  const reviewKey = chatItems.length
    ? `chat:${paste}`
    : detection
      ? `detect:${detection.runId}`
      : ''
  const checksFor = useRef('')
  useEffect(() => {
    if (checksFor.current === reviewKey) return
    checksFor.current = reviewKey
    setChecks(defaultPicks(reviewItems))
  }, [reviewKey, reviewItems])

  // Optimistic overrides until the course-updated event brings the saved value back.
  const [flagOverrides, setFlagOverrides] = useState(() => new Map())
  const isFlagged = (path) =>
    flagOverrides.has(path) ? flagOverrides.get(path) : byPath.get(path)?.needsReview === true
  const flaggedCount = pool.filter((course) => isFlagged(course.path)).length
  const toggleFlag = async (path) => {
    const next = !isFlagged(path)
    setFlagOverrides((prev) => new Map(prev).set(path, next))
    try {
      await window.api.updateCourse(path, { needsReview: next })
    } catch (err) {
      if (!alive.current) return
      setFlagOverrides((prev) => new Map(prev).set(path, !next))
      toast.error(cleanIpcError(err))
    }
  }

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
      `${course.title || ''} ${course.path || ''} ${course.institution || ''} ${tagsOf(course).join(' ')}`
        .toLowerCase()
        .includes(needle)
    )
  }, [pool, query])
  const filteredAllPicked = filtered.length > 0 && filtered.every((c) => picked.has(c.path))

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
      await copy(buildProgramsBrief(entries, { vocabulary, omittedCount, field }))
    } catch (err) {
      if (alive.current && token === generateToken.current) {
        setError(err?.message || 'No se pudo generar el encargo.')
      }
    } finally {
      if (alive.current && token === generateToken.current) setGenerating(false)
    }
  }

  const handleDetect = async () => {
    if (!selected.length || detecting) return
    if (typeof window.api?.detectCoursePrograms !== 'function') {
      setError(`Reinicia la app para detectar ${kind.many}.`)
      return
    }
    setDetecting(true)
    setError('')
    setProgress({ done: 0, total: selected.length })
    const stop = window.api.onDetectCourseProgramsProgress?.((payload) => {
      if (alive.current) setProgress(payload)
    })
    try {
      const result = await window.api.detectCoursePrograms(
        selected.map((course) => course.path),
        field
      )
      if (!alive.current) return
      // A main process started before this field existed answers for programs and drops `field`.
      // Saving that would put program names into the wrong property, so stop here.
      if (result?.field !== field) {
        setError(
          'La app necesita reiniciarse para detectar este tipo de etiqueta. Ciérrala y vuelve a abrirla (o reinicia «npm run dev»).'
        )
        return
      }
      setPaste('')
      setDetection({
        runId: Date.now(),
        items: Array.isArray(result?.items) ? result.items : [],
        skips: Array.isArray(result?.skips) ? result.skips : []
      })
      if (!result?.items?.length) {
        setChatOpen(true)
        toast('No se encontraron pistas. Puedes preguntarle al chat.')
      }
    } catch (err) {
      if (alive.current) setError(cleanIpcError(err))
    } finally {
      stop?.()
      if (alive.current) {
        setDetecting(false)
        setProgress(null)
      }
    }
  }

  /** Send the courses the detector could not place to the chat flow. */
  const askChatForLeftovers = () => {
    if (!leftovers.length) return
    setPicked(new Set(leftovers))
    setQuery('')
    setDetection(null)
    setChatOpen(true)
  }

  const discardReview = () => {
    if (source === 'chat') setPaste('')
    else setDetection(null)
  }

  const toggle = (setter, key) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** Add every key, or remove them all when every one is already on. */
  const toggleMany = (setter, current, keys) => {
    const list = [...keys]
    const allOn = list.length > 0 && list.every((key) => current.has(key))
    setter((prev) => {
      const next = new Set(prev)
      for (const key of list) {
        if (allOn) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  const programPicks = (key) => picksWhere(reviewItems, (s) => programKey(s.name) === key)
  const coursePicks = (item) => item.suggestions.map((s) => pickKey(item.path, s.name))
  const sameSet = (a, b) => a.size === b.size && [...a].every((key) => b.has(key))
  const confidencePreset = (levels) => picksWhere(reviewItems, (s) => levels.includes(s.confidence))
  const presets = [
    { label: 'Todas', picks: allPicks },
    { label: 'Seguras', picks: confidencePreset(['high']) },
    { label: 'Seguras y probables', picks: confidencePreset(['high', 'medium']) },
    { label: 'Ninguna', picks: new Set() }
  ]

  const handleClose = () => {
    dialogRef.current?.close()
    onClose()
  }

  const handleSave = async () => {
    if (saving) return
    if (!reviewItems.length) {
      setError(parsed?.error || 'No hay propuestas que guardar.')
      return
    }
    if (typeof window.api?.updateCourse !== 'function') {
      setError(`Reinicia la app para guardar ${kind.many}.`)
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
      setError(`Marca al menos un ${kind.one}.`)
      return
    }
    setSaving(true)
    setError('')
    const failed = []
    let savedCount = 0
    for (const { item, programs } of writes) {
      try {
        await window.api.updateCourse(item.path, { [field]: programs })
        savedCount += 1
      } catch (err) {
        failed.push(`${item.title}: ${cleanIpcError(err)}`)
      }
    }
    if (!alive.current) return
    setSaving(false)
    if (savedCount && source === 'chat') done()
    if (!failed.length) {
      toast.success(
        savedCount === 1
          ? `Se guardaron los ${kind.many} de 1 curso.`
          : `Se guardaron los ${kind.many} de ${savedCount} cursos.`
      )
      // What the detector could not place goes straight to the chat step.
      if (source === 'detect' && leftovers.length) {
        askChatForLeftovers()
        return
      }
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="course-programs-batch-title" className={dialogTitle}>
            Deducir {kind.many}
          </h3>
          <div className={cn(segmented, 'h-8')} role="group" aria-label="Qué deducir">
            {Object.entries(KINDS).map(([key, item]) => (
              <button
                key={key}
                type="button"
                className={cn(segmentedItem, 'px-3 text-sm')}
                aria-pressed={field === key}
                disabled={saving || detecting}
                onClick={() => field !== key && onFieldChange(key)}
              >
                {item.tab}
              </button>
            ))}
          </div>
        </div>
        <p className={dialogLead}>
          {reviewItems.length
            ? source === 'chat'
              ? `Propuestas del chat. Revisa la fuente de cada una. Las suposiciones van desmarcadas. Solo se añaden ${kind.many}; no se quita ninguno.`
              : `Esto es lo que encontró la app en las carpetas y en tu biblioteca. Las suposiciones van desmarcadas. Solo se añaden ${kind.many}; no se quita ninguno.`
            : kind.how}
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
                <span className="mr-1 text-sm font-semibold text-ink-soft">
                  {selected.length} de {pool.length} marcados
                </span>
                <span className={toolbarLabel}>Seleccionar</span>
                <span className="inline-flex items-center gap-[0.3rem]">
                  <input
                    type="number"
                    min={1}
                    max={filtered.length || 1}
                    value={sampleSize}
                    onChange={(event) => setSampleSize(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.preventDefault()
                    }}
                    className="h-7 w-[4.5rem] rounded-md border border-ink/10 bg-surface px-2 text-sm text-ink outline-none focus:shadow-focus"
                    aria-label="Cuántos cursos al azar"
                  />
                  <button
                    type="button"
                    className={cn(btnGhost, btnCompact)}
                    disabled={!filtered.length || !(Number(sampleSize) > 0)}
                    title={`Marca cursos al azar entre los visibles. Primero los que no tienen ${kind.many}.`}
                    onClick={() =>
                      setPicked(new Set(randomCourseSample(filtered, sampleSize, { field })))
                    }
                  >
                    al azar
                  </button>
                </span>
                <button
                  type="button"
                  className={cn(btnGhost, btnCompact)}
                  onClick={() =>
                    setPicked(
                      new Set(
                        pool.filter((course) => !tagsOf(course).length).map((course) => course.path)
                      )
                    )
                  }
                >
                  {kind.none}
                </button>
                {query.trim() ? (
                  <button
                    type="button"
                    className={cn(btnGhost, btnCompact)}
                    onClick={() =>
                      toggleMany(
                        setPicked,
                        picked,
                        filtered.map((course) => course.path)
                      )
                    }
                    disabled={!filtered.length}
                  >
                    {filteredAllPicked
                      ? `Quitar ${filtered.length} filtrados`
                      : `Los ${filtered.length} filtrados`}
                  </button>
                ) : null}
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

            <div className={cn(gridBox, 'max-h-[min(46vh,30rem)]')} aria-label="Cursos del encargo">
              {filtered.length === 0 ? (
                <p className="col-span-full m-0 p-4 text-center text-base text-ink-soft">
                  No hay cursos que coincidan.
                </p>
              ) : (
                filtered.map((course) => {
                  const current = tagsOf(course)
                  const checked = picked.has(course.path)
                  return (
                    <CoverTile
                      key={course.path}
                      course={course}
                      checked={checked}
                      onToggle={() => toggle(setPicked, course.path)}
                      label={`${checked ? 'Quitar' : 'Marcar'} ${course.title || course.path}`}
                    >
                      <span className="text-xs text-ink-soft">
                        {current.length ? current.join(', ') : kind.none}
                      </span>
                    </CoverTile>
                  )
                })
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal/25 bg-teal/5 px-3 py-[0.6rem]">
              <div className="flex min-w-0 flex-col gap-[0.1rem]">
                <p className={stepTitle}>Detectar en la biblioteca</p>
                <p className="m-0 text-xs text-ink-soft">
                  {detecting && progress
                    ? `Leyendo carpetas… ${progress.done} de ${progress.total}`
                    : 'Rápido y sin límite de cursos. Lo que no encuentre puedes preguntarlo al chat después.'}
                </p>
              </div>
              <button
                type="button"
                className={cn(btnPrimary, 'inline-flex items-center gap-1.5 [&_svg]:size-4')}
                onClick={handleDetect}
                disabled={!selected.length || detecting}
              >
                <ScanSearch aria-hidden="true" />
                {detecting ? 'Detectando…' : `Detectar en ${selected.length}`}
              </button>
            </div>

            <details
              className="rounded-md border border-ink/10 px-3 py-[0.55rem]"
              open={chatOpen}
              onToggle={(event) => setChatOpen(event.currentTarget.open)}
            >
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-ink select-none [&_svg]:size-4">
                <Sparkles aria-hidden="true" className="text-coral" />
                Casos difíciles: preguntar al chat
                <span className="font-normal text-ink-soft">· busca cada curso en la web</span>
              </summary>
              <div className="mt-[0.6rem] flex flex-col gap-[0.5rem]">
                <p className="m-0 text-xs leading-[1.45] text-ink-soft">
                  Úsalo para los cursos donde la detección no encontró nada. {kind.chatHint} Usa un
                  chat con búsqueda web activada.
                </p>
                {selected.length > LARGE_BRIEF ? (
                  <p className="m-0 text-xs text-coral-deep">
                    {selected.length} cursos es mucho para un solo encargo: el chat puede saltarse
                    cursos o cortar la respuesta. Mejor tandas de {DEFAULT_SAMPLE}–{LARGE_BRIEF} con
                    «al azar».
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={stepTitle}>1 · Encargo para el chat</p>
                  <button
                    type="button"
                    className={cn(btnGhost)}
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
                <p className={stepTitle}>2 · Respuesta</p>
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
              </div>
            </details>
          </>
        ) : null}

        <div className="flex flex-col gap-[0.55rem]">
          {reviewItems.length ? (
            <p className={cn(stepTitle, 'inline-flex items-center gap-1.5 [&_svg]:size-4')}>
              {source === 'chat' ? (
                <Sparkles aria-hidden="true" className="text-coral" />
              ) : (
                <ScanSearch aria-hidden="true" className="text-teal" />
              )}
              {source === 'chat' ? 'Respuesta del chat' : 'Detectado en la biblioteca'} · revisa
              antes de guardar
            </p>
          ) : null}
          {detected && source === 'chat' ? (
            <p className="m-0 inline-flex items-center gap-1.5 text-sm font-semibold text-teal">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Respuesta detectada en el portapapeles
            </p>
          ) : null}
          {reviewItems.length ? (
            <>
              <div className="flex flex-col gap-[0.45rem]">
                <div className="flex flex-wrap items-center gap-[0.35rem]">
                  <span className="mr-1 text-sm font-semibold text-ink-soft">
                    {checkedCount} de {allPicks.size} {kind.many} · {checkedCourses} cursos
                    {flaggedCount ? ` · ${flaggedCount} por revisar` : ''}
                  </span>
                  <span className={toolbarLabel}>Seleccionar</span>
                  {presets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={cn(btnGhost, btnCompact)}
                      aria-pressed={sameSet(preset.picks, checks)}
                      onClick={() => setChecks(new Set(preset.picks))}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {tally.length > 1 ? (
                  <div
                    className="flex flex-wrap items-center gap-[0.35rem]"
                    role="group"
                    aria-label={`Seleccionar por ${kind.one}`}
                  >
                    <span className={toolbarLabel}>Por {kind.one}</span>
                    {tally.map((row) => {
                      const keys = programPicks(row.key)
                      const on = [...keys].filter((key) => checks.has(key)).length
                      const full = on === keys.size
                      return (
                        <button
                          key={row.key}
                          type="button"
                          className={cn(
                            filterChip,
                            full
                              ? 'border-coral/50 bg-coral/12 text-ink'
                              : on
                                ? 'border-coral/30 bg-coral/5 text-ink'
                                : 'border-ink/15 text-ink-soft hover:text-ink'
                          )}
                          aria-pressed={full}
                          title={
                            full
                              ? `Quitar ${row.name} de todos los cursos`
                              : `Marcar ${row.name} en todos los cursos`
                          }
                          onClick={() => toggleMany(setChecks, checks, keys)}
                        >
                          {row.name}
                          <span className="font-normal text-ink-soft">
                            {on}/{row.count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div
                className={cn(gridBox, 'max-h-[min(58vh,36rem)]')}
                aria-label={`${kind.tab} propuestos`}
              >
                {reviewItems.map((item) => {
                  const course = byPath.get(item.path) || { path: item.path, title: item.title }
                  const keys = coursePicks(item)
                  const allOn = keys.every((key) => checks.has(key))
                  return (
                    <CoverTile
                      key={item.path}
                      course={course}
                      checked={keys.some((key) => checks.has(key))}
                      onToggle={() => toggleMany(setChecks, checks, keys)}
                      label={`${allOn ? 'Quitar' : 'Marcar'} todos los ${kind.many} de ${item.title}`}
                    >
                      <div className="flex flex-wrap gap-[0.3rem]">
                        {item.current.map((name) => (
                          <span
                            key={name}
                            className={cn(chipBase, chipCurrent)}
                            title="Ya etiquetado"
                          >
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
                      {item.suggestions.some((s) => s.evidence || s.source) ? (
                        <ul className="m-0 flex list-none flex-col gap-[0.15rem] p-0 text-xs leading-[1.35] text-ink-soft">
                          {item.suggestions
                            .filter((s) => s.evidence || s.source)
                            .map((s) => (
                              <li key={s.name}>
                                <strong className="font-semibold">{s.name}:</strong> {s.evidence}
                                {s.source ? (
                                  <>
                                    {' '}
                                    <a
                                      href={s.source}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 font-semibold text-teal underline-offset-2 hover:underline [&_svg]:size-3"
                                      title={s.source}
                                    >
                                      fuente
                                      <ExternalLink aria-hidden="true" />
                                    </a>
                                  </>
                                ) : null}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                      <div className="mt-auto flex pt-[0.15rem]">
                        <ReviewFlag
                          on={isFlagged(item.path)}
                          onToggle={() => toggleFlag(item.path)}
                        />
                      </div>
                    </CoverTile>
                  )
                })}
              </div>
            </>
          ) : null}
          {leftovers.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-coral/25 bg-coral/5 px-3 py-[0.5rem]">
              <span className="text-sm text-ink">
                <strong>{leftovers.length}</strong>{' '}
                {leftovers.length === 1 ? 'curso no tiene' : 'cursos no tienen'} pistas en la
                biblioteca.
              </span>
              <button
                type="button"
                className={cn(
                  btnGhost,
                  btnCompact,
                  'inline-flex items-center gap-1 [&_svg]:size-3.5'
                )}
                onClick={askChatForLeftovers}
                disabled={saving}
                title="Prepara un encargo solo con estos cursos. El chat los busca en la web."
              >
                <Sparkles aria-hidden="true" />
                Preguntar al chat por {leftovers.length === 1 ? 'él' : `estos ${leftovers.length}`}
              </button>
            </div>
          ) : null}
          {problems.length ? (
            <details className="text-xs text-ink-soft" open={problems.length <= 8}>
              <summary className="cursor-pointer select-none">
                {problems.length} {problems.length === 1 ? 'curso' : 'cursos'} sin propuesta
              </summary>
              <ul className="m-0 mt-1 flex list-disc flex-col gap-[0.2rem] pl-[1.1rem] leading-[1.35]">
                {problems.map((skip) => (
                  <li key={`${skip.path || skip.title}-${skip.reason}`}>
                    <strong>{skip.title || 'Sin nombre'}</strong>
                    {': '}
                    {skip.reason}
                    {skip.path && byPath.has(skip.path) ? (
                      <span className="ml-2 inline-block align-middle">
                        <ReviewFlag
                          compact
                          on={isFlagged(skip.path)}
                          onToggle={() => toggleFlag(skip.path)}
                        />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {reviewItems.length ? (
            <button
              type="button"
              className={cn(btnGhost, btnCompact, 'self-start')}
              onClick={discardReview}
              disabled={saving}
            >
              {source === 'chat' ? 'Descartar respuesta' : 'Volver a elegir cursos'}
            </button>
          ) : null}
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
