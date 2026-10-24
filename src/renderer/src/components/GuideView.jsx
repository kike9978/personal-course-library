/* eslint-disable react/prop-types -- the renderer does not declare prop types */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AppNav from './AppNav'
import {
  buildCatalogSnapshot,
  buildCurriculumBrief,
  buildGoalsBrief,
  buildGroupBrief,
  buildResearchBrief,
  catalogIds,
  parseCurriculumPack,
  parseGoalsPack,
  parsePlaylistPack,
  parseResearchPack
} from '../learning/courseCoach'

const JOBS = [
  {
    id: 'research',
    label: 'Investigar',
    hint: 'El chat busca de qué trata cada curso. Solo se guardan notas de cursos que ya están en la carpeta.'
  },
  {
    id: 'group',
    label: 'Agrupar',
    hint: 'Arma temas que después se puedan elegir como rumbo. Las rutas que ya tenías se quedan.'
  },
  {
    id: 'goals',
    label: 'Metas',
    hint: 'El chat propone caminos. Tú eliges uno. Si ya agrupaste, usa esas listas. No hace falta nombrar cursos.'
  },
  {
    id: 'curriculum',
    label: 'Currículo',
    hint: 'Una ruta ordenada. Si ya hay un currículo de la guía, este pegado lo reemplaza.'
  }
]

async function copyBrief(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Brief copiado.')
  } catch {
    toast.error('Selecciona el brief y cópialo.')
  }
}

function GuideView({ courses = [], onNavigate }) {
  const [jobId, setJobId] = useState(JOBS[0].id)
  const [paths, setPaths] = useState([])
  const [briefs, setBriefs] = useState({})
  const [goals, setGoals] = useState(null)
  const [paste, setPaste] = useState('')
  const [loading, setLoading] = useState(true)

  const snapshot = useMemo(() => buildCatalogSnapshot(courses), [courses])
  const ids = useMemo(() => catalogIds(courses), [courses])
  const job = JOBS.find((item) => item.id === jobId) || JOBS[0]
  const curriculum = paths.find(
    (path) => path.source === 'coach' && path.coachKind === 'curriculum'
  )
  const playlistCount = paths.filter(
    (path) => path.source === 'coach' && path.coachKind === 'playlist'
  ).length
  const noteCount = Object.keys(briefs).length

  const brief = useMemo(() => {
    if (jobId === 'group') return buildGroupBrief(snapshot, briefs)
    if (jobId === 'goals') return buildGoalsBrief(snapshot, { paths })
    if (jobId === 'curriculum') return buildCurriculumBrief(snapshot, { briefs, goals, paths })
    return buildResearchBrief(snapshot)
  }, [jobId, snapshot, briefs, goals, paths])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      window.api.listLearningPaths(),
      window.api.getCourseBriefs(),
      window.api.getLearnerGoals()
    ])
      .then(([list, notes, profile]) => {
        if (cancelled) return
        setPaths(list || [])
        setBriefs(notes || {})
        setGoals(profile || null)
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'No se pudo cargar la guía')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPaste('')
  }, [jobId])

  const status =
    jobId === 'research'
      ? noteCount
        ? `${noteCount} notas guardadas. No cuentan como avance.`
        : 'Todavía no hay notas.'
      : jobId === 'group'
        ? playlistCount
          ? `${playlistCount} listas de la guía, en Rutas.`
          : 'Todavía no hay listas de la guía.'
        : jobId === 'goals'
          ? goals?.goal
            ? `Meta: ${goals.goal}${
                goals.hoursPerWeek !== '' && goals.hoursPerWeek != null
                  ? ` · ${goals.hoursPerWeek} h/semana`
                  : ''
              }`
            : 'Todavía no hay meta.'
          : curriculum
            ? `Currículo actual: ${curriculum.title}. El avance se marca en el curso.`
            : 'Todavía no hay currículo.'

  async function save() {
    if (jobId === 'research') {
      const parsed = parseResearchPack(paste, ids)
      if (parsed.error || !parsed.courses.length) {
        toast.error(parsed.error || 'No se importó nada.')
        return
      }
      try {
        const saved = await window.api.saveCourseBriefs(parsed.courses)
        setBriefs(saved)
        setPaste('')
        toast.success('Notas guardadas. No cuentan como avance.')
      } catch (err) {
        toast.error(err.message || 'No se pudieron guardar las notas.')
      }
      return
    }

    if (jobId === 'group') {
      const parsed = parsePlaylistPack(paste, ids)
      if (parsed.error || !parsed.playlists.length) {
        toast.error(parsed.error || 'No se importó nada.')
        return
      }
      try {
        let list = paths
        for (const playlist of parsed.playlists) {
          list = await window.api.upsertLearningPath({
            title: playlist.title,
            coursePaths: playlist.courseIds,
            why: playlist.why,
            source: 'coach',
            coachKind: 'playlist'
          })
        }
        setPaths(list)
        setPaste('')
        toast.success('Rutas añadidas. Ábrelas en Rutas.')
      } catch (err) {
        toast.error(err.message || 'No se pudieron guardar las rutas.')
      }
      return
    }

    if (jobId === 'goals') {
      const parsed = parseGoalsPack(paste)
      if (parsed.error || !parsed.goals) {
        toast.error(parsed.error || 'No se importó nada.')
        return
      }
      try {
        const saved = await window.api.saveLearnerGoals(parsed.goals)
        setGoals(saved)
        setPaste('')
        toast.success('Meta guardada.')
      } catch (err) {
        toast.error(err.message || 'No se pudo guardar la meta.')
      }
      return
    }

    const parsed = parseCurriculumPack(paste, ids)
    if (parsed.error || !parsed.path) {
      toast.error(parsed.error || 'No se importó nada.')
      return
    }
    try {
      const list = await window.api.upsertLearningPath({
        ...(curriculum ? { id: curriculum.id } : {}),
        title: parsed.path.title,
        coursePaths: parsed.path.courseIds,
        why: parsed.path.why,
        pace: parsed.path.pace,
        startId: parsed.path.startId,
        source: 'coach',
        coachKind: 'curriculum'
      })
      setPaths(list)
      setPaste('')
      toast.success('Currículo guardado. El avance se marca en el curso.')
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar la ruta.')
    }
  }

  const countFor = (id) => {
    if (id === 'research') return noteCount
    if (id === 'group') return playlistCount
    if (id === 'goals') return goals?.goal ? 1 : 0
    return curriculum ? 1 : 0
  }

  return (
    <div className="library-study library-study--workspace">
      <div className="library-study__nav-strip">
        <AppNav active="guide" onSelect={onNavigate} />
      </div>

      <div className="learning-paths">
        <aside className="learning-paths__list" aria-label="Tareas de la guía">
          <div className="learning-paths__list-bar">
            <h2>Guía</h2>
          </div>
          <ul>
            {JOBS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`learning-paths__item${item.id === jobId ? ' is-active' : ''}`}
                  onClick={() => setJobId(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="learning-paths__count">{countFor(item.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="learning-paths__detail">
          {loading ? (
            <p className="learning-paths__empty">Cargando…</p>
          ) : (
            <>
              <div className="learning-paths__empty-detail">
                <h2>{job.label}</h2>
                <p>{job.hint}</p>
              </div>
              <p className="learning-paths__pace">{status}</p>

              <div className="field">
                <label htmlFor="guide-brief">Brief</label>
                <textarea id="guide-brief" readOnly rows={8} value={brief} />
              </div>
              <div className="learning-paths__detail-actions">
                <button type="button" className="btn btn--ghost" onClick={() => copyBrief(brief)}>
                  Copiar el brief
                </button>
              </div>

              <div className="field">
                <label htmlFor="guide-paste">Respuesta</label>
                <textarea
                  id="guide-paste"
                  rows={6}
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                  placeholder="Pega el JSON"
                />
              </div>
              <div className="learning-paths__detail-actions">
                <button type="button" className="btn btn--primary" onClick={() => void save()}>
                  Guardar
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default GuideView
