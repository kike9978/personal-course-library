import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, CircleCheck, FolderOpen, Pencil, Play } from 'lucide-react'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { InstitutionMark } from './InstitutionMark'
import CoursePickBox from './CoursePickBox'
import ExcitementGauge, { EXCITEMENT_LEVELS } from './ExcitementGauge'
import brandMark from '../assets/img/brand-mark.svg'
import { courseViewedAt, formatCourseDate } from '../utils/courseTable'
import { cn } from '../ui/cn'
import { badgeAccent, badgeSuccess, badgeTheme, badgeWarn, cardLg, iconOnly } from '../ui/classes'

const badgeNew = badgeSuccess
const badgeDone = badgeSuccess
const badgePrograms = badgeAccent
const ribbon = cn(badgeSuccess, 'uppercase tracking-[0.04em]')
const ribbonRecent = 'border-transparent bg-ink/70 text-white'
const cell = 'border-b border-ink/6 px-3 py-2 text-left align-middle whitespace-nowrap'
const headCell = cn(
  cell,
  'sticky top-0 z-[2] border-ink/10 bg-surface/95 pt-2.5 pb-2 align-top backdrop-blur-md'
)
const filterControl =
  'h-7 w-full min-w-0 rounded-xs border border-ink/10 bg-cream px-2 text-xs text-ink outline-none placeholder:text-ink-faint hover:border-ink/20 focus:border-coral/60 focus:bg-surface focus:shadow-focus'
const rowAction = cn(iconOnly, 'size-7 [&_svg]:size-4')
const EMPTY = (
  <span className="text-ink-faint/70" aria-label="Sin dato">
    –
  </span>
)

const COLUMNS = [
  { key: 'cover', label: '', filter: null },
  { key: 'title', label: 'Título', kind: 'text', filter: 'text', filterKey: 'title' },
  {
    key: 'institution',
    label: 'Academia',
    kind: 'text',
    filter: 'select',
    filterKey: 'institution'
  },
  {
    key: 'instructor',
    label: 'Instructor',
    kind: 'text',
    filter: 'text',
    filterKey: 'instructor'
  },
  { key: 'programs', label: 'Programas', kind: 'text', filter: 'select', filterKey: 'program' },
  { key: 'themes', label: 'Temas', kind: 'text', filter: 'select', filterKey: 'theme' },
  { key: 'rate', label: '★', kind: 'number', filter: 'rate', filterKey: 'minRate' },
  { key: 'excitement', label: 'Ganas', kind: 'number', filter: 'excitement', filterKey: 'minExcitement' },
  { key: 'progress', label: 'Progreso', kind: 'number', filter: null },
  { key: 'status', label: 'Estado', kind: 'number', filter: 'status', filterKey: 'status' },
  { key: 'added', label: 'Añadido', kind: 'date', filter: 'presence', filterKey: 'added' },
  {
    key: 'modified',
    label: 'Modificado',
    kind: 'date',
    filter: 'presence',
    filterKey: 'modified'
  },
  { key: 'viewed', label: 'Visto', kind: 'date', filter: 'presence', filterKey: 'viewed' },
  { key: 'actions', label: '', filter: null }
]

function stopRowEvent(event) {
  event.preventDefault()
  event.stopPropagation()
}

function Thumb({ coursePath, hasCover }) {
  const fallbackCover = absoluteAssetUrl(getCoverFallback())
  const [src, setSrc] = useState(fallbackCover)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!hasCover) {
      setSrc(fallbackCover)
      return undefined
    }
    let cancelled = false
    window.api
      .getCoverImageUrl(coursePath)
      .then((url) => {
        if (!cancelled && url) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc(fallbackCover)
      })
    return () => {
      cancelled = true
    }
  }, [coursePath, hasCover, fallbackCover])

  if (!hasCover || failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_30%,rgba(232,69,112,0.08),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(61,122,122,0.08),transparent_45%),var(--color-cream-deep)] text-ink-soft">
        <img
          className="!h-7 !w-7 max-h-7 max-w-7 !object-contain opacity-55"
          src={brandMark}
          alt=""
          width={18}
          height={18}
        />
      </div>
    )
  }
  return (
    <img
      className="block h-full w-full object-cover"
      src={src}
      alt=""
      onError={() => {
        setFailed(true)
        setSrc(fallbackCover)
      }}
    />
  )
}

function SortButton({ column, columnSort, onColumnSort }) {
  if (!column.kind)
    return (
      <span className="text-2xs font-semibold tracking-[0.06em] text-ink-soft uppercase">
        {column.label}
      </span>
    )
  const active = columnSort?.key === column.key
  const arrow = !active ? '' : columnSort.dir === 'asc' ? ' ↑' : ' ↓'
  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer border-0 bg-transparent p-0 text-left text-2xs font-semibold tracking-[0.06em] text-ink-soft uppercase hover:text-ink',
        active && 'text-ink'
      )}
      onClick={() => onColumnSort(column.key, column.kind)}
    >
      {column.label}
      {arrow}
    </button>
  )
}

function menuPosition(anchor) {
  const rect = anchor.getBoundingClientRect()
  const width = Math.max(rect.width, 148)
  const height = 240
  let left = rect.left
  let top = rect.bottom + 4
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
  if (left < 8) left = 8
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4)
  return { top, left, width }
}

function FilterMenu({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
    }
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return
      if (menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    const closeOnScroll = (event) => {
      if (menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open])

  const toggle = (event) => {
    event.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    if (rootRef.current) setPosition(menuPosition(rootRef.current))
    setOpen(true)
  }

  const pick = (event, next) => {
    event.stopPropagation()
    setOpen(false)
    onChange(next)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className={cn(filterControl, 'flex items-center justify-between gap-1 text-left')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={toggle}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ''}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label={label}
              className="fixed z-[80] max-h-60 overflow-auto rounded-md border border-ink/10 bg-surface p-1 shadow-panel"
              style={{ top: position.top, left: position.left, width: position.width }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {options.map((option) => {
                const isSelected = option.value === value
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'block w-full cursor-pointer truncate rounded-sm border-0 bg-transparent px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-ink/5',
                      isSelected && 'bg-ink/5'
                    )}
                    onClick={(event) => pick(event, option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

function ColumnFilter({ column, filters, onColumnFilter, institutions, programs, themes }) {
  if (!column.filter) return null
  const value = filters[column.filterKey] ?? ''
  const set = (next) => onColumnFilter(column.filterKey, next)

  if (column.filter === 'text') {
    return (
      <input
        className={filterControl}
        type="search"
        value={value}
        placeholder="Filtrar"
        aria-label={`Filtrar ${column.label}`}
        onChange={(event) => set(event.target.value)}
      />
    )
  }

  if (column.filter === 'select') {
    const names =
      column.filterKey === 'institution'
        ? institutions
        : column.filterKey === 'program'
          ? programs
          : themes
    return (
      <FilterMenu
        label={`Filtrar ${column.label}`}
        value={value}
        options={[
          { value: '', label: 'Todos' },
          ...names.map((name) => ({ value: name, label: name }))
        ]}
        onChange={set}
      />
    )
  }

  if (column.filter === 'rate') {
    return (
      <FilterMenu
        label="Valoración mínima"
        value={value}
        options={[
          { value: 0, label: 'Todas' },
          { value: 3, label: '3+' },
          { value: 4, label: '4+' },
          { value: 5, label: '5' }
        ]}
        onChange={set}
      />
    )
  }

  if (column.filter === 'excitement') {
    return (
      <FilterMenu
        label="Ganas"
        value={value}
        options={[
          { value: 0, label: 'Todas' },
          ...EXCITEMENT_LEVELS.map((item) => ({ value: item.level, label: item.filterLabel }))
        ]}
        onChange={set}
      />
    )
  }

  if (column.filter === 'status') {
    return (
      <FilterMenu
        label="Filtrar estado"
        value={value}
        options={[
          { value: '', label: 'Todos' },
          { value: 'inProcess', label: 'En curso' },
          { value: 'recent', label: 'Reciente' },
          { value: 'new', label: 'Nuevo' },
          { value: 'completed', label: 'Completado' },
          { value: 'missing', label: 'Sin props' }
        ]}
        onChange={set}
      />
    )
  }

  return (
    <FilterMenu
      label={`Filtrar ${column.label}`}
      value={value}
      options={[
        { value: '', label: 'Todas' },
        { value: 'yes', label: 'Con fecha' },
        { value: 'no', label: 'Sin fecha' }
      ]}
      onChange={set}
    />
  )
}

function StatusCell({ course }) {
  return (
    <div className="flex max-w-[12rem] flex-wrap gap-1 whitespace-normal">
      {course.isInProcess ? <span className={ribbon}>En curso</span> : null}
      {course.learning?.isRecentlyViewed ? (
        <span className={cn(ribbon, ribbonRecent)}>Reciente</span>
      ) : null}
      {course.isNew ? <span className={badgeNew}>Nuevo</span> : null}
      {course.learning?.status === 'completed' ? (
        <span className={badgeDone}>Completado</span>
      ) : null}
      {course.missingProps ? <span className={badgeWarn}>Sin props</span> : null}
    </div>
  )
}

function ChipList({ items, className }) {
  const list = items || []
  if (!list.length) return EMPTY
  const shown = list.slice(0, 2)
  const extra = list.length - shown.length
  return (
    <div className="flex items-center gap-1">
      {shown.map((item, index) => (
        <span key={`${item}-${index}`} className={className}>
          {item}
        </span>
      ))}
      {extra > 0 ? <span className="text-xs font-semibold text-ink-soft">+{extra}</span> : null}
    </div>
  )
}

function DateCell({ ms }) {
  if (!ms) return EMPTY
  return (
    <time className="text-ink-soft" dateTime={new Date(ms).toISOString()}>
      {formatCourseDate(ms)}
    </time>
  )
}

function TableRow({
  course,
  isSelected,
  isPicked = false,
  tabIndex,
  onSelect,
  onTogglePick,
  onOpenCourse,
  onOpenModal,
  onToggleInProcess,
  onError
}) {
  const [isInProcess, setIsInProcess] = useState(Boolean(course.isInProcess))
  const viewedAt = courseViewedAt(course)
  const percent =
    typeof course.learning?.percent === 'number' && course.learning.playableCount > 0
      ? course.learning.percent
      : null

  useEffect(() => {
    setIsInProcess(Boolean(course.isInProcess))
  }, [course.isInProcess])

  const toggleInProcess = async (event) => {
    stopRowEvent(event)
    const next = !isInProcess
    const previous = isInProcess
    setIsInProcess(next)
    try {
      await onToggleInProcess?.(course, next)
    } catch (error) {
      setIsInProcess(previous)
      onError?.(error)
    }
  }

  const openFolder = (event) => {
    stopRowEvent(event)
    window.api.openCourseFolder(course.path).catch((error) => onError?.(error))
  }

  return (
    <tr
      className={cn(
        'group/row cursor-pointer transition-colors duration-100 hover:bg-ink/[0.025] focus-visible:bg-ink/[0.025] focus-visible:outline-none',
        isSelected &&
          'bg-coral-soft/60 hover:bg-coral-soft/70 [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-coral)]',
        isPicked && 'outline outline-2 outline-offset-1 outline-coral'
      )}
      data-course-path={course.path}
      tabIndex={tabIndex ?? -1}
      onClick={(event) => {
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
          onTogglePick?.(course, { range: event.shiftKey })
          return
        }
        onSelect?.(course)
      }}
      onDoubleClick={() => onOpenCourse?.(course)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpenCourse?.(course)
        } else if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault()
          onOpenModal?.(course)
        } else if (event.key === ' ') {
          event.preventDefault()
          onSelect?.(course)
        }
      }}
    >
      <td className={cn(cell, 'w-10 text-center')}>
        <CoursePickBox
          checked={isPicked}
          label={`Seleccionar ${course.title || course.path}`}
          onPick={(pick) => onTogglePick?.(course, pick)}
        />
      </td>
      <td className={cell}>
        <div className="h-9 w-14 overflow-hidden rounded-xs bg-cream-deep ring-1 ring-ink/8">
          <Thumb coursePath={course.path} hasCover={course.hasCover} />
        </div>
      </td>
      <td className={cell}>
        <div className="max-w-[20rem] truncate font-medium text-ink" title={course.title}>
          {course.title}
        </div>
      </td>
      <td className={cell}>
        <div className="flex max-w-[10rem] items-center gap-[0.35rem] [&_span]:min-w-0 [&_span]:truncate">
          <InstitutionMark institution={course.institution} emptyLabel="–" />
        </div>
      </td>
      <td className={cn(cell, 'text-ink-soft')}>{course.instructor || EMPTY}</td>
      <td className={cell}>
        <ChipList items={course.programs} className={badgePrograms} />
      </td>
      <td className={cell}>
        <ChipList items={course.theme} className={badgeTheme} />
      </td>
      <td className={cn(cell, 'tabular-nums')}>
        {course.rate > 0 ? (
          <span className="text-xs tracking-[0.05em] text-coral" title={`${course.rate}/5`}>
            {'★'.repeat(course.rate)}
          </span>
        ) : (
          EMPTY
        )}
      </td>
      <td className={cell}>
        <ExcitementGauge
          coursePath={course.path}
          value={course.learning?.excitement || 0}
          onError={onError}
        />
      </td>
      <td className={cn(cell, 'tabular-nums')}>
        {percent == null ? (
          EMPTY
        ) : (
          <span
            className="flex items-center gap-2"
            title={course.learning?.lastLessonTitle || ''}
          >
            <span className="block h-1 w-12 overflow-hidden rounded-full bg-ink/8" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-teal"
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </span>
            <span className="text-xs font-medium text-ink-soft">{percent}%</span>
          </span>
        )}
      </td>
      <td className={cell}>
        <StatusCell course={course} />
      </td>
      <td className={cn(cell, 'tabular-nums')}>
        <DateCell ms={course.addedAt} />
      </td>
      <td className={cn(cell, 'tabular-nums')}>
        <DateCell ms={course.folderMtimeMs} />
      </td>
      <td className={cn(cell, 'tabular-nums')}>
        <DateCell ms={viewedAt} />
      </td>
      <td className={cell}>
        <div className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <button
            type="button"
            className={cn(rowAction, isInProcess && 'text-teal')}
            title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
            onMouseDown={stopRowEvent}
            onClick={toggleInProcess}
          >
            <CircleCheck aria-hidden="true" />
          </button>
          <button
            type="button"
            className={rowAction}
            title="Abrir curso"
            onMouseDown={stopRowEvent}
            onClick={(event) => {
              stopRowEvent(event)
              onOpenCourse?.(course)
            }}
          >
            <Play aria-hidden="true" />
          </button>
          <button
            type="button"
            className={rowAction}
            title="Abrir en explorador"
            onMouseDown={stopRowEvent}
            onClick={openFolder}
          >
            <FolderOpen aria-hidden="true" />
          </button>
          <button
            type="button"
            className={rowAction}
            title="Editar"
            onMouseDown={stopRowEvent}
            onClick={(event) => {
              stopRowEvent(event)
              onOpenModal?.(course)
            }}
          >
            <Pencil aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function CourseTable({
  courses,
  selectedPath,
  pickedPaths,
  onSelectCourse,
  onTogglePick,
  allVisiblePicked = false,
  someVisiblePicked = false,
  onToggleVisible,
  onOpenCourse,
  onOpenModal,
  onToggleInProcess,
  focusIndex,
  onError,
  columnSort,
  onColumnSort,
  columnFilters,
  onColumnFilter,
  institutions = [],
  programs = [],
  themes = []
}) {
  return (
    <div className={cn(cardLg, 'w-full overflow-x-auto')}>
      <table className="w-full min-w-[1280px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className={cn(headCell, 'w-10 text-center')}>
              <CoursePickBox
                checked={allVisiblePicked}
                indeterminate={someVisiblePicked && !allVisiblePicked}
                label="Seleccionar resultados"
                onPick={() => onToggleVisible?.()}
              />
            </th>
            {COLUMNS.map((column) => {
              const active = columnSort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={headCell}
                  aria-sort={
                    !column.kind
                      ? undefined
                      : active
                        ? columnSort.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                  }
                >
                  <div
                    className={cn(
                      'flex min-w-[6.5rem] flex-col items-stretch gap-[0.28rem]',
                      !column.filter && 'min-w-0'
                    )}
                  >
                    <SortButton
                      column={column}
                      columnSort={columnSort}
                      onColumnSort={onColumnSort}
                    />
                    <ColumnFilter
                      column={column}
                      filters={columnFilters}
                      onColumnFilter={onColumnFilter}
                      institutions={institutions}
                      programs={programs}
                      themes={themes}
                    />
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {courses.length === 0 ? (
            <tr>
              <td
                className={cn(
                  cell,
                  'px-4 py-10 text-center whitespace-normal text-ink-soft'
                )}
                colSpan={COLUMNS.length + 1}
              >
                Ningún curso coincide con estos filtros.
              </td>
            </tr>
          ) : (
            courses.map((course, index) => (
              <TableRow
                key={course.path}
                course={course}
                isSelected={selectedPath === course.path}
                isPicked={pickedPaths?.has(course.path)}
                tabIndex={focusIndex === index ? 0 : -1}
                onSelect={onSelectCourse}
                onTogglePick={onTogglePick}
                onOpenCourse={onOpenCourse}
                onOpenModal={onOpenModal}
                onToggleInProcess={onToggleInProcess}
                onError={onError}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
