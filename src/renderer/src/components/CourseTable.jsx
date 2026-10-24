import { useEffect, useState } from 'react'
import { getInstitutionLogo, getCoverFallback, absoluteAssetUrl } from '../utils/images'
import brandMark from '../assets/img/brand-mark.svg'
import { courseViewedAt, formatCourseDate } from '../utils/courseTable'

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
      <div className="cover-placeholder course-table__thumb-fallback">
        <img src={brandMark} alt="" width={18} height={18} />
      </div>
    )
  }
  return (
    <img
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
  if (!column.kind) return <span className="course-table__label">{column.label}</span>
  const active = columnSort?.key === column.key
  const arrow = !active ? '' : columnSort.dir === 'asc' ? ' ↑' : ' ↓'
  return (
    <button
      type="button"
      className={`course-table__sort${active ? ' is-active' : ''}`}
      onClick={() => onColumnSort(column.key, column.kind)}
    >
      {column.label}
      {arrow}
    </button>
  )
}

function ColumnFilter({ column, filters, onColumnFilter, institutions, programs, themes }) {
  if (!column.filter) return null
  const value = filters[column.filterKey] ?? ''
  const set = (next) => onColumnFilter(column.filterKey, next)

  if (column.filter === 'text') {
    return (
      <input
        className="course-table__filter"
        type="search"
        value={value}
        placeholder="Filtrar"
        aria-label={`Filtrar ${column.label}`}
        onChange={(event) => set(event.target.value)}
      />
    )
  }

  if (column.filter === 'select') {
    const options =
      column.filterKey === 'institution'
        ? institutions
        : column.filterKey === 'program'
          ? programs
          : themes
    return (
      <select
        className="course-table__filter"
        value={value}
        aria-label={`Filtrar ${column.label}`}
        onChange={(event) => set(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    )
  }

  if (column.filter === 'rate') {
    return (
      <select
        className="course-table__filter"
        value={value}
        aria-label="Valoración mínima"
        onChange={(event) => set(Number(event.target.value))}
      >
        <option value={0}>Todas</option>
        <option value={3}>3+</option>
        <option value={4}>4+</option>
        <option value={5}>5</option>
      </select>
    )
  }

  if (column.filter === 'status') {
    return (
      <select
        className="course-table__filter"
        value={value}
        aria-label="Filtrar estado"
        onChange={(event) => set(event.target.value)}
      >
        <option value="">Todos</option>
        <option value="inProcess">En curso</option>
        <option value="recent">Reciente</option>
        <option value="new">Nuevo</option>
        <option value="completed">Completado</option>
        <option value="missing">Sin props</option>
      </select>
    )
  }

  return (
    <select
      className="course-table__filter"
      value={value}
      aria-label={`Filtrar ${column.label}`}
      onChange={(event) => set(event.target.value)}
    >
      <option value="">Todas</option>
      <option value="yes">Con fecha</option>
      <option value="no">Sin fecha</option>
    </select>
  )
}

function StatusCell({ course }) {
  return (
    <div className="course-table__status">
      {course.isInProcess ? (
        <span className="status-ribbon status-ribbon--inline">En curso</span>
      ) : null}
      {course.learning?.isRecentlyViewed ? (
        <span className="status-ribbon status-ribbon--inline status-ribbon--recent">Reciente</span>
      ) : null}
      {course.isNew ? <span className="badge badge--new">Nuevo</span> : null}
      {course.learning?.status === 'completed' ? (
        <span className="badge badge--done">Completado</span>
      ) : null}
      {course.missingProps ? <span className="badge badge--warn">Sin props</span> : null}
    </div>
  )
}

function ChipList({ items, className }) {
  const list = items || []
  if (!list.length) return '—'
  const shown = list.slice(0, 2)
  const extra = list.length - shown.length
  return (
    <div className="course-table__chips">
      {shown.map((item, index) => (
        <span key={`${item}-${index}`} className={className}>
          {item}
        </span>
      ))}
      {extra > 0 ? <span className="course-table__more">+{extra}</span> : null}
    </div>
  )
}

function DateCell({ ms }) {
  return <time dateTime={ms ? new Date(ms).toISOString() : undefined}>{formatCourseDate(ms)}</time>
}

function TableRow({
  course,
  isSelected,
  tabIndex,
  onSelect,
  onOpenCourse,
  onOpenModal,
  onToggleInProcess,
  onError
}) {
  const [isInProcess, setIsInProcess] = useState(Boolean(course.isInProcess))
  const institutionImg = absoluteAssetUrl(getInstitutionLogo(course.institution))
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
      className={`course-table__row${isSelected ? ' is-selected' : ''}`}
      data-course-path={course.path}
      tabIndex={tabIndex ?? -1}
      onClick={() => onSelect?.(course)}
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
      <td className="course-table__cover">
        <div className="course-table__thumb">
          <Thumb coursePath={course.path} hasCover={course.hasCover} />
        </div>
      </td>
      <td>
        <div className="course-table__title" title={course.title}>
          {course.title}
        </div>
      </td>
      <td>
        <div className="course-table__academy">
          {institutionImg ? (
            <img
              className="institution-logo"
              src={institutionImg}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          <span>{course.institution || '—'}</span>
        </div>
      </td>
      <td>{course.instructor || '—'}</td>
      <td>
        <ChipList items={course.programs} className="badge badge--programs" />
      </td>
      <td>
        <ChipList items={course.theme} className="badge badge--theme" />
      </td>
      <td className="course-table__num">
        {course.rate > 0 ? (
          <span className="course-card__rate">{'★'.repeat(course.rate)}</span>
        ) : (
          '—'
        )}
      </td>
      <td className="course-table__num">
        {percent == null ? (
          '—'
        ) : (
          <span className="course-table__progress" title={course.learning?.lastLessonTitle || ''}>
            {percent}%
          </span>
        )}
      </td>
      <td>
        <StatusCell course={course} />
      </td>
      <td className="course-table__date">
        <DateCell ms={course.addedAt} />
      </td>
      <td className="course-table__date">
        <DateCell ms={course.folderMtimeMs} />
      </td>
      <td className="course-table__date">
        <DateCell ms={viewedAt} />
      </td>
      <td>
        <div className="course-row__actions">
          <button
            type="button"
            className="card-action"
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
            className="card-action"
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
            className="card-action"
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
            className="card-action"
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
  onSelectCourse,
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
    <div className="course-table-wrap">
      <table className="course-table">
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = columnSort?.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
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
                    className={`course-table__head${column.filter ? '' : ' course-table__head--plain'}`}
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
              <td className="course-table__empty" colSpan={COLUMNS.length}>
                Ningún curso coincide con estos filtros.
              </td>
            </tr>
          ) : (
            courses.map((course, index) => (
              <TableRow
                key={course.path}
                course={course}
                isSelected={selectedPath === course.path}
                tabIndex={focusIndex === index ? 0 : -1}
                onSelect={onSelectCourse}
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
