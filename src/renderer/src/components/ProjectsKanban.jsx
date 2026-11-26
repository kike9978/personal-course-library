import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { STATUS_OPTIONS, statusLabel } from './ProjectPanel'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Clock,
  Columns3,
  List,
  MoreHorizontal,
  Plus,
  Search
} from 'lucide-react'
import { findCierreForSubject } from '../../../shared/cierres.js'
import {
  WIP_LIMIT,
  completedAt,
  daysSince,
  groupByCompletionMonth,
  isStale,
  sortColumn,
  sortIndexBetween
} from '../../../shared/projects.js'
import NewProjectDialog from './NewProjectDialog'
import AppHeader from './AppHeader'
import CierreComposer, { suggestProjectCierre } from './CierreComposer'
import { cn } from '../ui/cn'
import {
  badgeWarn,
  btnCompact,
  btnGhost,
  btnPrimary,
  btnQuiet,
  chip,
  menuItem,
  pageShell,
  searchIcon,
  searchInput,
  segmented,
  segmentedItem,
  selectControl
} from '../ui/classes'

const cardAction = cn(btnGhost, btnCompact)
const VIEW_KEY = 'projects.view'
/** Months of finished work shown open in Hecho; older months start collapsed. */
const OPEN_MONTHS = 2

const COLUMNS = STATUS_OPTIONS.map((opt) => ({ id: opt.value, title: opt.label }))
const COLUMN_HINT = {
  todo: 'Ideas y prácticas por empezar',
  in_progress: 'Lo que estás haciendo ahora',
  paused: 'Aparcado, sin abandonar',
  done: 'Terminado'
}

const QUICK_FILTERS = [
  { id: 'stale', label: 'Estancados', test: (p) => isStale(p) },
  {
    id: 'nocierre',
    label: 'Sin cierre',
    test: (p, ctx) => p.status === 'done' && !ctx.hasCierre(p)
  },
  { id: 'broken', label: 'Vínculo roto', test: (p) => Boolean(p.linkMissing) }
]

function idleLabel(days) {
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 30) return `Hace ${days} días`
  const months = Math.floor(days / 30)
  return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`
}

function shortDate(at) {
  if (!at) return ''
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

function cierreSubjectFor(project) {
  return {
    coursePath: project.coursePath,
    projectId: project.id,
    projectTitle: project.title,
    sectionId: project.sectionId || null,
    lessonRelativePath: project.fileRelativePath || null,
    title: project.title || ''
  }
}

function keyOf(project) {
  return `${project.coursePath}:${project.id}`
}

function statusDot(status) {
  if (status === 'in_progress') return 'bg-coral'
  if (status === 'paused') return 'bg-warn-text/60'
  if (status === 'done') return 'bg-teal'
  return 'bg-ink/25'
}

function statusIconTone(status) {
  if (status === 'in_progress') return 'text-coral'
  if (status === 'paused') return 'text-warn-text'
  if (status === 'done') return 'text-teal'
  return 'text-ink-faint'
}

function ProjectDiamondIcon({ className }) {
  return (
    <svg
      className={cn('size-[0.9rem] shrink-0', className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Small "⋯" menu on a card: move, archive, open. */
function CardMenu({ project, onMove, onArchive, onOpen }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (fn) => (event) => {
    event.stopPropagation()
    setOpen(false)
    fn()
  }

  const status = project.status || 'todo'
  return (
    <div className="relative ml-auto" ref={rootRef}>
      <button
        type="button"
        className={cn(btnQuiet, 'size-7 px-0')}
        aria-label={`Acciones de ${project.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-[calc(100%+4px)] right-0 z-[6] min-w-[12rem] rounded-md border border-ink/8 bg-surface p-1 shadow-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="m-0 px-2.5 pt-1.5 pb-1 text-2xs font-semibold tracking-[0.05em] text-ink-faint uppercase">
            Mover a
          </p>
          {COLUMNS.filter((column) => column.id !== status).map((column) => (
            <button
              key={column.id}
              type="button"
              role="menuitem"
              className={cn(menuItem, 'flex-row items-center gap-2')}
              onClick={run(() => onMove(column.id))}
            >
              <span
                className={cn('size-2 rounded-full', statusDot(column.id))}
                aria-hidden="true"
              />
              {column.title}
            </button>
          ))}
          <hr className="mx-1.5 my-1 h-px border-0 bg-ink/8" />
          {status === 'done' ? (
            <button type="button" role="menuitem" className={menuItem} onClick={run(onArchive)}>
              {project.archivedAt ? 'Desarchivar' : 'Archivar'}
            </button>
          ) : null}
          <button type="button" role="menuitem" className={menuItem} onClick={run(onOpen)}>
            Abrir en curso
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ProjectsKanban({ courses, onNavigate, onOpenCourse }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [courseFilter, setCourseFilter] = useState('')
  const [query, setQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'
    } catch {
      return 'board'
    }
  })
  const [showArchived, setShowArchived] = useState(false)
  const [openMonths, setOpenMonths] = useState(() => new Set())
  const [draggingKey, setDraggingKey] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { column, beforeKey }
  const [cierreDraft, setCierreDraft] = useState(null)
  const [cierres, setCierres] = useState([])
  const [creating, setCreating] = useState(false)
  const focusAfterMove = useRef(null)

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

  const loadCierres = useCallback(async () => {
    try {
      setCierres((await window.api.listCierres()) || [])
    } catch {
      // Badges are a hint; the board still works without them.
    }
  }, [])

  useEffect(() => {
    void loadCierres()
    return window.api.onCierresChanged?.(() => {
      void loadCierres()
    })
  }, [loadCierres])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      // Preference only.
    }
  }, [view])

  // Keyboard moves remount the card in another column; put focus back on it.
  useEffect(() => {
    const key = focusAfterMove.current
    if (!key) return
    focusAfterMove.current = null
    requestAnimationFrame(() => {
      document.querySelector(`[data-card-key="${CSS.escape(key)}"]`)?.focus()
    })
  }, [items])

  const hasCierre = useCallback(
    (project) => Boolean(findCierreForSubject(cierres, cierreSubjectFor(project))),
    [cierres]
  )

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

  // Course + search scope; quick filters and archive are applied on top.
  const scoped = useMemo(() => {
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

  const quickCounts = useMemo(() => {
    const ctx = { hasCierre }
    const counts = {}
    for (const filter of QUICK_FILTERS) {
      counts[filter.id] = scoped.filter((p) => !p.archivedAt && filter.test(p, ctx)).length
    }
    return counts
  }, [scoped, hasCierre])

  // A quick filter that no longer matches anything turns itself off.
  useEffect(() => {
    if (quickFilter && !quickCounts[quickFilter]) setQuickFilter('')
  }, [quickFilter, quickCounts])

  const visible = useMemo(() => {
    const filter = QUICK_FILTERS.find((f) => f.id === quickFilter)
    const ctx = { hasCierre }
    return scoped.filter((p) => !filter || filter.test(p, ctx))
  }, [scoped, quickFilter, hasCierre])

  const archived = useMemo(() => visible.filter((p) => p.archivedAt), [visible])

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.id, []]))
    for (const item of visible) {
      if (item.archivedAt) continue
      const status = map[item.status] ? item.status : 'todo'
      map[status].push(item)
    }
    for (const id of Object.keys(map)) {
      if (id !== 'done') map[id] = sortColumn(map[id])
    }
    return map
  }, [visible])

  const doneMonths = useMemo(() => groupByCompletionMonth(byStatus.done), [byStatus.done])
  const archivableCount = useMemo(
    () => byStatus.done.filter((p) => hasCierre(p)).length,
    [byStatus.done, hasCierre]
  )

  const patchLocal = (project, patch) => {
    setItems((list) =>
      list.map((p) => (keyOf(p) === keyOf(project) ? { ...p, ...patch, updatedAt: Date.now() } : p))
    )
  }

  /** Change status and/or position. `sortIndex` undefined keeps the current one. */
  const moveProject = async (project, nextStatus, sortIndex) => {
    if (!project) return
    const statusChanged = (project.status || 'todo') !== nextStatus
    if (!statusChanged && sortIndex === undefined) return
    const prev = items
    const patch = { status: nextStatus }
    if (sortIndex !== undefined) patch.sortIndex = sortIndex
    if (nextStatus !== 'done') patch.archivedAt = null
    if (statusChanged) {
      patch.statusHistory = [
        ...(project.statusHistory || []),
        { status: nextStatus, at: Date.now() }
      ]
    }
    patchLocal(project, patch)
    try {
      await window.api.upsertProject(project.coursePath, {
        id: project.id,
        status: nextStatus,
        ...(sortIndex !== undefined ? { sortIndex } : {})
      })
    } catch (err) {
      setItems(prev)
      toast.error(err.message || 'No se pudo mover el proyecto')
      return
    }
    if (nextStatus === 'done' && statusChanged) {
      const subject = cierreSubjectFor(project)
      if (await suggestProjectCierre(subject)) setCierreDraft(subject)
    }
  }

  /** Index for landing in `column` right before `beforeKey` (or at the end). */
  const indexFor = (column, beforeKey, movingKey) => {
    if (column === 'done') return undefined
    const list = (byStatus[column] || []).filter((p) => keyOf(p) !== movingKey)
    const at = beforeKey ? list.findIndex((p) => keyOf(p) === beforeKey) : list.length
    const pos = at === -1 ? list.length : at
    return sortIndexBetween(list[pos - 1], list[pos])
  }

  const setArchived = async (project, archivedFlag) => {
    const prev = items
    patchLocal(project, { archivedAt: archivedFlag ? Date.now() : null })
    try {
      await window.api.upsertProject(project.coursePath, { id: project.id, archived: archivedFlag })
      toast.success(archivedFlag ? 'Archivado' : 'De vuelta en Hecho')
    } catch (err) {
      setItems(prev)
      toast.error(err.message || 'No se pudo archivar')
    }
  }

  const archiveClosed = async () => {
    const targets = byStatus.done.filter((p) => hasCierre(p))
    if (!targets.length) return
    const prev = items
    const keys = new Set(targets.map(keyOf))
    const now = Date.now()
    setItems((list) => list.map((p) => (keys.has(keyOf(p)) ? { ...p, archivedAt: now } : p)))
    try {
      for (const project of targets) {
        await window.api.upsertProject(project.coursePath, { id: project.id, archived: true })
      }
      toast.success(
        targets.length === 1 ? '1 proyecto archivado' : `${targets.length} proyectos archivados`
      )
    } catch (err) {
      setItems(prev)
      void load({ quiet: true })
      toast.error(err.message || 'No se pudo archivar')
    }
  }

  // ---- Drag and drop -------------------------------------------------------

  const handleDragStart = (event, project) => {
    event.dataTransfer.setData('application/x-project', keyOf(project))
    event.dataTransfer.effectAllowed = 'move'
    setDraggingKey(keyOf(project))
  }

  const handleDragEnd = () => {
    setDraggingKey(null)
    setDropTarget(null)
  }

  const setTarget = (column, beforeKey) => {
    setDropTarget((current) =>
      current?.column === column && current?.beforeKey === beforeKey
        ? current
        : { column, beforeKey }
    )
  }

  // The drop slot is the first card whose middle is below the pointer, so gaps between cards
  // keep a stable target. Hecho is ordered by completion date, so it only takes a status.
  const handleColumnDragOver = (event, column) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (column === 'done') {
      setTarget(column, null)
      return
    }
    let beforeKey = null
    for (const el of event.currentTarget.querySelectorAll('[data-card-key]')) {
      const rect = el.getBoundingClientRect()
      if (event.clientY < rect.top + rect.height / 2) {
        beforeKey = el.dataset.cardKey
        break
      }
    }
    setTarget(column, beforeKey)
  }

  const handleColumnDragLeave = (event, column) => {
    if (!event.currentTarget.contains(event.relatedTarget) && dropTarget?.column === column) {
      setDropTarget(null)
    }
  }

  const handleDrop = (event, column) => {
    event.preventDefault()
    const key = event.dataTransfer.getData('application/x-project')
    const beforeKey = dropTarget?.column === column ? dropTarget.beforeKey : null
    setDropTarget(null)
    setDraggingKey(null)
    const project = items.find((p) => keyOf(p) === key)
    if (!project) return
    if (beforeKey === key) return
    moveProject(project, column, indexFor(column, beforeKey, key))
  }

  // ---- Keyboard ------------------------------------------------------------

  const handleCardKeyDown = (event, project, column) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpen(project)
      return
    }
    if (!event.altKey) return
    const colIndex = COLUMNS.findIndex((c) => c.id === column)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const next = COLUMNS[colIndex + (event.key === 'ArrowLeft' ? -1 : 1)]
      if (!next) return
      focusAfterMove.current = keyOf(project)
      // Land at the top of the next column, where it is easy to see.
      const first = (byStatus[next.id] || [])[0]
      moveProject(project, next.id, indexFor(next.id, first ? keyOf(first) : null, keyOf(project)))
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && column !== 'done') {
      event.preventDefault()
      const list = byStatus[column] || []
      const i = list.findIndex((p) => keyOf(p) === keyOf(project))
      const swap = event.key === 'ArrowUp' ? i - 1 : i + 1
      if (i === -1 || swap < 0 || swap >= list.length) return
      // Without the card, slot `swap` sits between rest[swap - 1] and rest[swap].
      const rest = list.filter((_, idx) => idx !== i)
      focusAfterMove.current = keyOf(project)
      moveProject(project, column, sortIndexBetween(rest[swap - 1], rest[swap]))
    }
  }

  // ---- Navigation ----------------------------------------------------------

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

  const toggleMonth = (key, defaultOpen) => {
    setOpenMonths((current) => {
      const next = new Set(current)
      const token = defaultOpen ? `closed:${key}` : `open:${key}`
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })
  }

  const monthIsOpen = (key, index) => {
    const defaultOpen = index < OPEN_MONTHS || Boolean(quickFilter) || Boolean(query.trim())
    return defaultOpen ? !openMonths.has(`closed:${key}`) : openMonths.has(`open:${key}`)
  }

  // ---- Rendering -----------------------------------------------------------

  const renderMeta = (project) => {
    const status = project.status || 'todo'
    const idleDays = status === 'done' ? null : daysSince(project.updatedAt)
    const stale = isStale(project)
    const needsCierre = status === 'done' && !hasCierre(project)
    return (
      <>
        {idleDays != null ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-ink-faint',
              stale && 'font-semibold text-warn-text'
            )}
            title={`Último cambio: ${new Date(project.updatedAt).toLocaleDateString()}${
              stale ? ' · ¿Sigue en curso? Muévelo a En pausa si lo has aparcado.' : ''
            }`}
          >
            <Clock size={12} aria-hidden="true" />
            {idleLabel(idleDays)}
          </span>
        ) : null}
        {status === 'done' ? (
          <span className="text-ink-faint">Hecho el {shortDate(completedAt(project))}</span>
        ) : null}
        {needsCierre ? (
          <button
            type="button"
            className={cn(badgeWarn, 'cursor-pointer')}
            title="Escribe qué entregaste y qué aprendiste"
            onClick={(e) => {
              e.stopPropagation()
              setCierreDraft(cierreSubjectFor(project))
            }}
          >
            Sin cierre · Dar cierre
          </button>
        ) : null}
      </>
    )
  }

  const renderCard = (project, column) => {
    const key = keyOf(project)
    const status = project.status || 'todo'
    const showLineBefore =
      draggingKey &&
      draggingKey !== key &&
      dropTarget?.column === column &&
      dropTarget.beforeKey === key
    return (
      <div key={key} className="flex flex-col">
        {showLineBefore ? (
          <div className="mb-2 h-0.5 rounded-full bg-coral" aria-hidden="true" />
        ) : null}
        <article
          data-card-key={key}
          className={cn(
            'flex cursor-grab flex-col gap-1.5 rounded-md border border-ink/8 bg-surface px-3.5 pt-3 pb-3 text-ink shadow-card select-none transition-[transform,box-shadow,opacity,border-color] duration-150 ease-pop hover:-translate-y-px hover:border-ink/12 hover:shadow-lift focus-visible:shadow-[var(--shadow-ring-soft),var(--shadow-lift)] focus-visible:outline-none',
            draggingKey === key && 'cursor-grabbing opacity-45'
          )}
          draggable
          onDragStart={(e) => handleDragStart(e, project)}
          onDragEnd={handleDragEnd}
          onClick={() => handleOpen(project)}
          role="listitem"
          tabIndex={0}
          aria-label={`${project.title}, ${statusLabel(status)}`}
          aria-description="Alt + flechas para moverlo entre columnas o reordenarlo"
          onKeyDown={(e) => handleCardKeyDown(e, project, column)}
        >
          <div className="flex min-w-0 items-center gap-[0.45rem]">
            <ProjectDiamondIcon className={statusIconTone(status)} />
            <span className="min-w-0 flex-1 truncate text-base leading-snug font-semibold text-ink">
              {project.title}
            </span>
            <CardMenu
              project={project}
              onMove={(next) => {
                const first = (byStatus[next] || [])[0]
                moveProject(project, next, indexFor(next, first ? keyOf(first) : null, key))
              }}
              onArchive={() => setArchived(project, !project.archivedAt)}
              onOpen={() => handleOpen(project)}
            />
          </div>
          <div className="truncate text-xs text-ink-soft">
            {titleByPath[project.coursePath] || project.coursePath}
          </div>
          {project.notes ? (
            <p className="m-0 line-clamp-2 text-sm leading-relaxed text-ink-soft">
              {project.notes}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            {renderMeta(project)}
            {project.linkedFolderPath ? (
              <button
                type="button"
                className={cn(
                  cardAction,
                  'ml-auto',
                  project.linkMissing &&
                    'border-warn-border bg-warn text-warn-text enabled:hover:bg-warn'
                )}
                onClick={(e) => openFolder(e, project)}
              >
                {project.linkMissing ? 'Vínculo roto' : 'Abrir carpeta'}
              </button>
            ) : null}
          </div>
        </article>
      </div>
    )
  }

  const renderArchivedRow = (project) => (
    <li
      key={keyOf(project)}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-ink/4"
    >
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-ink-soft hover:text-ink"
        onClick={() => handleOpen(project)}
        title={titleByPath[project.coursePath] || project.coursePath}
      >
        {project.title}
      </button>
      <span className="shrink-0 text-2xs text-ink-faint">{shortDate(completedAt(project))}</span>
      <button
        type="button"
        className={cn(btnQuiet, 'size-6 px-0')}
        title="Volver a Hecho"
        aria-label={`Desarchivar ${project.title}`}
        onClick={() => setArchived(project, false)}
      >
        <ArchiveRestore size={14} aria-hidden="true" />
      </button>
    </li>
  )

  const renderDoneColumnBody = () => (
    <>
      {doneMonths.map((month, index) => {
        const isOpen = monthIsOpen(month.key, index)
        const defaultOpen = index < OPEN_MONTHS || Boolean(quickFilter) || Boolean(query.trim())
        return (
          <div key={month.key} className="flex flex-col gap-2">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1.5 pt-1 text-left text-2xs font-semibold tracking-[0.05em] text-ink-faint uppercase hover:text-ink"
              aria-expanded={isOpen}
              onClick={() => toggleMonth(month.key, defaultOpen)}
            >
              <ChevronDown
                size={12}
                aria-hidden="true"
                className={cn('transition-transform', !isOpen && '-rotate-90')}
              />
              {month.label}
              <span className="font-medium tabular-nums">· {month.items.length}</span>
            </button>
            {isOpen ? month.items.map((project) => renderCard(project, 'done')) : null}
          </div>
        )
      })}
      {archived.length ? (
        <div className="mt-1 border-t border-ink/8 pt-2">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1.5 text-left text-xs font-semibold text-ink-soft hover:text-ink"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive size={13} aria-hidden="true" />
            Archivados
            <span className="font-medium tabular-nums">· {archived.length}</span>
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={cn('ml-auto transition-transform', !showArchived && '-rotate-90')}
            />
          </button>
          {showArchived ? (
            <ul className="m-0 mt-1 list-none p-0">
              {[...archived]
                .sort((a, b) => (completedAt(b) || 0) - (completedAt(a) || 0))
                .map(renderArchivedRow)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  )

  const renderBoard = () => (
    <div className="grid min-h-0 flex-1 grid-cols-4 gap-[0.85rem] overflow-auto px-5 pt-3 pb-5 max-[1200px]:grid-cols-2 max-[700px]:grid-cols-1">
      {COLUMNS.map((column) => {
        const columnItems = byStatus[column.id] || []
        const missingCierres =
          column.id === 'done' ? columnItems.filter((p) => !hasCierre(p)).length : 0
        const overWip = column.id === 'in_progress' && columnItems.length > WIP_LIMIT
        const isDropColumn = dropTarget?.column === column.id
        const empty = columnItems.length === 0 && !(column.id === 'done' && archived.length)
        return (
          <section
            key={column.id}
            className={cn(
              'flex min-h-0 min-w-0 flex-col rounded-lg border border-transparent bg-ink/[0.035] transition-[border-color,background-color] duration-150',
              isDropColumn && 'border-dashed border-coral/40 bg-coral-soft/50'
            )}
            aria-label={column.title}
            onDragOver={(e) => handleColumnDragOver(e, column.id)}
            onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <header className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-2.5">
              <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-ink">
                <span
                  className={cn('size-2 rounded-full', statusDot(column.id))}
                  aria-hidden="true"
                />
                {column.title}
              </h2>
              <span className="rounded-full bg-ink/6 px-2 py-px text-xs font-medium text-ink-soft tabular-nums">
                {columnItems.length}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {overWip ? (
                  <span
                    className={badgeWarn}
                    title={`Tienes más de ${WIP_LIMIT} proyectos en curso. Termina o pausa alguno para avanzar más rápido.`}
                  >
                    Demasiados activos
                  </span>
                ) : null}
                {missingCierres > 0 ? (
                  <button
                    type="button"
                    className={cn(badgeWarn, 'cursor-pointer')}
                    title="Ver solo los hechos sin cierre"
                    onClick={() => setQuickFilter('nocierre')}
                  >
                    {missingCierres} sin cierre
                  </button>
                ) : null}
                {column.id === 'done' && archivableCount > 0 ? (
                  <button
                    type="button"
                    className={cn(btnQuiet, btnCompact, 'h-6 px-1.5')}
                    title="Archiva los proyectos hechos que ya tienen cierre"
                    onClick={archiveClosed}
                  >
                    <Archive size={13} aria-hidden="true" />
                    Archivar {archivableCount} con cierre
                  </button>
                ) : null}
              </span>
            </header>
            <div className="flex min-h-[6rem] flex-1 flex-col gap-2 overflow-auto px-2 pb-2">
              {empty ? (
                <p className="m-0 rounded-md border border-dashed border-ink/14 px-4 py-6 text-center text-sm text-ink-faint">
                  {COLUMN_HINT[column.id]}
                </p>
              ) : column.id === 'done' ? (
                renderDoneColumnBody()
              ) : (
                <>
                  {columnItems.map((project) => renderCard(project, column.id))}
                  {draggingKey && isDropColumn && dropTarget.beforeKey === null ? (
                    <div className="h-0.5 rounded-full bg-coral" aria-hidden="true" />
                  ) : null}
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )

  const listGroups = useMemo(() => {
    const groups = new Map()
    for (const project of visible) {
      if (project.archivedAt && !showArchived) continue
      if (!groups.has(project.coursePath)) groups.set(project.coursePath, [])
      groups.get(project.coursePath).push(project)
    }
    const order = { in_progress: 0, paused: 1, todo: 2, done: 3 }
    return [...groups.entries()]
      .map(([coursePath, list]) => ({
        coursePath,
        title: titleByPath[coursePath] || coursePath,
        items: list.sort(
          (a, b) =>
            (order[a.status] ?? 2) - (order[b.status] ?? 2) ||
            (b.updatedAt || 0) - (a.updatedAt || 0)
        )
      }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }, [visible, showArchived, titleByPath])

  const renderList = () => (
    <div className="min-h-0 flex-1 overflow-auto px-5 pt-3 pb-5">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-4">
        {listGroups.length === 0 ? (
          <p className="mt-10 text-center text-ink-soft">Nada que mostrar con estos filtros.</p>
        ) : null}
        {listGroups.map((group) => {
          const counts = COLUMNS.map((c) => ({
            ...c,
            n: group.items.filter((p) => (p.status || 'todo') === c.id && !p.archivedAt).length
          })).filter((c) => c.n)
          return (
            <section
              key={group.coursePath}
              className="rounded-lg border border-ink/8 bg-surface shadow-card"
            >
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink/8 px-4 py-2.5">
                <h2 className="m-0 min-w-0 truncate text-sm font-semibold text-ink">
                  {group.title}
                </h2>
                <span className="flex items-center gap-2.5 text-xs text-ink-soft">
                  {counts.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1">
                      <span
                        className={cn('size-1.5 rounded-full', statusDot(c.id))}
                        aria-hidden="true"
                      />
                      {c.n} {c.title.toLowerCase()}
                    </span>
                  ))}
                </span>
              </header>
              <ul className="m-0 list-none p-1">
                {group.items.map((project) => {
                  const status = project.status || 'todo'
                  return (
                    <li
                      key={keyOf(project)}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-3 py-2 hover:bg-ink/4',
                        project.archivedAt && 'opacity-60'
                      )}
                    >
                      <ProjectDiamondIcon className={statusIconTone(status)} />
                      <button
                        type="button"
                        className="min-w-[10rem] flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-ink hover:text-coral-deep"
                        onClick={() => handleOpen(project)}
                      >
                        {project.title}
                        {project.archivedAt ? (
                          <span className="ml-2 text-2xs font-medium text-ink-faint">
                            archivado
                          </span>
                        ) : null}
                      </button>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {renderMeta(project)}
                      </span>
                      <select
                        className={cn(selectControl, 'h-7 py-0 text-xs')}
                        value={status}
                        aria-label={`Estado de ${project.title}`}
                        onChange={(e) => moveProject(project, e.target.value)}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )

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
          <button
            type="button"
            className={cn(btnPrimary, btnCompact)}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} aria-hidden="true" />
            Nuevo proyecto
          </button>
        }
      />

      {loading ? (
        <p className="mx-auto mt-12 text-center text-ink-soft">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="mx-auto mt-12 flex flex-col items-center gap-3 text-center text-ink-soft">
          <p className="m-0">Aún no hay proyectos. Crea uno aquí o desde el árbol de un curso.</p>
          <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" />
            Nuevo proyecto
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
            <div className={segmented} role="group" aria-label="Vista">
              <button
                type="button"
                className={segmentedItem}
                aria-pressed={view === 'board'}
                onClick={() => setView('board')}
              >
                <Columns3 aria-hidden="true" />
                Tablero
              </button>
              <button
                type="button"
                className={segmentedItem}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List aria-hidden="true" />
                Por curso
              </button>
            </div>
            <select
              id="kanban-course-filter"
              aria-label="Filtrar por curso"
              className={cn(selectControl, 'h-9 max-w-[16rem]')}
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="">Todos los cursos</option>
              {coursesWithProjects.map((course) => (
                <option key={course.path} value={course.path}>
                  {course.title || course.path}
                </option>
              ))}
            </select>
            {QUICK_FILTERS.filter((f) => quickCounts[f.id] > 0 || quickFilter === f.id).map(
              (filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={chip}
                  aria-pressed={quickFilter === filter.id}
                  onClick={() => setQuickFilter((v) => (v === filter.id ? '' : filter.id))}
                >
                  {filter.label}
                  <span className="tabular-nums opacity-70">{quickCounts[filter.id]}</span>
                </button>
              )
            )}
            {view === 'list' && archived.length ? (
              <button
                type="button"
                className={cn(chip, 'ml-auto')}
                aria-pressed={showArchived}
                onClick={() => setShowArchived((v) => !v)}
              >
                <Archive size={13} aria-hidden="true" />
                Archivados
                <span className="tabular-nums opacity-70">{archived.length}</span>
              </button>
            ) : null}
          </div>
          {view === 'board' ? renderBoard() : renderList()}
        </>
      )}

      <CierreComposer
        open={Boolean(cierreDraft)}
        initial={cierreDraft}
        courses={courses}
        onClose={() => setCierreDraft(null)}
        onSaved={() => void loadCierres()}
      />
      {creating ? (
        <NewProjectDialog
          courses={courses}
          defaultCoursePath={courseFilter}
          onCreated={() => void load({ quiet: true })}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  )
}

export default ProjectsKanban
