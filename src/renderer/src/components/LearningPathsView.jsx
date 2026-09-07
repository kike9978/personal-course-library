import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AppNav from './AppNav'

/**
 * Ordered sets of courses (learning paths / tracks).
 */
function LearningPathsView({ courses = [], onNavigate, onOpenCourse }) {
  const [paths, setPaths] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [addCoursePath, setAddCoursePath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const titleByPath = useMemo(() => {
    const map = {}
    courses.forEach((c) => {
      map[c.path] = c.title || c.path
    })
    return map
  }, [courses])

  const sortedCourses = useMemo(
    () =>
      [...courses]
        .filter((c) => !c.missingProps || c.title)
        .sort((a, b) =>
          (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
        ),
    [courses]
  )

  const refresh = async () => {
    const list = await window.api.listLearningPaths()
    setPaths(list || [])
    return list || []
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .then((list) => {
        if (!cancelled && list[0]) setSelectedId(list[0].id)
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'No se pudieron cargar las rutas')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = useMemo(
    () => paths.find((p) => p.id === selectedId) || null,
    [paths, selectedId]
  )

  useEffect(() => {
    setDraftTitle(selected?.title || '')
    setAddCoursePath('')
  }, [selected?.id])

  const handleCreate = async () => {
    const title = window.prompt('Nombre de la ruta')
    if (!title?.trim()) return
    try {
      const list = await window.api.upsertLearningPath({ title: title.trim(), coursePaths: [] })
      setPaths(list)
      const created = list.find((p) => p.title === title.trim()) || list[0]
      if (created) setSelectedId(created.id)
      toast.success('Ruta creada')
    } catch (err) {
      toast.error(err.message || 'No se pudo crear')
    }
  }

  const handleSaveTitle = async () => {
    if (!selected) return
    const title = draftTitle.trim()
    if (!title) {
      toast.error('El título es obligatorio')
      return
    }
    setSaving(true)
    try {
      const list = await window.api.upsertLearningPath({ id: selected.id, title })
      setPaths(list)
      toast.success('Guardado')
    } catch (err) {
      toast.error(err.message || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const persistCourses = async (coursePaths) => {
    if (!selected) return
    const list = await window.api.upsertLearningPath({ id: selected.id, coursePaths })
    setPaths(list)
  }

  const handleAddCourse = async () => {
    if (!selected || !addCoursePath) return
    const next = [...(selected.coursePaths || [])]
    if (next.includes(addCoursePath)) {
      toast.error('Ya está en la ruta')
      return
    }
    next.push(addCoursePath)
    try {
      await persistCourses(next)
      setAddCoursePath('')
      toast.success('Curso añadido')
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  const handleRemove = async (coursePath) => {
    if (!selected) return
    try {
      await persistCourses((selected.coursePaths || []).filter((p) => p !== coursePath))
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  const handleMove = async (index, delta) => {
    if (!selected) return
    const list = [...(selected.coursePaths || [])]
    const next = index + delta
    if (next < 0 || next >= list.length) return
    ;[list[index], list[next]] = [list[next], list[index]]
    try {
      await persistCourses(list)
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!window.confirm(`¿Borrar la ruta “${selected.title}”?`)) return
    try {
      const list = await window.api.deleteLearningPath(selected.id)
      setPaths(list)
      setSelectedId(list[0]?.id || null)
      toast.success('Eliminada')
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  return (
    <div className="library-study library-study--workspace">
      <div className="library-study__nav-strip">
        <AppNav active="paths" onSelect={onNavigate} />
      </div>

      <div className="learning-paths">
        <aside className="learning-paths__list" aria-label="Rutas de aprendizaje">
          <div className="learning-paths__list-bar">
            <h2>Rutas</h2>
            <button type="button" className="btn btn--primary" onClick={handleCreate}>
              Nueva
            </button>
          </div>
          {loading ? (
            <p className="learning-paths__empty">Cargando…</p>
          ) : paths.length === 0 ? (
            <p className="learning-paths__empty">
              Crea una ruta ordenada de cursos (p. ej. fundamentos → práctica).
            </p>
          ) : (
            <ul>
              {paths.map((pathItem) => (
                <li key={pathItem.id}>
                  <button
                    type="button"
                    className={`learning-paths__item${
                      pathItem.id === selectedId ? ' is-active' : ''
                    }`}
                    onClick={() => setSelectedId(pathItem.id)}
                  >
                    <span>{pathItem.title}</span>
                    <span className="learning-paths__count">
                      {(pathItem.coursePaths || []).length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="learning-paths__detail">
          {!selected ? (
            <div className="learning-paths__empty-detail">
              <h2>Selecciona o crea una ruta</h2>
              <p>Ordena cursos en un recorrido personal de aprendizaje.</p>
            </div>
          ) : (
            <>
              <div className="learning-paths__detail-top">
                <input
                  className="learning-paths__title-input"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  aria-label="Título de la ruta"
                />
                <div className="learning-paths__detail-actions">
                  {draftTitle.trim() !== (selected.title || '') ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleSaveTitle}
                      disabled={saving}
                    >
                      Guardar título
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--ghost" onClick={handleDelete}>
                    Borrar ruta
                  </button>
                </div>
              </div>

              <div className="learning-paths__add">
                <select
                  value={addCoursePath}
                  onChange={(e) => setAddCoursePath(e.target.value)}
                  aria-label="Añadir curso"
                >
                  <option value="">Añadir curso…</option>
                  {sortedCourses.map((c) => (
                    <option key={c.path} value={c.path}>
                      {c.title || c.path}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleAddCourse}
                  disabled={!addCoursePath}
                >
                  Añadir
                </button>
              </div>

              <ol className="learning-paths__courses">
                {(selected.coursePaths || []).length === 0 ? (
                  <li className="learning-paths__empty">Aún no hay cursos en esta ruta.</li>
                ) : (
                  (selected.coursePaths || []).map((coursePath, index) => {
                    const course = courses.find((c) => c.path === coursePath)
                    return (
                      <li key={`${coursePath}-${index}`} className="learning-paths__course">
                        <span className="learning-paths__step">{index + 1}</span>
                        <div className="learning-paths__course-body">
                          <strong>{titleByPath[coursePath] || coursePath}</strong>
                          {course?.institution ? <span>{course.institution}</span> : null}
                        </div>
                        <div className="learning-paths__course-actions">
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => handleMove(index, -1)}
                            disabled={index === 0}
                            title="Subir"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => handleMove(index, 1)}
                            disabled={index === (selected.coursePaths || []).length - 1}
                            title="Bajar"
                          >
                            ↓
                          </button>
                          {course ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => onOpenCourse?.(course)}
                            >
                              Abrir
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => handleRemove(coursePath)}
                          >
                            Quitar
                          </button>
                        </div>
                      </li>
                    )
                  })
                )}
              </ol>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default LearningPathsView
