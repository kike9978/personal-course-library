import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { buildPlaylistBrief, parsePlaylistBrief } from '../../../shared/playlistBrief.js'
import { clusterCourses, semanticNeighborhood } from '../../../shared/playlistSemantic.js'

function PlaylistBuilder({
  courses,
  seedCourse,
  selectedPlaylist,
  intent,
  onIntent,
  onCreateLists,
  onExtend,
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
    const extend = mode === 'extend' && selectedPlaylist
    setBrief(
      buildPlaylistBrief({
        courses,
        goal,
        interests,
        mode: extend ? 'extend' : 'create',
        existingPaths: extend ? selectedPlaylist.coursePaths : []
      })
    )
    setCopied(false)
    setCopyNote('')
    setError('')
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
    const parsed = parsePlaylistBrief(paste, courses, {
      goal,
      mode: extend ? 'extend' : 'create',
      existingPaths: extend ? selectedPlaylist.coursePaths : []
    })
    if (!parsed.ok) {
      setSkips(parsed.skips || [])
      setError(parsed.error || 'No se guardó nada.')
      return
    }
    setSaving(true)
    setError('')
    try {
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
          grupo en listas anidadas. El encargo se copia a tu chat y puede volver como un camino.
          Guardar no marca ningún curso.
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
                onClick={() => {
                  setMode('create')
                  setBrief('')
                }}
              >
                Nuevas listas
              </button>
              <button
                type="button"
                aria-pressed={mode === 'extend'}
                disabled={!selectedPlaylist}
                onClick={() => {
                  setMode('extend')
                  setBrief('')
                }}
              >
                {selectedPlaylist ? `Seguir «${selectedPlaylist.title}»` : 'Seguir lista'}
              </button>
            </div>
          </div>
          <p className="course-description__note">
            {`El chat filtra los ${courses.length} cursos del catálogo y arma las listas.`}
          </p>
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
                disabled={!courses.length}
              >
                Generar encargo
              </button>
              <button type="button" className="btn btn--ghost" onClick={handleCopy} disabled={!brief}>
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
              }}
            />
          </div>
          {skips.length ? (
            <ul className="course-description__strays">
              {skips.map((skip) => (
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
