import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { STATUS_OPTIONS, statusLabel } from './ProjectPanel'
import AppNav from './AppNav'
import CierreComposer, { suggestProjectCierre } from './CierreComposer'
import { cn } from '../ui/cn'
import { btnGhost } from '../ui/classes'

const pageWash =
  'h-screen flex flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(232,69,112,0.05),transparent_40%),radial-gradient(circle_at_88%_8%,rgba(61,122,122,0.05),transparent_38%),var(--color-cream-deep)]'
const chipSelect =
  'inline-flex items-center gap-[0.35rem] [&_label]:text-[0.75rem] [&_label]:font-bold [&_label]:uppercase [&_label]:tracking-[0.04em] [&_label]:text-ink-soft [&_select]:border [&_select]:border-ink/10 [&_select]:rounded-full [&_select]:bg-surface [&_select]:px-3 [&_select]:py-[0.35rem] [&_select]:font-semibold [&_select]:text-[0.82rem] [&_select]:text-ink [&_select]:cursor-pointer [&_select]:shadow-none'
const searchField =
  'relative flex-1 min-w-[12rem] max-w-[420px] max-[900px]:min-w-0 [&_input]:w-full [&_input]:border [&_input]:border-ink/10 [&_input]:rounded-full [&_input]:bg-surface [&_input]:py-[0.7rem] [&_input]:pr-4 [&_input]:pl-[2.6rem] [&_input]:text-ink [&_input]:shadow-none [&_input]:outline-none [&_input]:transition-[box-shadow,transform] [&_input]:duration-[120ms] [&_input]:focus:shadow-find'
const cardAction = cn(
  btnGhost,
  'rounded-sm px-[0.65rem] py-[0.28rem] text-[0.72rem] font-bold shadow-none'
)

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
    <div className={pageWash}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 border-b border-ink/10 bg-surface-muted backdrop-blur-[10px]">
        <div className="flex min-w-0 flex-col gap-[0.2rem]">
          <h1 className="m-0 font-display text-[1.35rem] font-black tracking-[-0.02em] text-ink">
            Proyectos
          </h1>
          <AppNav active="projects" onSelect={onNavigate} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-[0.65rem] max-[900px]:ml-0 max-[900px]:w-full">
          <div className={chipSelect}>
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
          <div className={searchField}>
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
                  'flex min-h-0 min-w-0 flex-col rounded-lg border border-ink/10 bg-[rgba(255,255,255,0.62)] shadow-card transition-[border-color,box-shadow,background-color] duration-150',
                  dropColumn === column.id &&
                    'border-coral bg-[rgba(248,238,242,0.92)] shadow-[inset_0_0_0_1px_rgba(232,69,112,0.2),var(--shadow-card)]'
                )}
                aria-label={column.title}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={(e) => handleDragLeave(e, column.id)}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <header className="flex items-baseline justify-between gap-2 px-[0.95rem] pt-[0.8rem] pb-[0.55rem]">
                  <h2 className="m-0 font-display text-[0.72rem] font-extrabold tracking-[0.08em] text-ink-soft uppercase">
                    {column.title}
                  </h2>
                  <span className="rounded-full border border-ink/10 bg-cream-deep px-[0.45rem] py-[0.12rem] text-[0.72rem] font-bold text-ink-soft">
                    {columnItems.length}
                  </span>
                </header>
                <div className="flex min-h-[6rem] flex-1 flex-col gap-[0.65rem] overflow-auto px-[0.7rem] pb-[0.85rem]">
                  {columnItems.length === 0 ? (
                    <p className="mx-[0.1rem] my-[0.35rem] rounded-md border border-dashed border-ink/16 bg-white/35 px-[0.85rem] py-[1.35rem] text-center text-[0.8rem] text-ink-soft">
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
                            'flex cursor-grab flex-col gap-[0.4rem] rounded-md border border-ink/10 border-l-[3px] bg-surface px-[0.9rem] pt-[0.85rem] pb-[0.8rem] text-ink shadow-card select-none transition-[transform,box-shadow,opacity,border-color] duration-150 ease-[cubic-bezier(0.34,1.4,0.64,1),ease,ease,ease] hover:-translate-y-px hover:shadow-lift hover:outline-none focus-visible:-translate-y-px focus-visible:shadow-[0_0_0_2px_rgba(232,69,112,0.35),var(--shadow-lift)] focus-visible:outline-none [&_svg]:size-[0.9rem] [&_svg]:shrink-0',
                            (project.status || 'todo') === 'in_progress'
                              ? 'border-l-coral [&_svg]:text-coral'
                              : (project.status || 'todo') === 'done'
                                ? 'border-l-teal [&_svg]:text-teal'
                                : 'border-l-ink/28 [&_svg]:text-ink-soft',
                            project.linkMissing && 'border-coral/45 border-l-coral-deep',
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
                            <span className="min-w-0 flex-1 truncate font-display text-[0.95rem] leading-[1.25] font-extrabold text-ink">
                              {project.title}
                            </span>
                          </div>
                          <div className="truncate text-[0.75rem] font-semibold text-ink-soft">
                            {titleByPath[project.coursePath] || project.coursePath}
                          </div>
                          {project.notes ? (
                            <p className="m-0 line-clamp-2 text-[0.8rem] leading-[1.4] font-medium text-ink-soft">
                              {project.notes}
                            </p>
                          ) : null}
                          <div className="mt-[0.35rem] flex flex-wrap gap-[0.35rem] border-t border-ink/10 pt-[0.55rem]">
                            {project.linkedFolderPath ? (
                              <button
                                type="button"
                                className={cardAction}
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
