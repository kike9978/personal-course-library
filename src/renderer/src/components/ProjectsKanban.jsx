import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { STATUS_OPTIONS, statusLabel } from './ProjectPanel'
import AppNav from './AppNav'

const COLUMNS = STATUS_OPTIONS.map((opt) => ({
  id: opt.value,
  title: opt.label
}))

function ProjectDiamondIcon() {
  return (
    <svg className="kanban-card__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProjectsKanban({ courses, onNavigate, onOpenCourse }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [courseFilter, setCourseFilter] = useState('')
  const [query, setQuery] = useState('')
  const [draggingId, setDraggingId] = useState(null)
  const [dropColumn, setDropColumn] = useState(null)

  const catalogKey = useMemo(
    () => [...courses.map((course) => course.path)].sort().join('\0'),
    [courses]
  )
  const catalogKeyRef = useRef(null)

  const titleByPath = useMemo(() => {
    const map = {}
    courses.forEach((c) => {
      map[c.path] = c.title || c.path
    })
    return map
  }, [courses])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.listAllProjects()
      setItems(list || [])
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los proyectos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (catalogKeyRef.current === null) {
      catalogKeyRef.current = catalogKey
      return
    }
    if (catalogKeyRef.current === catalogKey) return
    catalogKeyRef.current = catalogKey
    load()
  }, [catalogKey, load])

  const coursesWithProjects = useMemo(() => {
    const paths = new Set(items.map((p) => p.coursePath))
    return courses
      .filter((c) => paths.has(c.path))
      .sort((a, b) =>
        (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
      )
  }, [courses, items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (courseFilter && item.coursePath !== courseFilter) return false
      if (!q) return true
      const courseTitle = (titleByPath[item.coursePath] || item.coursePath || '').toLowerCase()
      const hay = [item.title, item.notes, item.coursePath, courseTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, courseFilter, query, titleByPath])

  const byStatus = useMemo(() => {
    const map = { todo: [], in_progress: [], done: [] }
    for (const item of filtered) {
      const status = COLUMNS.some((c) => c.id === item.status) ? item.status : 'todo'
      map[status].push(item)
    }
    return map
  }, [filtered])

  const moveProject = async (project, nextStatus) => {
    if (!project || project.status === nextStatus) return
    const prev = items
    setItems((list) =>
      list.map((p) =>
        p.id === project.id && p.coursePath === project.coursePath
          ? { ...p, status: nextStatus, updatedAt: Date.now() }
          : p
      )
    )
    try {
      await window.api.upsertProject(project.coursePath, {
        id: project.id,
        status: nextStatus
      })
    } catch (err) {
      setItems(prev)
      toast.error(err.message || 'No se pudo mover el proyecto')
    }
  }

  const handleDragStart = (event, project) => {
    event.dataTransfer.setData(
      'application/x-project',
      JSON.stringify({ id: project.id, coursePath: project.coursePath })
    )
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(`${project.coursePath}:${project.id}`)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropColumn(null)
  }

  const handleDragOver = (event, columnId) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropColumn !== columnId) setDropColumn(columnId)
  }

  const handleDragLeave = (event, columnId) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      if (dropColumn === columnId) setDropColumn(null)
    }
  }

  const handleDrop = (event, columnId) => {
    event.preventDefault()
    setDropColumn(null)
    setDraggingId(null)
    let payload
    try {
      payload = JSON.parse(event.dataTransfer.getData('application/x-project') || '{}')
    } catch {
      return
    }
    const project = items.find((p) => p.id === payload.id && p.coursePath === payload.coursePath)
    if (project) moveProject(project, columnId)
  }

  const handleOpen = (project) => {
    const course = courses.find((c) => c.path === project.coursePath)
    if (!course) {
      toast.error('Curso no encontrado en la biblioteca')
      return
    }
    onOpenCourse(course, { projectId: project.id })
  }

  const openFolder = async (event, project) => {
    event.stopPropagation()
    if (!project.linkedFolderPath || project.linkMissing) {
      toast.error(project.linkMissing ? 'La carpeta vinculada no existe' : 'Sin carpeta vinculada')
      return
    }
    try {
      await window.api.openProjectLink(project.coursePath, project.id)
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir')
    }
  }

  return (
    <div className="projects-kanban">
      <header className="projects-kanban__header">
        <div className="projects-kanban__brand">
          <h1>Proyectos</h1>
          <AppNav active="projects" onSelect={onNavigate} />
        </div>
        <div className="projects-kanban__filters">
          <div className="chip-select">
            <label htmlFor="kanban-course-filter">Curso</label>
            <select
              id="kanban-course-filter"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {coursesWithProjects.map((course) => (
                <option key={course.path} value={course.path}>
                  {course.title || course.path}
                </option>
              ))}
            </select>
          </div>
          <div className="search-field projects-kanban__search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto…"
              aria-label="Buscar proyectos"
              title="Buscar (Ctrl+F)"
            />
          </div>
        </div>
      </header>

      <div className="projects-kanban__board" role="list">
        {loading ? (
          <p className="projects-kanban__empty">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="projects-kanban__empty">
            Aún no hay proyectos. Abre un curso y usa + Proyecto en el árbol.
          </p>
        ) : (
          COLUMNS.map((column) => {
            const columnItems = byStatus[column.id] || []
            return (
              <section
                key={column.id}
                className={`kanban-column${dropColumn === column.id ? ' is-drop-target' : ''}`}
                aria-label={column.title}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={(e) => handleDragLeave(e, column.id)}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <header className="kanban-column__header">
                  <h2>{column.title}</h2>
                  <span className="kanban-column__count">{columnItems.length}</span>
                </header>
                <div className="kanban-column__list">
                  {columnItems.length === 0 ? (
                    <p className="kanban-column__empty">Suelta aquí</p>
                  ) : (
                    columnItems.map((project) => {
                      const key = `${project.coursePath}:${project.id}`
                      const isDragging = draggingId === key
                      return (
                        <article
                          key={key}
                          className={`kanban-card is-${project.status || 'todo'}${
                            isDragging ? ' is-dragging' : ''
                          }${project.linkMissing ? ' is-broken' : ''}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, project)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleOpen(project)}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`${project.title}, ${statusLabel(project.status)}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleOpen(project)
                            }
                          }}
                        >
                          <div className="kanban-card__top">
                            <ProjectDiamondIcon />
                            <span className="kanban-card__title">{project.title}</span>
                          </div>
                          <div className="kanban-card__course">
                            {titleByPath[project.coursePath] || project.coursePath}
                          </div>
                          {project.notes ? (
                            <p className="kanban-card__notes">{project.notes}</p>
                          ) : null}
                          <div className="kanban-card__actions">
                            {project.linkedFolderPath ? (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={(e) => openFolder(e, project)}
                              >
                                {project.linkMissing ? 'Vínculo roto' : 'Abrir carpeta'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpen(project)
                              }}
                            >
                              Abrir en curso
                            </button>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

export default ProjectsKanban
