import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import CoursesGrid from './components/CoursesGrid'
import CourseCard from './components/CourseCard'
import CourseEditModal from './components/CourseEditModal'
import CourseDetailPanel from './components/CourseDetailPanel'
import CourseRoom from './components/CourseRoom'
import LibraryStudyView from './components/LibraryStudyView'
import ProjectsKanban from './components/ProjectsKanban'
import AppNav from './components/AppNav'
import ErrorBoundary from './components/ErrorBoundary'
import Loader from './components/Loader'
import { Toaster, toast } from 'react-hot-toast'
import brandMark from './assets/img/brand-mark.svg'

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
  courseCount,
  isLoading,
  onRefresh,
  onChangeLibrary,
  onNavigate,
  institutions,
  programs,
  institutionFilter,
  onInstitutionFilterChange,
  programFilter,
  onProgramFilterChange,
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
          <svg className="search-field__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="search"
            value={filterText}
            placeholder="Buscar cursos o academias…"
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

        <div className="filter-chips" role="group" aria-label="Programas">
          {programs.slice(0, 12).map((program) => (
            <button
              key={program}
              type="button"
              className="filter-chip"
              aria-pressed={programFilter === program}
              onClick={() =>
                onProgramFilterChange(programFilter === program ? '' : program)
              }
            >
              {program}
            </button>
          ))}
        </div>
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
        <span>{courses.length} reciente{courses.length === 1 ? '' : 's'}</span>
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
  const [institutionFilter, setInstitutionFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [sortMode, setSortMode] = useState('az')
  const [selectedPath, setSelectedPath] = useState(null)
  const [focusIndex, setFocusIndex] = useState(-1)
  const [editingCourse, setEditingCourse] = useState(null)
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

  const inProgressCourses = useMemo(
    () => courses.filter((c) => !c.error && c.isInProcess),
    [courses]
  )

  const continueCourses = useMemo(() => {
    return courses
      .filter((c) => {
        if (c.error) return false
        const learning = c.learning
        if (!learning?.lastOpenedAt) return false
        if (learning.status === 'completed') return false
        return learning.status === 'in_progress' || c.isInProcess || learning.lastLessonRelativePath
      })
      .sort((a, b) => (b.learning?.lastOpenedAt || 0) - (a.learning?.lastOpenedAt || 0))
  }, [courses])

  const sortedCourses = useMemo(() => {
    const searchLower = debouncedFilter.toLowerCase()
    const filtered = courses.filter((course) => {
      if (course.error) return false
      const title = (course.title || '').toLowerCase()
      const institution = (course.institution || '').toLowerCase()
      const matchesText =
        !searchLower || title.includes(searchLower) || institution.includes(searchLower)
      const processCheck = !isInProcessOnly || course.isInProcess || course.learning?.status === 'in_progress'
      const institutionCheck =
        !institutionFilter || course.institution === institutionFilter
      const programCheck =
        !programFilter || (course.programs || []).includes(programFilter)
      return matchesText && processCheck && institutionCheck && programCheck
    })

    return [...filtered].sort((a, b) => {
      if (sortMode === 'recent') {
        return (b.learning?.lastOpenedAt || 0) - (a.learning?.lastOpenedAt || 0)
      }
      if (sortMode === 'progress') {
        const diff = (b.learning?.percent || 0) - (a.learning?.percent || 0)
        if (diff !== 0) return diff
      }
      if (sortMode === 'inProgress') {
        const aActive =
          Number(Boolean(a.isInProcess)) || Number(a.learning?.status === 'in_progress')
        const bActive =
          Number(Boolean(b.isInProcess)) || Number(b.learning?.status === 'in_progress')
        const diff = bActive - aActive
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
    institutionFilter,
    programFilter,
    sortMode
  ])

  const handleSelectCourse = useCallback((course) => {
    if (!course) {
      setSelectedPath(null)
      return
    }
    // Update selection only — do not move keyboard focus (that jumps scroll).
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

  useEffect(() => {
    const onKeyDown = (e) => {
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (t?.isContentEditable || t?.closest?.('[contenteditable="true"], .note-editor')) return
      if (e.key === 'Escape') {
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
  }, [sortedCourses, editingCourse, selectedPath, handleOpenCourse])

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
        courseCount={sortedCourses.length}
        isLoading={isLoading}
        onRefresh={onRefresh}
        onChangeLibrary={onChangeLibrary}
        onNavigate={onNavigate}
        institutions={institutions}
        programs={programs}
        institutionFilter={institutionFilter}
        onInstitutionFilterChange={setInstitutionFilter}
        programFilter={programFilter}
        onProgramFilterChange={setProgramFilter}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
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
                    <div className="stat-card__value">{courses.filter((c) => !c.error).length}</div>
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
              </div>

              {!isInProcessOnly && !debouncedFilter && !institutionFilter && !programFilter && (
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
              </div>

              <CoursesGrid
                courses={sortedCourses}
                isCardLayout={isCardLayout}
                selectedPath={selectedPath}
                onSelectCourse={handleSelectCourse}
                onOpenCourse={handleOpenCourse}
                onOpenModal={handleOpenEdit}
                onToggleInProcess={handleToggleInProcess}
                focusIndex={focusIndex}
              />

              {editingCourse && (
                <CourseEditModal
                  course={editingCourse}
                  programOptions={programs}
                  onCourseUpdated={() => setEditingCourse(null)}
                  onClose={() => setEditingCourse(null)}
                />
              )}
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
          />
        )}
      </div>
    </div>
  )
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [libraryPath, setLibraryPath] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [activeCoursePath, setActiveCoursePath] = useState(null)
  const [resumeTarget, setResumeTarget] = useState(null)
  const [libraryStudyMode, setLibraryStudyMode] = useState(null)
  const loadingRef = useRef(false)

  const mergeLearning = useCallback(async (list) => {
    try {
      const progressMap = await window.api.getAllCourseProgress()
      return list.map((course) => ({
        ...course,
        learning: progressMap[course.path] || null
      }))
    } catch {
      return list.map((course) => ({ ...course, learning: null }))
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
      prev.map((course) =>
        course.path === coursePath ? { ...course, learning } : course
      )
    )
  }, [])

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
          if (update.fullData) return { ...course, ...update.fullData, learning: course.learning }
          if (update.property) return { ...course, [update.property]: update.value }
          return course
        })
      )
    })

    const unsubscribeLibrary = window.api.onLibraryChanged(() => {
      loadCourses()
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
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [loadCourses, refreshCourses])

  const activeCourse = useMemo(() => {
    if (!activeCoursePath) return null
    return courses.find((c) => c.path === activeCoursePath) || { path: activeCoursePath, title: activeCoursePath }
  }, [courses, activeCoursePath])

  const navigateApp = useCallback((section) => {
    setActiveCoursePath(null)
    setResumeTarget(null)
    if (section === 'projects' || section === 'annotations') {
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
      {needsSetup ? (
        <LibrarySetup
          onPathSet={(path) => {
            setLibraryPath(path)
            setNeedsSetup(false)
            loadCourses()
          }}
        />
      ) : libraryStudyMode === 'annotations' ? (
        <LibraryStudyView
          courses={courses}
          onNavigate={navigateApp}
          onOpenCourse={(course, target = null) => {
            setLibraryStudyMode(null)
            setResumeTarget(target)
            setActiveCoursePath(course.path)
          }}
        />
      ) : libraryStudyMode === 'projects' ? (
        <ProjectsKanban
          courses={courses}
          onNavigate={navigateApp}
          onOpenCourse={(course, target = null) => {
            setLibraryStudyMode(null)
            setResumeTarget(target)
            setActiveCoursePath(course.path)
          }}
        />
      ) : activeCourse ? (
        <CourseRoom
          course={activeCourse}
          resumeTarget={resumeTarget}
          onBack={() => {
            setActiveCoursePath(null)
            setResumeTarget(null)
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
          onOpenCourse={(course, target = null) => {
            setResumeTarget(target)
            setActiveCoursePath(course.path)
          }}
        />
      )}
    </ErrorBoundary>
  )
}

export default App
