import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { getCoverFallback, absoluteAssetUrl } from '../utils/images'
import { InstitutionMark } from './InstitutionMark'
import CoursePickBox from './CoursePickBox'
import ExcitementGauge, { EXCITEMENT_LEVELS } from './ExcitementGauge'
import brandMark from '../assets/img/brand-mark.svg'
import { courseViewedAt, formatCourseDate } from '../utils/courseTable'
import { cn } from '../ui/cn'
import { cardLg } from '../ui/classes'

const badge = 'rounded-full border px-[0.55rem] py-[0.18rem] text-[0.7rem] font-bold'
const badgeNew = cn(badge, 'border-[#1a6b5c] bg-[#d8f3ec] text-[#0f4a40]')
const badgeWarn = cn(badge, 'border-[#a66b1a] bg-[#ffe8c2] text-[#6b4508]')
const badgePrograms = cn(
  badge,
  'border-chip-programs-border bg-chip-programs text-chip-programs-text'
)
const badgeTheme = cn(badge, 'border-[#5a4a7a] bg-[#ece6f7] text-[#3d3258]')
const badgeDone = cn(badge, 'border-chip-status-border bg-chip-status text-chip-status-text')
const ribbon =
  'static rounded-full border border-chip-status-border bg-chip-status px-[0.65rem] py-[0.28rem] text-[0.7rem] font-extrabold tracking-[0.03em] text-chip-status-text uppercase'
const ribbonRecent = 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
const cell =
  'border-b border-ink/10 px-[0.55rem] py-[0.45rem] text-left align-middle whitespace-nowrap'
const headCell = cn(cell, 'sticky top-0 z-[2] bg-cream align-top')
const filterControl =
  'w-full min-w-0 rounded-sm border border-ink/10 bg-surface px-[0.4rem] py-[0.22rem] text-xs text-ink focus:shadow-[0_0_0_2px_rgba(232,69,112,0.28)] focus:outline-none'
const cardAction =
  'grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-ink/10 bg-surface shadow-card hover:bg-coral hover:text-white'

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
  { key: 'excitement', label: 'Emoción', kind: 'number', filter: 'excitement', filterKey: 'minExcitement' },
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
      <span className="text-[0.68rem] font-extrabold tracking-[0.04em] text-ink-soft uppercase">
        {column.label}
      </span>
    )
  const active = columnSort?.key === column.key
  const arrow = !active ? '' : columnSort.dir === 'asc' ? ' ↑' : ' ↓'
  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer border-0 bg-transparent p-0 text-left text-[0.68rem] font-extrabold tracking-[0.04em] text-ink-soft uppercase',
        active && 'text-coral-deep'
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
                      'block w-full cursor-pointer truncate rounded-[8px] border-0 bg-transparent px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-ink/5',
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
        label="Emoción"
        value={value}
        options={[
          { value: 0, label: 'Todas' },
          ...EXCITEMENT_LEVELS.map((item) => ({ value: item.level, label: item.label }))
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
  if (!list.length) return '—'
  const shown = list.slice(0, 2)
  const extra = list.length - shown.length
  return (
    <div className="flex items-center gap-1">
      {shown.map((item, index) => (
        <span key={`${item}-${index}`} className={className}>
          {item}
        </span>
      ))}
      {extra > 0 ? <span className="text-[0.72rem] font-bold text-ink-soft">+{extra}</span> : null}
    </div>
  )
}

function DateCell({ ms }) {
  return <time dateTime={ms ? new Date(ms).toISOString() : undefined}>{formatCourseDate(ms)}</time>
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
        'cursor-pointer hover:bg-[#fff7f4] focus-visible:bg-[#fff7f4]',
        isSelected && 'bg-[#fff7f4] shadow-[inset_3px_0_0_#e84570]',
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
        <div className="h-10 w-16 overflow-hidden rounded-[8px] border border-ink/10 bg-cream-deep">
          <Thumb coursePath={course.path} hasCover={course.hasCover} />
        </div>
      </td>
      <td className={cell}>
        <div className="max-w-[18rem] truncate font-display font-extrabold" title={course.title}>
          {course.title}
        </div>
      </td>
      <td className={cell}>
        <div className="flex max-w-[10rem] items-center gap-[0.35rem] [&_span]:min-w-0 [&_span]:truncate">
          <InstitutionMark institution={course.institution} emptyLabel="—" />
        </div>
      </td>
      <td className={cell}>{course.instructor || '—'}</td>
      <td className={cell}>
        <ChipList items={course.programs} className={badgePrograms} />
      </td>
      <td className={cell}>
        <ChipList items={course.theme} className={badgeTheme} />
      </td>
      <td className={cn(cell, 'tabular-nums')}>
        {course.rate > 0 ? (
          <span className="text-xs tracking-[0.05em] text-coral-deep">
            {'★'.repeat(course.rate)}
          </span>
        ) : (
          '—'
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
          '—'
        ) : (
          <span className="font-bold text-teal" title={course.learning?.lastLessonTitle || ''}>
            {percent}%
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
        <div className="flex gap-[0.35rem]">
          <button
            type="button"
            className={cardAction}
            title={isInProcess ? 'Quitar de en curso' : 'Marcar en curso'}
            onMouseDown={stopRowEvent}
            onClick={toggleInProcess}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </button>
          <button
            type="button"
            className={cardAction}
            title="Abrir curso"
            onMouseDown={stopRowEvent}
            onClick={(event) => {
              stopRowEvent(event)
              onOpenCourse?.(course)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            type="button"
            className={cardAction}
            title="Abrir en explorador"
            onMouseDown={stopRowEvent}
            onClick={openFolder}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
          </button>
          <button
            type="button"
            className={cardAction}
            title="Editar"
            onMouseDown={stopRowEvent}
            onClick={(event) => {
              stopRowEvent(event)
              onOpenModal?.(course)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
            </svg>
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
      <table className="w-full min-w-[1280px] border-separate border-spacing-0 text-[0.84rem]">
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
                  'px-[0.8rem] py-[1.4rem] text-center whitespace-normal text-ink-soft'
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
