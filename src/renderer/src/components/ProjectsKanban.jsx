import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { STATUS_OPTIONS, statusLabel } from './ProjectPanel'
import { Search } from 'lucide-react'
import AppHeader from './AppHeader'
import CierreComposer, { suggestProjectCierre } from './CierreComposer'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  pageShell,
  searchIcon,
  searchInput,
  selectControl
} from '../ui/classes'

const cardAction = cn(btnGhost, btnCompact)

const COLUMNS = STATUS_OPTIONS.map((opt) => ({
  id: opt.value,
  title: opt.label
}))

function ProjectDiamondIcon() {
  return (
    <svg className="size-[0.9rem] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
  const [cierreDraft, setCierreDraft] = useState(null)

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

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const list = await window.api.listAllProjects()
      setItems(list || [])
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los proyectos')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return window.api.onProjectsChanged?.(() => {
      void load({ quiet: true })
    })
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
      return
    }
    if (nextStatus === 'done' && project.status !== 'done') {
      const subject = {
        coursePath: project.coursePath,
        projectId: project.id,
        projectTitle: project.title,
        sectionId: project.sectionId || null,
        lessonRelativePath: project.fileRelativePath || null,
        title: project.title || ''
      }
      if (await suggestProjectCierre(subject)) setCierreDraft(subject)
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
    <div className={pageShell}>
      <AppHeader
        active="projects"
        onNavigate={onNavigate}
        center={
          <div className="relative w-full max-w-[22rem]">
            <Search className={searchIcon} aria-hidden="true" />
            <input
              type="search"
              data-search-field=""
              className={searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto…"
              aria-label="Buscar proyectos"
              title="Buscar (Ctrl+F)"
            />
          </div>
        }
        actions={
          <label className="inline-flex items-center gap-2 text-xs text-ink-soft" htmlFor="kanban-course-filter">
            Curso
            <select
              id="kanban-course-filter"
              className={cn(selectControl, 'max-w-[16rem]')}
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
          </label>
        }
      />

      <div
        className="grid min-h-0 flex-1 grid-cols-3 gap-[0.85rem] overflow-auto px-5 pt-4 pb-5 max-[900px]:grid-cols-1"
        role="list"
      >
        {loading ? (
          <p className="col-span-full mx-auto mt-12 text-center text-ink-soft">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="col-span-full mx-auto mt-12 text-center text-ink-soft">
            Aún no hay proyectos. Abre un curso y usa + Proyecto en el árbol.
          </p>
        ) : (
          COLUMNS.map((column) => {
            const columnItems = byStatus[column.id] || []
            return (
              <section
                key={column.id}
                className={cn(
                  'flex min-h-0 min-w-0 flex-col rounded-lg border border-transparent bg-ink/[0.035] transition-[border-color,background-color] duration-150',
                  dropColumn === column.id && 'border-coral/40 border-dashed bg-coral-soft/70'
                )}
                aria-label={column.title}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={(e) => handleDragLeave(e, column.id)}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <header className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
                  <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        column.id === 'in_progress'
                          ? 'bg-coral'
                          : column.id === 'done'
                            ? 'bg-teal'
                            : 'bg-ink/25'
                      )}
                      aria-hidden="true"
                    />
                    {column.title}
                  </h2>
                  <span className="rounded-full bg-ink/6 px-2 py-px text-xs font-medium text-ink-soft tabular-nums">
                    {columnItems.length}
                  </span>
                </header>
                <div className="flex min-h-[6rem] flex-1 flex-col gap-2 overflow-auto px-2 pb-2">
                  {columnItems.length === 0 ? (
                    <p className="rounded-md border border-dashed border-ink/14 px-4 py-6 text-center text-sm text-ink-faint">
                      Suelta aquí
                    </p>
                  ) : (
                    columnItems.map((project) => {
                      const key = `${project.coursePath}:${project.id}`
                      const isDragging = draggingId === key
                      return (
                        <article
                          key={key}
                          className={cn(
                            'flex cursor-grab flex-col gap-1.5 rounded-md border border-ink/8 bg-surface px-3.5 pt-3 pb-3 text-ink shadow-card select-none transition-[transform,box-shadow,opacity,border-color] duration-150 ease-pop hover:-translate-y-px hover:border-ink/12 hover:shadow-lift focus-visible:shadow-[var(--shadow-ring-soft),var(--shadow-lift)] focus-visible:outline-none [&_svg]:size-[0.9rem] [&_svg]:shrink-0',
                            (project.status || 'todo') === 'in_progress'
                              ? '[&_svg]:text-coral'
                              : (project.status || 'todo') === 'done'
                                ? '[&_svg]:text-teal'
                                : '[&_svg]:text-ink-faint',
                            isDragging && 'cursor-grabbing opacity-45'
                          )}
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
                          <div className="flex min-w-0 items-center gap-[0.45rem]">
                            <ProjectDiamondIcon />
                            <span className="min-w-0 flex-1 truncate text-base leading-snug font-semibold text-ink">
                              {project.title}
                            </span>
                          </div>
                          <div className="truncate text-xs text-ink-soft">
                            {titleByPath[project.coursePath] || project.coursePath}
                          </div>
                          {project.notes ? (
                            <p className="m-0 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                              {project.notes}
                            </p>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {project.linkedFolderPath ? (
                              <button
                                type="button"
                                className={cn(
                                  cardAction,
                                  project.linkMissing &&
                                    'border-warn-border bg-warn text-warn-text enabled:hover:bg-warn'
                                )}
                                onClick={(e) => openFolder(e, project)}
                              >
                                {project.linkMissing ? 'Vínculo roto' : 'Abrir carpeta'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={cardAction}
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
      <CierreComposer
        open={Boolean(cierreDraft)}
        initial={cierreDraft}
        courses={courses}
        onClose={() => setCierreDraft(null)}
      />
    </div>
  )
}

export default ProjectsKanban
