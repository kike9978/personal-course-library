import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import {
  btnGhost,
  btnPrimary,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead as sharedDialogLead
} from '../ui/classes'

const descriptionDialog = cn(
  dialogBase,
  'max-h-[min(90vh,48rem)] max-w-[40rem] overflow-auto [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55'
)
const dialogForm = cn(dialogBody, '[&_h3]:m-0 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold [&_h3]:tracking-tight')
const dialogLead = sharedDialogLead
const actions = 'flex justify-end gap-2 pt-[0.35rem]'
const actionsSpread = 'flex flex-wrap items-center justify-between gap-3 pt-[0.35rem]'
const actionsBtns = 'flex gap-2'
const field =
  '[&_label]:mb-[0.3rem] [&_label]:block [&_label]:text-xs [&_label]:font-semibold [&_label]:tracking-[0.04em] [&_label]:text-ink-soft [&_label]:uppercase [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-ink/10 [&_input]:bg-surface [&_input]:px-3 [&_input]:py-[0.65rem] [&_input]:text-ink [&_input]:shadow-none [&_input]:outline-none [&_input]:focus:shadow-focus [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-ink/10 [&_textarea]:bg-surface [&_textarea]:px-3 [&_textarea]:py-[0.65rem] [&_textarea]:text-ink [&_textarea]:outline-none [&_textarea]:focus:shadow-focus'
const section =
  'mt-[0.85rem] flex flex-col gap-[0.45rem] [&_h4]:m-0 [&_h4]:font-display [&_h4]:text-md'
const filterPill =
  'inline-flex cursor-pointer items-center gap-[0.4rem] rounded-full border border-ink/10 bg-surface px-[0.9rem] py-[0.45rem] text-sm font-semibold text-ink shadow-none aria-pressed:bg-teal aria-pressed:text-white'
const note = 'text-xs text-ink-soft'
const brief = '!min-h-[8rem] text-xs leading-[1.45]'
const paste = '!min-h-[6.5rem] text-xs leading-[1.45]'
const segmented =
  'inline-flex max-w-full flex-wrap gap-[0.2rem] rounded-full border border-ink/10 bg-surface p-1 shadow-none [&_button]:max-w-[16rem] [&_button]:cursor-pointer [&_button]:truncate [&_button]:rounded-full [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-[0.85rem] [&_button]:py-[0.4rem] [&_button]:text-sm [&_button]:font-semibold [&_button]:text-ink-soft [&_button[aria-pressed=true]]:bg-coral [&_button[aria-pressed=true]]:text-white'
const review =
  'flex max-h-[16rem] flex-col gap-[0.45rem] overflow-auto [&_fieldset]:m-0 [&_fieldset]:rounded-sm [&_fieldset]:border [&_fieldset]:border-ink/10 [&_fieldset]:px-[0.6rem] [&_fieldset]:pt-[0.4rem] [&_fieldset]:pb-2 [&_legend]:px-1 [&_legend]:text-xs [&_legend]:font-semibold [&_label]:my-[0.2rem] [&_label]:flex [&_label]:items-start [&_label]:gap-[0.4rem] [&_label]:text-sm [&_label>span]:flex [&_label>span]:min-w-0 [&_label>span]:flex-col [&_small]:text-xs [&_small]:text-ink-soft'
import {
  buildCourseDescriptionBatchBrief,
  coursesForDescriptionBatch,
  parseCourseDescriptionBatch
} from '../../../shared/courseDescription.js'
import {
  buildPlaylistBrief,
  looseCourses,
  parsePlaylistBrief,
  placementGroups,
  selectedPlacement
} from '../../../shared/playlistBrief.js'
import { clusterCourses, semanticNeighborhood } from '../../../shared/playlistSemantic.js'

function courseLabel(courses, path) {
  return courses.find((course) => course.path === path)?.title || path
}

function PlaylistBuilder({
  courses,
  playlists = [],
  seedCourse,
  selectedPlaylist,
  intent,
  onIntent,
  onCreateLists,
  onExtend,
  onPlaceLoose,
  onClose
}) {
  const dialogRef = useRef(null)
  const briefRef = useRef(null)
  const alive = useRef(true)
  const skipIntentSave = useRef(true)
  const [goal, setGoal] = useState(intent?.goal || '')
  const [interests, setInterests] = useState(() =>
    Array.isArray(intent?.interests) ? intent.interests : []
  )
  const [query, setQuery] = useState('')
  const [useSeed, setUseSeed] = useState(Boolean(seedCourse))
  const [neighbors, setNeighbors] = useState(null)
  const [mode, setMode] = useState('create')
  const [brief, setBrief] = useState('')
  const [paste, setPaste] = useState('')
  const [error, setError] = useState('')
  const [skips, setSkips] = useState([])
  const [copyNote, setCopyNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [descBrief, setDescBrief] = useState('')
  const [descPaste, setDescPaste] = useState('')
  const [descError, setDescError] = useState('')
  const [descSkips, setDescSkips] = useState([])
  const [describing, setDescribing] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [descCopied, setDescCopied] = useState(false)
  const [checked, setChecked] = useState(() => new Set())
  const [checkedFor, setCheckedFor] = useState('')

  const loose = useMemo(() => looseCourses(courses, playlists), [courses, playlists])
  const undescribed = useMemo(() => coursesForDescriptionBatch(loose), [loose])
  const canPlaceLoose = playlists.length > 0 && loose.length > 0
  const placement = useMemo(() => {
    if (mode !== 'update' || !paste.trim()) return null
    return parsePlaylistBrief(paste, courses, { goal, mode: 'update', board: playlists })
  }, [mode, paste, courses, goal, playlists])
  const groups = placement?.ok ? placementGroups(placement) : []
  const placementKey = groups
    .flatMap((group) => group.courses.map((course) => course.check))
    .join('\n')
  if (checkedFor !== placementKey) {
    setCheckedFor(placementKey)
    setChecked(new Set(placementKey ? placementKey.split('\n') : []))
  }

  const vocabulary = useMemo(() => {
    const names = new Set()
    for (const course of courses) {
      for (const program of course.programs || []) if (program) names.add(program)
      for (const theme of course.theme || []) if (theme) names.add(theme)
    }
    for (const interest of interests) if (interest) names.add(interest)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [courses, interests])

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
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!descCopied) return undefined
    const timer = window.setTimeout(() => setDescCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [descCopied])

  useEffect(() => {
    if (skipIntentSave.current) {
      skipIntentSave.current = false
      return undefined
    }
    const timer = window.setTimeout(() => {
      onIntent?.({ goal, interests })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [goal, interests, onIntent])

  const handleClose = () => {
    dialogRef.current?.close()
    onClose?.()
  }

  const toggleInterest = (name) => {
    setInterests((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name)
      if (current.length >= 8) return current
      return [...current, name]
    })
    setBrief('')
  }

  const handleSearch = () => {
    const needle = (query || goal).trim()
    const seedPath = useSeed && seedCourse ? seedCourse.path : ''
    if (!needle && !seedPath) return
    const result = semanticNeighborhood(courses, { query: needle, seedPath })
    setNeighbors(result.courses.length ? result : { title: '', courses: [] })
    setError(result.courses.length ? '' : 'Ningún curso se parece a eso.')
  }

  const handleCreatePath = async () => {
    if (!neighbors?.courses?.length || saving) return
    const groups = clusterCourses(neighbors.courses).filter((group) => group.courses.length)
    if (!groups.length) return
    setSaving(true)
    try {
      if (groups.length === 1) {
        await onCreateLists?.([
          {
            title: groups[0].title || neighbors.title || 'Cursos parecidos',
            why: goal.trim(),
            coursePaths: groups[0].courses.map((course) => course.path),
            courseWhys: {},
            children: []
          }
        ])
        if (alive.current) toast.success('Quedó en una sola lista.')
        return
      }
      await onCreateLists?.([
        {
          title: neighbors.title || goal.trim() || 'Camino',
          why: goal.trim(),
          coursePaths: [],
          courseWhys: {},
          children: groups.map((group) => ({
            title: group.title,
            why: '',
            coursePaths: group.courses.map((course) => course.path),
            courseWhys: {}
          }))
        }
      ])
      if (alive.current) toast.success(`Se creó un camino con ${groups.length} listas.`)
    } catch (err) {
      if (alive.current) toast.error(err?.message || 'No se pudo crear el camino')
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  const handleCreateNeighbors = async () => {
    if (!neighbors?.courses?.length || saving) return
    setSaving(true)
    try {
      await onCreateLists?.([
        {
          title: neighbors.title || 'Cursos parecidos',
          why: goal.trim(),
          coursePaths: neighbors.courses.map((course) => course.path),
          courseWhys: {}
        }
      ])
      if (alive.current) toast.success(`Se creó «${neighbors.title || 'Cursos parecidos'}».`)
    } catch (err) {
      if (alive.current) toast.error(err?.message || 'No se pudo crear la lista')
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  const handleGenerate = () => {
    if (!courses.length) return
    if (mode === 'update' && !canPlaceLoose) return
    if (mode === 'extend' && !selectedPlaylist) return
    const extend = mode === 'extend' && selectedPlaylist
    setBrief(
      buildPlaylistBrief({
        courses,
        goal,
        interests,
        mode: mode === 'update' ? 'update' : extend ? 'extend' : 'create',
        existingPaths: extend ? selectedPlaylist.coursePaths : [],
        board: mode === 'update' ? playlists : []
      })
    )
    setCopied(false)
    setCopyNote('')
    setError('')
  }

  const handleDescribe = async () => {
    if (!undescribed.length || describing) return
    setDescribing(true)
    setDescError('')
    setDescBrief('')
    try {
      const entries = await Promise.all(
        undescribed.map(async (course) => {
          try {
            const outline = await window.api.scanCourse(course.path)
            return { course, outline, outlineUnreadable: false }
          } catch {
            return { course, outline: null, outlineUnreadable: true }
          }
        })
      )
      if (!alive.current) return
      setDescBrief(buildCourseDescriptionBatchBrief(entries))
    } catch (err) {
      if (alive.current) setDescError(err?.message || 'No se pudo preparar las descripciones.')
    } finally {
      if (alive.current) setDescribing(false)
    }
  }

  const handleSaveDescriptions = async () => {
    if (savingDesc || !descPaste.trim()) return
    const parsed = parseCourseDescriptionBatch(descPaste, undescribed)
    if (!parsed.ok) {
      setDescSkips(parsed.skips || [])
      setDescError(parsed.error || 'No se guardó nada.')
      return
    }
    if (typeof window.api.saveCourseDescriptionBatch !== 'function') {
      setDescError('Reinicia la app para guardar descripciones.')
      return
    }
    setSavingDesc(true)
    setDescError('')
    try {
      const result = await window.api.saveCourseDescriptionBatch(
        parsed.items.map((item) => ({ coursePath: item.path, payload: item.raw }))
      )
      if (!alive.current) return
      const savedCount = result?.savedCount || 0
      const left = [...(parsed.skips || []), ...(result?.skips || [])]
      setDescSkips(left)
      setDescPaste('')
      if (savedCount && !left.length) {
        toast.success(
          savedCount === 1
            ? 'Se guardó 1 descripción.'
            : `Se guardaron ${savedCount} descripciones.`
        )
        setDescBrief('')
        return
      }
      if (!savedCount) {
        setDescError('No se guardó ninguna descripción.')
        return
      }
      toast.success(`Se guardaron ${savedCount}. ${left.length} quedaron fuera.`)
    } catch (err) {
      if (alive.current) setDescError(err?.message || 'No se pudieron guardar las descripciones.')
    } finally {
      if (alive.current) setSavingDesc(false)
    }
  }

  const selectMode = (next) => {
    setMode(next)
    setBrief('')
    setPaste('')
    setError('')
    setSkips([])
    if (next !== 'update') {
      setDescBrief('')
      setDescPaste('')
      setDescError('')
      setDescSkips([])
    }
  }

  const handleCopyDescriptions = async () => {
    if (!descBrief) return
    try {
      await navigator.clipboard.writeText(descBrief)
      setDescCopied(true)
    } catch {
      setDescError('No se pudo copiar solo. El encargo sigue en el cuadro para que lo selecciones.')
    }
  }

  const toggleChecked = (key) => {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleCopy = async () => {
    if (!brief) return
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
    const extend = mode === 'extend' && selectedPlaylist
    const update = mode === 'update'
    const parsed = update
      ? placement || parsePlaylistBrief(paste, courses, { goal, mode: 'update', board: playlists })
      : parsePlaylistBrief(paste, courses, {
          goal,
          mode: extend ? 'extend' : 'create',
          existingPaths: extend ? selectedPlaylist.coursePaths : []
        })
    if (!parsed?.ok) {
      setSkips(parsed?.skips || [])
      setError(parsed?.error || 'No se guardó nada.')
      return
    }
    const chosen = update ? selectedPlacement(parsed, checked) : null
    if (update && !chosen.adds.length && !chosen.lists.length) {
      setError('Marca al menos un curso.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (update) {
        const result = await onPlaceLoose?.(chosen)
        if (!alive.current) return
        setSkips(parsed.skips || [])
        const added = result?.added || 0
        const created = result?.created || 0
        const parts = []
        if (added) parts.push(`Se añadieron ${added} cursos`)
        if (created) parts.push(created === 1 ? 'Se creó 1 lista' : `Se crearon ${created} listas`)
        const summary = parts.join('. ') || 'No se añadió ningún curso'
        if (parsed.skips?.length) {
          toast.success(`${summary}. ${parsed.skips.length} quedaron fuera.`)
          setPaste('')
          return
        }
        toast.success(`${summary}.`)
        handleClose()
        return
      }
      if (extend) await onExtend?.(parsed.lists[0])
      else await onCreateLists?.(parsed.lists)
      if (!alive.current) return
      setSkips(parsed.skips || [])
      const count = extend ? parsed.lists[0].coursePaths.length : parsed.lists.length
      if (parsed.skips?.length) {
        toast.success(
          extend
            ? `Se añadieron ${count}. ${parsed.skips.length} quedaron fuera.`
            : `Se crearon ${count}. ${parsed.skips.length} quedaron fuera.`
        )
        setPaste('')
        return
      }
      toast.success(extend ? `Se añadieron ${count} cursos.` : `Se crearon ${count} listas.`)
      handleClose()
    } catch (err) {
      if (alive.current) setError(err?.message || 'No se guardó nada.')
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={descriptionDialog}
      aria-labelledby="playlist-builder-title"
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
        <h3 id="playlist-builder-title">Armar listas</h3>
        <p className={dialogLead}>
          Parecidos arma una lista con los cursos que comparten palabras. Crear camino parte ese
          grupo en listas anidadas. El encargo se copia a tu chat y puede volver como listas nuevas,
          cursos para una lista, o los cursos sueltos en las listas de ahora. Guardar no marca
          ningún curso.
        </p>

        <div className={section}>
          <h4>Meta</h4>
          <div className={field}>
            <label htmlFor="playlist-goal">Qué quieres aprender</label>
            <input
              id="playlist-goal"
              value={goal}
              maxLength={180}
              placeholder="Armar un reel de storyboard"
              onChange={(event) => {
                setGoal(event.target.value)
                setBrief('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault()
              }}
            />
          </div>
          {vocabulary.length ? (
            <div className="flex flex-wrap gap-[0.4rem]" role="group" aria-label="Intereses">
              {vocabulary.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={filterPill}
                  aria-pressed={interests.includes(name)}
                  onClick={() => toggleInterest(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <p className={note}>
              Los intereses salen de los programas y temas del catálogo.
            </p>
          )}
        </div>

        <div className={section}>
          <h4>Parecidos</h4>
          <div className={field}>
            <label htmlFor="playlist-semantic">Buscar por palabras del curso</label>
            <input
              id="playlist-semantic"
              type="search"
              value={query}
              placeholder={goal.trim() || 'storyboard, iluminación, personaje'}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSearch()
                }
              }}
            />
          </div>
          {seedCourse ? (
            <label className="flex items-center gap-[0.4rem] text-sm">
              <input
                type="checkbox"
                checked={useSeed}
                onChange={(event) => setUseSeed(event.target.checked)}
              />
              Partir de «{seedCourse.title || seedCourse.path}»
            </label>
          ) : null}
          <div className={actions}>
            <button
              type="button"
              className={btnGhost}
              onClick={handleSearch}
              disabled={!query.trim() && !goal.trim() && !(useSeed && seedCourse)}
            >
              Buscar parecidos
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={handleCreateNeighbors}
              disabled={!neighbors?.courses?.length || saving}
            >
              Crear lista
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={handleCreatePath}
              disabled={!neighbors?.courses?.length || saving}
            >
              Crear camino
            </button>
          </div>
          {neighbors ? (
            neighbors.courses.length ? (
              <ul
                className="m-0 flex max-h-[9rem] list-none flex-col gap-[0.35rem] overflow-auto p-0"
                aria-label="Cursos parecidos"
              >
                {neighbors.courses.map((course) => (
                  <li
                    key={course.path}
                    className="flex flex-col gap-[0.05rem] text-sm [&_span]:text-xs [&_span]:text-ink-soft"
                  >
                    <strong>{course.title || course.path}</strong>
                    <span>{course.institution || course.path}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={note}>Ningún curso se parece a eso.</p>
            )
          ) : null}
        </div>

        <div className={section}>
          <h4>Encargo</h4>
          <div className="flex flex-wrap gap-[0.4rem]">
            <div className={segmented} role="group" aria-label="Qué guardar">
              <button
                type="button"
                aria-pressed={mode === 'create'}
                onClick={() => selectMode('create')}
              >
                Nuevas listas
              </button>
              <button
                type="button"
                aria-pressed={mode === 'extend'}
                disabled={!selectedPlaylist}
                onClick={() => selectMode('extend')}
              >
                {selectedPlaylist ? `Seguir «${selectedPlaylist.title}»` : 'Seguir lista'}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'update'}
                disabled={!canPlaceLoose}
                title={
                  playlists.length === 0
                    ? 'Primero crea una lista'
                    : loose.length === 0
                      ? 'Todos los cursos ya están en una lista'
                      : undefined
                }
                onClick={() => selectMode('update')}
              >
                Colocar sueltos
              </button>
            </div>
          </div>
          <p className={note}>
            {mode === 'update'
              ? loose.length === 1
                ? 'El chat coloca el curso que no está en ninguna lista.'
                : `El chat coloca los ${loose.length} cursos que no están en ninguna lista.`
              : `El chat reparte los cursos que encajan en varias listas. El catálogo tiene ${courses.length}.`}
          </p>
          {mode === 'update' && undescribed.length ? (
            <div className="flex flex-col gap-[0.45rem]">
              <p className={note}>
                {`${undescribed.length} ${undescribed.length === 1 ? 'curso suelto no tiene' : 'cursos sueltos no tienen'} descripción. Describirlos ayuda al chat a ubicarlos. Puedes generar el encargo igual.`}
              </p>
              <div className={actions}>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={handleDescribe}
                  disabled={describing || savingDesc}
                >
                  {describing ? 'Preparando…' : 'Describir sueltos'}
                </button>
              </div>
              {descBrief ? (
                <div className={field}>
                  <label htmlFor="playlist-desc-brief">Encargo de descripciones</label>
                  <textarea
                    id="playlist-desc-brief"
                    className={brief}
                    readOnly
                    spellCheck={false}
                    value={descBrief}
                  />
                </div>
              ) : null}
              {descBrief ? (
                <div className={field}>
                  <label htmlFor="playlist-desc-paste">Respuesta de descripciones</label>
                  <textarea
                    id="playlist-desc-paste"
                    className={paste}
                    spellCheck={false}
                    value={descPaste}
                    placeholder="Pega aquí el JSON de las descripciones"
                    onChange={(event) => {
                      setDescPaste(event.target.value)
                      if (descError) setDescError('')
                    }}
                  />
                </div>
              ) : null}
              {descBrief ? (
                <div className={actions}>
                  <button type="button" className={btnGhost} onClick={handleCopyDescriptions}>
                    {descCopied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={handleSaveDescriptions}
                    disabled={savingDesc || describing || !descPaste.trim()}
                  >
                    {savingDesc ? 'Guardando…' : 'Guardar descripciones'}
                  </button>
                </div>
              ) : null}
              {descSkips.length ? (
                <ul className="m-0 flex flex-col gap-[0.2rem] pl-[1.1rem] text-xs leading-[1.35] text-coral-deep">
                  {descSkips.map((skip) => (
                    <li key={`${skip.path || skip.title}-${skip.reason}`}>
                      <strong>{skip.title || skip.path || 'Sin nombre'}</strong>
                      {': '}
                      {skip.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {descError ? (
                <p className="m-0 text-sm leading-[1.4] text-coral-deep" role="alert">
                  {descError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className={field}>
            <label htmlFor="playlist-brief">Encargo</label>
            <textarea
              id="playlist-brief"
              ref={briefRef}
              className={brief}
              readOnly
              spellCheck={false}
              value={brief || 'Pulsa Generar encargo.'}
            />
          </div>
          <div className={actionsSpread}>
            <span className={note}>{copyNote}</span>
            <div className={actionsBtns}>
              <button
                type="button"
                className={btnPrimary}
                onClick={handleGenerate}
                disabled={
                  !courses.length ||
                  (mode === 'extend' && !selectedPlaylist) ||
                  (mode === 'update' && !canPlaceLoose)
                }
              >
                Generar encargo
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={handleCopy}
                disabled={!brief}
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
          <div className={field}>
            <label htmlFor="playlist-paste">Respuesta</label>
            <textarea
              id="playlist-paste"
              className={paste}
              spellCheck={false}
              value={paste}
              placeholder="Pega aquí el JSON del chat"
              onChange={(event) => {
                setPaste(event.target.value)
                if (error) setError('')
                if (skips.length) setSkips([])
              }}
            />
          </div>
          {mode === 'update' && groups.length ? (
            <div className={review}>
              <p className={note}>
                Revisa qué se guarda. Lo que desmarques se queda fuera.
              </p>
              {groups.map((group) => (
                <fieldset key={group.key}>
                  <legend>
                    {group.kind === 'add' ? `En «${group.title}»` : `Nueva · ${group.title}`}
                  </legend>
                  {group.courses.map((course) => (
                    <label key={course.check}>
                      <input
                        type="checkbox"
                        checked={checked.has(course.check)}
                        onChange={() => toggleChecked(course.check)}
                      />
                      <span>
                        {courseLabel(courses, course.path)}
                        {course.why ? <small>{course.why}</small> : null}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          ) : null}
          {(mode === 'update' && placement?.ok ? placement.skips || [] : skips).length ? (
            <ul className="m-0 flex flex-col gap-[0.2rem] pl-[1.1rem] text-xs leading-[1.35] text-coral-deep">
              {(mode === 'update' && placement?.ok ? placement.skips || [] : skips).map((skip) => (
                <li key={`${skip.title}-${skip.reason}`}>
                  <strong>{skip.title || 'Sin nombre'}</strong>
                  {': '}
                  {skip.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p className="m-0 text-sm leading-[1.4] text-coral-deep" role="alert">
              {error}
            </p>
          ) : null}
        </div>

              <div className={actions}>
          <button type="button" className={btnGhost} onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
          <button type="submit" className={btnPrimary} disabled={saving || !paste.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default PlaylistBuilder
