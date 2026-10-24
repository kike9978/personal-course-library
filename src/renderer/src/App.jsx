import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import CoursesGrid from './components/CoursesGrid'
import CourseCard from './components/CourseCard'
import CourseEditModal from './components/CourseEditModal'
import ImportMissingPropsModal from './components/ImportMissingPropsModal'
import CoverSearchModal from './components/CoverSearchModal'
import CourseDetailPanel from './components/CourseDetailPanel'
import CourseRoom from './components/CourseRoom'
import LibraryStudyView from './components/LibraryStudyView'
import AnnotationsPopoutView from './components/AnnotationsPopoutView'
import ProjectsKanban from './components/ProjectsKanban'
import LearningPathsView from './components/LearningPathsView'
import GuideView from './components/GuideView'
import AppNav from './components/AppNav'
import ErrorBoundary from './components/ErrorBoundary'
import Loader from './components/Loader'
import { Toaster, toast } from 'react-hot-toast'
import brandMark from './assets/img/brand-mark.svg'
import { getAnnotationsWindowMode } from './utils/annotationsWindow'
import {
  EMPTY_COLUMN_FILTERS,
  compareCourses,
  hasColumnFilters,
  matchesColumnFilters,
  nextColumnSort
} from './utils/courseTable'

function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function LibrarySetup({ onPathSet }) {
  const [isPicking, setIsPicking] = useState(false)

  const handlePick = async () => {
    setIsPicking(true)
    try {
      const result = await window.api.pickLibraryFolder()
      if (!result.canceled && result.valid) {
        toast.success('Carpeta seleccionada')
        onPathSet(result.path)
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo configurar la carpeta')
    } finally {
      setIsPicking(false)
    }
  }

  return (
    <div className="library-setup">
      <img src={brandMark} alt="" width={72} height={72} className="library-setup__mark" />
      <h1>Catálogo de cursos</h1>
      <p>Elige la carpeta que contiene tus cursos para empezar.</p>
      <button type="button" className="icon-btn" onClick={handlePick} disabled={isPicking}>
        {isPicking ? 'Abriendo…' : 'Elegir carpeta'}
      </button>
    </div>
  )
}

function AppHeader({
  filterText,
  onFilterTextChange,
  isCardLayout,
  onCardLayoutChange,
  isInProcessOnly,
  onInProcessOnlyChange,
  isNewOnly,
  onNewOnlyChange,
  recentlyViewedOnly,
  onRecentlyViewedOnlyChange,
  missingPropsOnly,
  onMissingPropsOnlyChange,
  courseCount,
  isLoading,
  onRefresh,
  onChangeLibrary,
  onNavigate,
  institutions,
  programs,
  themes,
  institutionFilter,
  onInstitutionFilterChange,
  programFilter,
  onProgramFilterChange,
  themeFilter,
  onThemeFilterChange,
  minRate,
  onMinRateChange,
  sortMode,
  onSortModeChange
}) {
  return (
    <header className="app-header">
      <div className="app-header__top">
        <div className="brand">
          <div className="brand__mark">
            <img src={brandMark} alt="" />
          </div>
          <div className="brand__text">
            <h1 className="brand__title">Catálogo de cursos</h1>
            <AppNav active="library" onSelect={onNavigate} />
          </div>
        </div>

        <div className="search-field">
          <svg
            className="search-field__icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="search"
            value={filterText}
            placeholder="Buscar título, academia, instructor, temas, notas…"
            onChange={(e) => onFilterTextChange(e.target.value)}
            aria-label="Buscar"
          />
        </div>

        <div className="header-actions">
          <span className="count-badge" aria-live="polite">
            {courseCount} cursos
          </span>

          <div className="segmented" role="group" aria-label="Vista">
            <button
              type="button"
              aria-pressed={isCardLayout}
              onClick={() => onCardLayoutChange(true)}
            >
              Cards
            </button>
            <button
              type="button"
              aria-pressed={!isCardLayout}
              onClick={() => onCardLayoutChange(false)}
            >
              Lista
            </button>
          </div>

          <button
            type="button"
            className="filter-pill"
            aria-pressed={isInProcessOnly}
            onClick={() => onInProcessOnlyChange(!isInProcessOnly)}
          >
            En curso
          </button>

          <button
            type="button"
            className="filter-pill"
            aria-pressed={isNewOnly}
            onClick={() => onNewOnlyChange(!isNewOnly)}
            title="Carpetas añadidas en los últimos 14 días"
          >
            Nuevos
          </button>

          <button
            type="button"
            className="filter-pill"
            aria-pressed={recentlyViewedOnly}
            onClick={() => onRecentlyViewedOnlyChange(!recentlyViewedOnly)}
            title="Cursos abiertos en los últimos 14 días"
          >
            Recientes
          </button>

          <button
            type="button"
            className="filter-pill"
            aria-pressed={missingPropsOnly}
            onClick={() => onMissingPropsOnlyChange(!missingPropsOnly)}
          >
            Sin props
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refrescar (Ctrl+R)"
          >
            {isLoading ? '…' : 'Refrescar'}
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={onChangeLibrary}>
            Carpeta
          </button>
        </div>
      </div>

      <div className="app-header__filters">
        <div className="chip-select">
          <label htmlFor="sort-mode">Orden</label>
          <select
            id="sort-mode"
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value)}
          >
            <option value="az">A → Z</option>
            <option value="za">Z → A</option>
            <option value="recent">Recientes</option>
            <option value="added">Fecha de añadido</option>
            <option value="addedOldest">Añadidos primero</option>
            <option value="newest">Última modificación</option>
            <option value="rate">Mejor valorados</option>
            <option value="progress">Más progreso</option>
            <option value="inProgress">En curso primero</option>
          </select>
        </div>

        <div className="chip-select">
          <label htmlFor="institution-filter">Academia</label>
          <select
            id="institution-filter"
            value={institutionFilter}
            onChange={(e) => onInstitutionFilterChange(e.target.value)}
          >
            <option value="">Todas</option>
            {institutions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="chip-select">
          <label htmlFor="min-rate-filter">Mín. ★</label>
          <select
            id="min-rate-filter"
            value={minRate}
            onChange={(e) => onMinRateChange(Number(e.target.value))}
          >
            <option value={0}>Cualquiera</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5</option>
          </select>
        </div>

        <div className="filter-chips" role="group" aria-label="Programas">
          {programs.slice(0, 10).map((program) => (
            <button
              key={program}
              type="button"
              className="filter-chip"
              aria-pressed={programFilter === program}
              onClick={() => onProgramFilterChange(programFilter === program ? '' : program)}
            >
              {program}
            </button>
          ))}
        </div>

        {themes.length > 0 ? (
          <div className="filter-chips" role="group" aria-label="Temas">
            {themes.slice(0, 8).map((theme) => (
              <button
                key={theme}
                type="button"
                className="filter-chip filter-chip--theme"
                aria-pressed={themeFilter === theme}
                onClick={() => onThemeFilterChange(themeFilter === theme ? '' : theme)}
              >
                {theme}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function ContinueHub({ courses, onSelect, onOpenCourse, onOpenModal, onToggleInProcess }) {
  if (!courses.length) return null

  return (
    <section className="continue-hub" aria-label="Continuar aprendiendo">
      <div className="section-heading">
        <h2>Continuar aprendiendo</h2>
        <span>
          {courses.length} reciente{courses.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="continue-rail">
        {courses.slice(0, 12).map((course) => (
          <CourseCard
            key={`hub-${course.path}`}
            course={course}
            showLearningMeta
            onSelect={onSelect}
            onOpenCourse={onOpenCourse}
            onOpenModalClick={onOpenModal}
            onToggleInProcess={onToggleInProcess}
            tabIndex={0}
          />
        ))}
      </div>
    </section>
  )
}

function FilterableCoursesGrid({
  courses,
  isLoading,
  onRefresh,
  onChangeLibrary,
  onOpenCourse,
  onNavigate
}) {
  const [filterText, setFilterText] = useState('')
  const [isCardLayout, setIsCardLayout] = useState(true)
  const [isInProcessOnly, setIsInProcessOnly] = useState(false)
  const [isNewOnly, setIsNewOnly] = useState(false)
  const [recentlyViewedOnly, setRecentlyViewedOnly] = useState(false)
  const [missingPropsOnly, setMissingPropsOnly] = useState(false)
  const [institutionFilter, setInstitutionFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [themeFilter, setThemeFilter] = useState('')
  const [minRate, setMinRate] = useState(0)
  const [sortMode, setSortMode] = useState('az')
  const [columnSort, setColumnSort] = useState(null)
  const [columnFilters, setColumnFilters] = useState(EMPTY_COLUMN_FILTERS)
  const [selectedPath, setSelectedPath] = useState(null)
  const [focusIndex, setFocusIndex] = useState(-1)
  const [editingCourse, setEditingCourse] = useState(null)
  const [importMissingOpen, setImportMissingOpen] = useState(false)
  const [coverSearch, setCoverSearch] = useState(null)
  const debouncedFilter = useDebouncedValue(filterText, 200)

  const institutions = useMemo(() => {
    const set = new Set()
    courses.forEach((c) => {
      if (c.institution) set.add(c.institution)
    })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [courses])

  const programs = useMemo(() => {
    const counts = new Map()
    courses.forEach((c) => {
      ;(c.programs || []).forEach((p) => {
        counts.set(p, (counts.get(p) || 0) + 1)
      })
    })
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
  }, [courses])

  const themes = useMemo(() => {
    const counts = new Map()
    courses.forEach((c) => {
      ;(c.theme || []).forEach((t) => {
        counts.set(t, (counts.get(t) || 0) + 1)
      })
    })
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
  }, [courses])

  const missingPropsCourses = useMemo(() => courses.filter((c) => c.missingProps), [courses])
  const missingCoverCourses = useMemo(() => courses.filter((c) => !c.hasCover), [courses])

  const inProgressCourses = useMemo(
    () => courses.filter((c) => !c.missingProps && c.isInProcess),
    [courses]
  )

  const continueCourses = useMemo(() => {
    return courses
      .filter((c) => {
        if (c.missingProps) return false
        const learning = c.learning
        if (!learning?.lastOpenedAt) return false
        if (learning.status === 'completed') return false
        return true
      })
      .sort((a, b) => (b.learning?.lastOpenedAt || 0) - (a.learning?.lastOpenedAt || 0))
  }, [courses])

  const sortedCourses = useMemo(() => {
    const searchLower = debouncedFilter.toLowerCase()
    const filtered = courses.filter((course) => {
      const title = (course.title || '').toLowerCase()
      const institution = (course.institution || '').toLowerCase()
      const instructor = (course.instructor || '').toLowerCase()
      const programsText = (course.programs || []).join(' ').toLowerCase()
      const themesText = (course.theme || []).join(' ').toLowerCase()
      const notesText = (course.notesSearchText || '').toLowerCase()
      const matchesText =
        !searchLower ||
        title.includes(searchLower) ||
        institution.includes(searchLower) ||
        instructor.includes(searchLower) ||
        programsText.includes(searchLower) ||
        themesText.includes(searchLower) ||
        notesText.includes(searchLower) ||
        (course.path || '').toLowerCase().includes(searchLower)
      const processCheck = !isInProcessOnly || course.isInProcess
      const newCheck = !isNewOnly || course.isNew
      const recentCheck = !recentlyViewedOnly || course.learning?.isRecentlyViewed
      const missingCheck = !missingPropsOnly || course.missingProps
      const institutionCheck = !institutionFilter || course.institution === institutionFilter
      const programCheck = !programFilter || (course.programs || []).includes(programFilter)
      const themeCheck = !themeFilter || (course.theme || []).includes(themeFilter)
      const rateCheck = !minRate || (Number(course.rate) || 0) >= minRate
      const columnCheck = isCardLayout || matchesColumnFilters(course, columnFilters)
      return (
        matchesText &&
        processCheck &&
        newCheck &&
        recentCheck &&
        missingCheck &&
        institutionCheck &&
        programCheck &&
        themeCheck &&
        rateCheck &&
        columnCheck
      )
    })

    return [...filtered].sort((a, b) => {
      if (!isCardLayout && columnSort) {
        return compareCourses(a, b, columnSort.key, columnSort.dir)
      }
      if (sortMode === 'recent') {
        const viewed = (course) =>
          Math.max(course.learning?.lastViewedAt || 0, course.learning?.lastOpenedAt || 0)
        return viewed(b) - viewed(a)
      }
      if (sortMode === 'added' || sortMode === 'addedOldest') {
        const diff = (b.addedAt || 0) - (a.addedAt || 0)
        if (diff !== 0) return sortMode === 'addedOldest' ? -diff : diff
      }
      if (sortMode === 'newest') {
        return (b.folderMtimeMs || 0) - (a.folderMtimeMs || 0)
      }
      if (sortMode === 'rate') {
        const diff = (Number(b.rate) || 0) - (Number(a.rate) || 0)
        if (diff !== 0) return diff
      }
      if (sortMode === 'progress') {
        const diff = (b.learning?.percent || 0) - (a.learning?.percent || 0)
        if (diff !== 0) return diff
      }
      if (sortMode === 'inProgress') {
        const diff = Number(Boolean(b.isInProcess)) - Number(Boolean(a.isInProcess))
        if (diff !== 0) return diff
      }
      const cmp = (a.title || '').localeCompare(b.title || '', undefined, {
        sensitivity: 'base'
      })
      return sortMode === 'za' ? -cmp : cmp
    })
  }, [
    courses,
    debouncedFilter,
    isInProcessOnly,
    isNewOnly,
    recentlyViewedOnly,
    missingPropsOnly,
    institutionFilter,
    programFilter,
    themeFilter,
    minRate,
    sortMode,
    isCardLayout,
    columnSort,
    columnFilters
  ])

  const handleSelectCourse = useCallback((course) => {
    if (!course) {
      setSelectedPath(null)
      return
    }
    setSelectedPath(course.path)
  }, [])

  const handleOpenCourse = useCallback(
    (course) => {
      if (course && onOpenCourse) onOpenCourse(course)
    },
    [onOpenCourse]
  )

  const handleOpenEdit = useCallback((course) => {
    setEditingCourse(course)
  }, [])

  const handleToggleInProcess = useCallback(async (course, newValue) => {
    const result = await window.api.updateCourseProperty(course.path, 'isInProcess', newValue)
    if (!result.success) {
      throw new Error(result.error || 'Update failed')
    }
    toast.success(newValue ? 'Marcado en curso' : 'Quitado de en curso')
  }, [])

  const handleOpenImportMissing = useCallback(() => {
    if (missingPropsCourses.length === 0) return
    setImportMissingOpen(true)
  }, [missingPropsCourses.length])

  const handleOpenCoverSearch = useCallback(() => {
    if (missingCoverCourses.length === 0) return
    setCoverSearch({ courses: missingCoverCourses, initialStep: 'select' })
  }, [missingCoverCourses])

  const handleGenerateOne = useCallback(
    async (course) => {
      try {
        await window.api.generateCourseProps(course.path)
        toast.success('Propiedades generadas')
        onRefresh?.()
      } catch (err) {
        toast.error(err.message || 'Error')
      }
    },
    [onRefresh]
  )

  useEffect(() => {
    const onKeyDown = (e) => {
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (t?.isContentEditable || t?.closest?.('[contenteditable="true"], .note-editor')) return
      if (e.key === 'Escape') {
        if (importMissingOpen) {
          setImportMissingOpen(false)
          return
        }
        if (editingCourse) {
          setEditingCourse(null)
          return
        }
        setSelectedPath(null)
        return
      }
      if (!sortedCourses.length) return

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIndex((i) => {
          const base = i < 0 ? -1 : i
          const next = Math.min(base + 1, sortedCourses.length - 1)
          setSelectedPath(sortedCourses[next].path)
          return next
        })
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIndex((i) => {
          const base = i < 0 ? 0 : i
          const next = Math.max(base - 1, 0)
          setSelectedPath(sortedCourses[next].path)
          return next
        })
      } else if (e.key === 'Enter' && selectedPath) {
        const course = sortedCourses.find((c) => c.path === selectedPath)
        if (course) {
          e.preventDefault()
          handleOpenCourse(course)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sortedCourses, editingCourse, importMissingOpen, selectedPath, handleOpenCourse])

  const selectedCourse = useMemo(() => {
    if (!selectedPath) return null
    return (
      courses.find((c) => c.path === selectedPath) ||
      sortedCourses.find((c) => c.path === selectedPath) ||
      null
    )
  }, [courses, sortedCourses, selectedPath])

  return (
    <div className="app-shell">
      <AppHeader
        filterText={filterText}
        onFilterTextChange={setFilterText}
        isCardLayout={isCardLayout}
        onCardLayoutChange={setIsCardLayout}
        isInProcessOnly={isInProcessOnly}
        onInProcessOnlyChange={setIsInProcessOnly}
        isNewOnly={isNewOnly}
        onNewOnlyChange={setIsNewOnly}
        recentlyViewedOnly={recentlyViewedOnly}
        onRecentlyViewedOnlyChange={setRecentlyViewedOnly}
        missingPropsOnly={missingPropsOnly}
        onMissingPropsOnlyChange={setMissingPropsOnly}
        courseCount={sortedCourses.length}
        isLoading={isLoading}
        onRefresh={onRefresh}
        onChangeLibrary={onChangeLibrary}
        onNavigate={onNavigate}
        institutions={institutions}
        programs={programs}
        themes={themes}
        institutionFilter={institutionFilter}
        onInstitutionFilterChange={setInstitutionFilter}
        programFilter={programFilter}
        onProgramFilterChange={setProgramFilter}
        themeFilter={themeFilter}
        onThemeFilterChange={setThemeFilter}
        minRate={minRate}
        onMinRateChange={setMinRate}
        sortMode={sortMode}
        onSortModeChange={(value) => {
          setColumnSort(null)
          setSortMode(value)
        }}
      />

      <div className={`app-main${selectedCourse ? ' app-main--with-detail' : ''}`}>
        <div className="app-content">
          {isLoading && courses.length === 0 ? (
            <div className="loader-container">
              <Loader />
            </div>
          ) : (
            <>
              <div className="stats-row">
                <div className="stat-card">
                  <div>
                    <div className="stat-card__value">{courses.length}</div>
                    <div className="stat-card__label">Total</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div>
                    <div className="stat-card__value">{inProgressCourses.length}</div>
                    <div className="stat-card__label">En curso</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div>
                    <div className="stat-card__value">{institutions.length}</div>
                    <div className="stat-card__label">Academias</div>
                  </div>
                </div>
                {missingPropsCourses.length > 0 ? (
                  <div className="stat-card">
                    <div>
                      <div className="stat-card__value">{missingPropsCourses.length}</div>
                      <div className="stat-card__label">Sin props</div>
                    </div>
                  </div>
                ) : null}
              </div>

              {missingPropsCourses.length > 0 && !missingPropsOnly ? (
                <div className="catalog-banner">
                  <div>
                    <strong>{missingPropsCourses.length}</strong> curso
                    {missingPropsCourses.length === 1 ? '' : 's'} sin <code>courseProps.json</code>
                  </div>
                  <div className="catalog-banner__actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setMissingPropsOnly(true)}
                    >
                      Verlos
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleOpenImportMissing}
                    >
                      Elegir e importar
                    </button>
                  </div>
                </div>
              ) : null}

              {missingCoverCourses.length > 0 ? (
                <div className="catalog-banner">
                  <div>
                    <strong>{missingCoverCourses.length}</strong> curso
                    {missingCoverCourses.length === 1 ? '' : 's'} sin portada
                  </div>
                  <div className="catalog-banner__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleOpenCoverSearch}
                    >
                      Buscar portadas
                    </button>
                  </div>
                </div>
              ) : null}

              {!isInProcessOnly &&
                !isNewOnly &&
                !recentlyViewedOnly &&
                !missingPropsOnly &&
                !debouncedFilter &&
                !institutionFilter &&
                !programFilter &&
                !themeFilter &&
                !minRate &&
                !hasColumnFilters(columnFilters) && (
                  <ContinueHub
                    courses={continueCourses}
                    onSelect={handleSelectCourse}
                    onOpenCourse={handleOpenCourse}
                    onOpenModal={handleOpenEdit}
                    onToggleInProcess={handleToggleInProcess}
                  />
                )}

              <div className="section-heading">
                <h2>Biblioteca</h2>
                <span>
                  {sortedCourses.length} resultado{sortedCourses.length === 1 ? '' : 's'}
                </span>
                {!isCardLayout && hasColumnFilters(columnFilters) ? (
                  <button
                    type="button"
                    className="btn btn--ghost course-table__clear"
                    onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
                  >
                    Limpiar columnas
                  </button>
                ) : null}
              </div>

              {missingPropsOnly && missingPropsCourses.length > 0 ? (
                <div className="catalog-banner catalog-banner--compact">
                  <span>Elige carpetas y genera propiedades desde el nombre.</span>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleOpenImportMissing}
                  >
                    Elegir e importar
                  </button>
                </div>
              ) : null}

              <CoursesGrid
                courses={sortedCourses}
                isCardLayout={isCardLayout}
                selectedPath={selectedPath}
                onSelectCourse={handleSelectCourse}
                onOpenCourse={handleOpenCourse}
                onOpenModal={handleOpenEdit}
                onToggleInProcess={handleToggleInProcess}
                focusIndex={focusIndex}
                columnSort={columnSort}
                onColumnSort={(key, kind) =>
                  setColumnSort((current) => nextColumnSort(current, key, kind))
                }
                columnFilters={columnFilters}
                onColumnFilter={(key, value) =>
                  setColumnFilters((current) => ({ ...current, [key]: value }))
                }
                institutions={institutions}
                programs={programs}
                themes={themes}
              />

              {editingCourse && (
                <CourseEditModal
                  course={editingCourse}
                  programOptions={programs}
                  themeOptions={themes}
                  onCourseUpdated={() => {
                    setEditingCourse(null)
                    onRefresh?.()
                  }}
                  onClose={() => setEditingCourse(null)}
                />
              )}

              {importMissingOpen && (
                <ImportMissingPropsModal
                  courses={missingPropsCourses}
                  onImported={() => {
                    setImportMissingOpen(false)
                    onRefresh?.()
                  }}
                  onClose={() => setImportMissingOpen(false)}
                />
              )}

              {coverSearch ? (
                <CoverSearchModal
                  courses={coverSearch.courses}
                  initialStep={coverSearch.initialStep}
                  onClose={() => setCoverSearch(null)}
                />
              ) : null}
            </>
          )}
        </div>

        {selectedCourse && (
          <CourseDetailPanel
            course={selectedCourse}
            onClose={() => handleSelectCourse(null)}
            onOpenCourse={handleOpenCourse}
            onEdit={handleOpenEdit}
            onToggleInProcess={handleToggleInProcess}
            onGenerateProps={
              selectedCourse.missingProps ? () => handleGenerateOne(selectedCourse) : null
            }
            onSearchCover={() =>
              setCoverSearch({
                courses: [selectedCourse],
                initialStep: 'choose'
              })
            }
          />
        )}
      </div>
    </div>
  )
}

function App() {
  const annotationsWindowMode = useMemo(() => getAnnotationsWindowMode(), [])
  const [isLoading, setIsLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [libraryPath, setLibraryPath] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [activeCoursePath, setActiveCoursePath] = useState(null)
  const [resumeTarget, setResumeTarget] = useState(null)
  const [liveJump, setLiveJump] = useState(null)
  const [libraryStudyMode, setLibraryStudyMode] = useState(null)
  const loadingRef = useRef(false)
  const activeCoursePathRef = useRef(null)
  activeCoursePathRef.current = activeCoursePath

  const mergeLearning = useCallback(async (list) => {
    try {
      const [progressMap, notesMap] = await Promise.all([
        window.api.getAllCourseProgress(),
        window.api.getNotesSearchByCourse()
      ])
      return list.map((course) => ({
        ...course,
        learning: progressMap[course.path] || null,
        notesSearchText: notesMap[course.path] || ''
      }))
    } catch {
      return list.map((course) => ({
        ...course,
        learning: null,
        notesSearchText: ''
      }))
    }
  }, [])

  const loadCourses = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    try {
      const lib = await window.api.getLibraryPath()
      if (!lib.valid) {
        setNeedsSetup(true)
        setLibraryPath(null)
        setCourses([])
        return
      }
      setNeedsSetup(false)
      setLibraryPath(lib.path)
      const list = await window.api.listCourses()
      setCourses(await mergeLearning(list))
    } catch (error) {
      console.error('Error loading courses:', error)
      toast.error(error.message || 'No se pudieron cargar los cursos')
      setCourses([])
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [mergeLearning])

  const refreshCourses = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoading(true)
    try {
      const list = await window.api.refreshCourses()
      setCourses(await mergeLearning(list))
      toast.success('Biblioteca actualizada')
    } catch (error) {
      console.error('Error refreshing courses:', error)
      toast.error(error.message || 'Error al refrescar')
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [mergeLearning])

  const handleLearningProgressChange = useCallback((coursePath, learning) => {
    setCourses((prev) =>
      prev.map((course) => (course.path === coursePath ? { ...course, learning } : course))
    )
  }, [])

  const recordView = useCallback((coursePath) => {
    if (!coursePath) return
    window.api
      .recordCourseView(coursePath)
      .then((learning) => {
        if (!learning) return
        setCourses((prev) =>
          prev.map((course) => {
            if (course.path !== coursePath) return course
            if (!course.learning) return { ...course, learning }
            return {
              ...course,
              learning: {
                ...course.learning,
                lastViewedAt: learning.lastViewedAt,
                isRecentlyViewed: Boolean(learning.isRecentlyViewed)
              }
            }
          })
        )
      })
      .catch(() => {})
  }, [])

  const openCourse = useCallback(
    (course, target = null) => {
      if (!course?.path) return
      setLibraryStudyMode(null)
      setResumeTarget(target)
      setActiveCoursePath(course.path)
      recordView(course.path)
    },
    [recordView]
  )

  const handleChangeLibrary = useCallback(async () => {
    try {
      const result = await window.api.pickLibraryFolder()
      if (!result.canceled && result.valid) {
        setLibraryPath(result.path)
        setNeedsSetup(false)
        await loadCourses()
        toast.success('Carpeta actualizada')
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo cambiar la carpeta')
    }
  }, [loadCourses])

  useEffect(() => {
    loadCourses()

    const unsubscribeUpdated = window.api.onCourseUpdated((update) => {
      setCourses((prev) =>
        prev.map((course) => {
          if (course.path !== update.coursePath) return course
          if (update.fullData) {
            return {
              ...course,
              ...update.fullData,
              missingProps: update.fullData.missingProps ?? false,
              hasProps: update.fullData.hasProps ?? true,
              addedAt: update.fullData.addedAt ?? course.addedAt,
              isNew:
                typeof update.fullData.addedAt === 'number' ? update.fullData.isNew : course.isNew,
              learning: course.learning,
              notesSearchText: course.notesSearchText
            }
          }
          if (update.property) return { ...course, [update.property]: update.value }
          return course
        })
      )
    })

    const unsubscribeLibrary = window.api.onLibraryChanged(() => {
      loadCourses()
    })

    const unsubscribeJump = annotationsWindowMode
      ? null
      : window.api.onAnnotationsJump?.((payload) => {
          if (!payload?.coursePath) return
          setLibraryStudyMode(null)
          const target = {
            lessonRelativePath: payload.lessonRelativePath || null,
            timeSec: payload.timeSec ?? null,
            projectId: payload.projectId || null
          }
          if (activeCoursePathRef.current === payload.coursePath) {
            setLiveJump({ ...target, coursePath: payload.coursePath, id: Date.now() })
            recordView(payload.coursePath)
            return
          }
          setResumeTarget(target)
          setActiveCoursePath(payload.coursePath)
          recordView(payload.coursePath)
        })

    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        refreshCourses()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubscribeUpdated()
      unsubscribeLibrary()
      unsubscribeJump?.()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [loadCourses, refreshCourses, annotationsWindowMode, recordView])

  const activeCourse = useMemo(() => {
    if (!activeCoursePath) return null
    return (
      courses.find((c) => c.path === activeCoursePath) || {
        path: activeCoursePath,
        title: activeCoursePath
      }
    )
  }, [courses, activeCoursePath])

  const navigateApp = useCallback((section) => {
    setActiveCoursePath(null)
    setResumeTarget(null)
    if (
      section === 'projects' ||
      section === 'annotations' ||
      section === 'paths' ||
      section === 'guide'
    ) {
      setLibraryStudyMode(section)
      return
    }
    setLibraryStudyMode(null)
  }, [])

  return (
    <ErrorBoundary>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            border: '3px solid #1a1423',
            borderRadius: '14px',
            background: '#fff4e8',
            color: '#1a1423',
            fontWeight: 700
          }
        }}
      />
      {annotationsWindowMode ? (
        needsSetup ? (
          <LibrarySetup
            onPathSet={(path) => {
              setLibraryPath(path)
              setNeedsSetup(false)
              loadCourses()
            }}
          />
        ) : (
          <AnnotationsPopoutView coursePath={annotationsWindowMode.coursePath} courses={courses} />
        )
      ) : needsSetup ? (
        <LibrarySetup
          onPathSet={(path) => {
            setLibraryPath(path)
            setNeedsSetup(false)
            loadCourses()
          }}
        />
      ) : libraryStudyMode === 'paths' ? (
        <LearningPathsView courses={courses} onNavigate={navigateApp} onOpenCourse={openCourse} />
      ) : libraryStudyMode === 'guide' ? (
        <GuideView courses={courses} onNavigate={navigateApp} />
      ) : libraryStudyMode === 'annotations' ? (
        <LibraryStudyView courses={courses} onNavigate={navigateApp} onOpenCourse={openCourse} />
      ) : libraryStudyMode === 'projects' ? (
        <ProjectsKanban courses={courses} onNavigate={navigateApp} onOpenCourse={openCourse} />
      ) : activeCourse ? (
        <CourseRoom
          course={activeCourse}
          resumeTarget={resumeTarget}
          liveJump={liveJump}
          onBack={() => {
            setActiveCoursePath(null)
            setResumeTarget(null)
            setLiveJump(null)
          }}
          onOpenExplorer={(c) => window.api.openCourseFolder(c.path)}
          onProgressChange={handleLearningProgressChange}
        />
      ) : (
        <FilterableCoursesGrid
          courses={courses}
          isLoading={isLoading}
          onRefresh={refreshCourses}
          libraryPath={libraryPath}
          onChangeLibrary={handleChangeLibrary}
          onNavigate={navigateApp}
          onOpenCourse={openCourse}
        />
      )}
    </ErrorBoundary>
  )
}

export default App
