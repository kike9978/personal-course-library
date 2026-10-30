import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
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
      className="dialog dialog--description"
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
        className="dialog__form"
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
      >
        <h3 id="playlist-builder-title">Armar listas</h3>
        <p className="dialog__lead">
          Parecidos arma una lista con los cursos que comparten palabras. Crear camino parte ese
          grupo en listas anidadas. El encargo se copia a tu chat y puede volver como listas nuevas,
          cursos para una lista, o los cursos sueltos en las listas de ahora. Guardar no marca
          ningún curso.
        </p>

        <div className="playlist-builder__section">
          <h4>Meta</h4>
          <div className="field">
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
            <div className="playlist-builder__chips" role="group" aria-label="Intereses">
              {vocabulary.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="filter-pill"
                  aria-pressed={interests.includes(name)}
                  onClick={() => toggleInterest(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <p className="course-description__note">
              Los intereses salen de los programas y temas del catálogo.
            </p>
          )}
        </div>

        <div className="playlist-builder__section">
          <h4>Parecidos</h4>
          <div className="field">
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
            <label className="playlist-builder__seed">
              <input
                type="checkbox"
                checked={useSeed}
                onChange={(event) => setUseSeed(event.target.checked)}
              />
              Partir de «{seedCourse.title || seedCourse.path}»
            </label>
          ) : null}
          <div className="dialog__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleSearch}
              disabled={!query.trim() && !goal.trim() && !(useSeed && seedCourse)}
            >
              Buscar parecidos
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleCreateNeighbors}
              disabled={!neighbors?.courses?.length || saving}
            >
              Crear lista
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleCreatePath}
              disabled={!neighbors?.courses?.length || saving}
            >
              Crear camino
            </button>
          </div>
          {neighbors ? (
            neighbors.courses.length ? (
              <ul className="playlist-builder__neighbors" aria-label="Cursos parecidos">
                {neighbors.courses.map((course) => (
                  <li key={course.path} className="playlist-builder__neighbor">
                    <strong>{course.title || course.path}</strong>
                    <span>{course.institution || course.path}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="course-description__note">Ningún curso se parece a eso.</p>
            )
          ) : null}
        </div>

        <div className="playlist-builder__section">
          <h4>Encargo</h4>
          <div className="playlist-builder__modes">
            <div className="segmented" role="group" aria-label="Qué guardar">
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
          <p className="course-description__note">
            {mode === 'update'
              ? loose.length === 1
                ? 'El chat coloca el curso que no está en ninguna lista.'
                : `El chat coloca los ${loose.length} cursos que no están en ninguna lista.`
              : `El chat reparte los cursos que encajan en varias listas. El catálogo tiene ${courses.length}.`}
          </p>
          {mode === 'update' && undescribed.length ? (
            <div className="playlist-builder__describe">
              <p className="course-description__note">
                {`${undescribed.length} ${undescribed.length === 1 ? 'curso suelto no tiene' : 'cursos sueltos no tienen'} descripción. Describirlos ayuda al chat a ubicarlos. Puedes generar el encargo igual.`}
              </p>
              <div className="dialog__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleDescribe}
                  disabled={describing || savingDesc}
                >
                  {describing ? 'Preparando…' : 'Describir sueltos'}
                </button>
              </div>
              {descBrief ? (
                <div className="field">
                  <label htmlFor="playlist-desc-brief">Encargo de descripciones</label>
                  <textarea
                    id="playlist-desc-brief"
                    className="course-description__brief"
                    readOnly
                    spellCheck={false}
                    value={descBrief}
                  />
                </div>
              ) : null}
              {descBrief ? (
                <div className="field">
                  <label htmlFor="playlist-desc-paste">Respuesta de descripciones</label>
                  <textarea
                    id="playlist-desc-paste"
                    className="course-description__paste"
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
                <div className="dialog__actions">
                  <button type="button" className="btn btn--ghost" onClick={handleCopyDescriptions}>
                    {descCopied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={handleSaveDescriptions}
                    disabled={savingDesc || describing || !descPaste.trim()}
                  >
                    {savingDesc ? 'Guardando…' : 'Guardar descripciones'}
                  </button>
                </div>
              ) : null}
              {descSkips.length ? (
                <ul className="course-description__strays">
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
                <p className="course-description__error" role="alert">
                  {descError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="playlist-brief">Encargo</label>
            <textarea
              id="playlist-brief"
              ref={briefRef}
              className="course-description__brief"
              readOnly
              spellCheck={false}
              value={brief || 'Pulsa Generar encargo.'}
            />
          </div>
          <div className="dialog__actions dialog__actions--spread">
            <span className="course-description__note">{copyNote}</span>
            <div className="dialog__actions-btns">
              <button
                type="button"
                className="btn btn--primary"
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
                className="btn btn--ghost"
                onClick={handleCopy}
                disabled={!brief}
              >
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="playlist-paste">Respuesta</label>
            <textarea
              id="playlist-paste"
              className="course-description__paste"
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
            <div className="playlist-builder__review">
              <p className="course-description__note">
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
            <ul className="course-description__strays">
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
            <p className="course-description__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={saving}>
            Cerrar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !paste.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default PlaylistBuilder
