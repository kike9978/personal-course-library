import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import CoursesGrid from './components/CoursesGrid'
import CourseCard from './components/CourseCard'
import CourseEditModal from './components/CourseEditModal'
import ImportMissingPropsModal from './components/ImportMissingPropsModal'
import CoverSearchModal from './components/CoverSearchModal'
import CourseDetailPanel from './components/CourseDetailPanel'
import CourseDescriptionBatch from './components/CourseDescriptionBatch'
import CourseRoom from './components/CourseRoom'
import LibraryStudyView from './components/LibraryStudyView'
import AnnotationsPopoutView from './components/AnnotationsPopoutView'
import ProjectsKanban from './components/ProjectsKanban'
import PlaylistCanvas from './components/PlaylistCanvas'
import LibraryHeader from './components/LibraryHeader'
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
import { exportViaDialog } from './utils/exportHelpers'
import { stringifyCourseCatalog } from './utils/courseExport'
import {
  collectCourseFacets,
  courseMatchesLibraryFilters,
  useDebouncedValue
} from './utils/courseFilters'

const COVER_BANNER_DISMISS_KEY = 'pcl.banner.dismiss.covers'
const DESCRIPTION_BANNER_DISMISS_KEY = 'pcl.banner.dismiss.descriptions'

function readStoredSignature(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function storeSignature(key, signature) {
  try {
    localStorage.setItem(key, signature)
  } catch {
    // Dismissal still applies for this session.
  }
}

function coursePathsSignature(list) {
  return list
    .map((course) => course.path)
    .sort()
    .join('\0')
}

function BannerDismiss({ onClick }) {
  return (
    <button
      type="button"
      className="catalog-banner__dismiss"
      onClick={onClick}
      aria-label="Ocultar aviso"
      title="Ocultar aviso"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
        />
      </svg>
    </button>
  )
}

function DesktopShellNotice() {
  return (
    <div className="library-setup">
      <img src={brandMark} alt="" width={72} height={72} className="library-setup__mark" />
      <h1>Abre la ventana de la app</h1>
      <p>
        Esta página en el navegador no tiene acceso a la biblioteca. Usa la ventana de escritorio
        que abre <strong>bun dev</strong>.
      </p>
    </div>
  )
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
  const [isExporting, setIsExporting] = useState(false)
  const [importMissingOpen, setImportMissingOpen] = useState(false)
  const [coverSearch, setCoverSearch] = useState(null)
  const [descriptionBatchOpen, setDescriptionBatchOpen] = useState(false)
  const [dismissedCoverSignature, setDismissedCoverSignature] = useState(() =>
    readStoredSignature(COVER_BANNER_DISMISS_KEY)
  )
  const [dismissedDescriptionSignature, setDismissedDescriptionSignature] = useState(() =>
    readStoredSignature(DESCRIPTION_BANNER_DISMISS_KEY)
  )
  const debouncedFilter = useDebouncedValue(filterText, 200)

  const { institutions, programs, themes } = useMemo(() => collectCourseFacets(courses), [courses])

  const missingPropsCourses = useMemo(() => courses.filter((c) => c.missingProps), [courses])
  const missingCoverCourses = useMemo(() => courses.filter((c) => !c.hasCover), [courses])
  const missingDescriptionCourses = useMemo(
    () => courses.filter((c) => !c.description?.summary),
    [courses]
  )
  const missingCoverSignature = useMemo(
    () => coursePathsSignature(missingCoverCourses),
    [missingCoverCourses]
  )
  const missingDescriptionSignature = useMemo(
    () => coursePathsSignature(missingDescriptionCourses),
    [missingDescriptionCourses]
  )
  const showCoverBanner =
    missingCoverCourses.length > 0 && dismissedCoverSignature !== missingCoverSignature
  const showDescriptionBanner =
    missingDescriptionCourses.length > 0 &&
    dismissedDescriptionSignature !== missingDescriptionSignature

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
    const libraryFilters = {
      query: debouncedFilter,
      isInProcessOnly,
      isNewOnly,
      recentlyViewedOnly,
      missingPropsOnly,
      institution: institutionFilter,
      program: programFilter,
      theme: themeFilter,
      minRate
    }
    const filtered = courses.filter(
      (course) =>
        courseMatchesLibraryFilters(course, libraryFilters) &&
        (isCardLayout || matchesColumnFilters(course, columnFilters))
    )

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
    (course, target = null) => {
      if (course && onOpenCourse) onOpenCourse(course, target)
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

  const handleExportCourses = useCallback(async () => {
    if (!courses.length || isExporting) return
    setIsExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const result = await exportViaDialog({
        defaultPath: `cursos-${stamp}.json`,
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Todos', extensions: ['*'] }
        ],
        dataText: stringifyCourseCatalog(courses)
      })
      if (!result.canceled) {
        const n = courses.length
        toast.success(`${n} curso${n === 1 ? '' : 's'} exportado${n === 1 ? '' : 's'}`)
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo exportar')
    } finally {
      setIsExporting(false)
    }
  }, [courses, isExporting])

  const handleOpenImportMissing = useCallback(() => {
    if (missingPropsCourses.length === 0) return
    setImportMissingOpen(true)
  }, [missingPropsCourses.length])

  const handleOpenCoverSearch = useCallback(() => {
    if (missingCoverCourses.length === 0) return
    setCoverSearch({ courses: missingCoverCourses, initialStep: 'select' })
  }, [missingCoverCourses])

  const handleOpenDescriptionBatch = useCallback(() => {
    if (missingDescriptionCourses.length === 0) return
    setDescriptionBatchOpen(true)
  }, [missingDescriptionCourses.length])

  const dismissCoverBanner = useCallback(() => {
    storeSignature(COVER_BANNER_DISMISS_KEY, missingCoverSignature)
    setDismissedCoverSignature(missingCoverSignature)
  }, [missingCoverSignature])

  const dismissDescriptionBanner = useCallback(() => {
    storeSignature(DESCRIPTION_BANNER_DISMISS_KEY, missingDescriptionSignature)
    setDismissedDescriptionSignature(missingDescriptionSignature)
  }, [missingDescriptionSignature])

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
      <LibraryHeader
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
        onExportCourses={handleExportCourses}
        isExporting={isExporting}
        canExport={courses.length > 0}
        missingCoverCount={missingCoverCourses.length}
        missingDescriptionCount={missingDescriptionCourses.length}
        onSearchCovers={handleOpenCoverSearch}
        onWriteDescriptions={handleOpenDescriptionBatch}
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

              {showCoverBanner ? (
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
                    <BannerDismiss onClick={dismissCoverBanner} />
                  </div>
                </div>
              ) : null}

              {showDescriptionBanner ? (
                <div className="catalog-banner">
                  <div>
                    <strong>{missingDescriptionCourses.length}</strong> curso
                    {missingDescriptionCourses.length === 1 ? '' : 's'} sin descripción
                  </div>
                  <div className="catalog-banner__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleOpenDescriptionBatch}
                    >
                      Escribir descripciones
                    </button>
                    <BannerDismiss onClick={dismissDescriptionBanner} />
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

              {descriptionBatchOpen ? (
                <CourseDescriptionBatch
                  courses={missingDescriptionCourses}
                  onClose={() => setDescriptionBatchOpen(false)}
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
  const [shellMissing, setShellMissing] = useState(false)
  const [courses, setCourses] = useState([])
  const [libraryPath, setLibraryPath] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [activeCoursePath, setActiveCoursePath] = useState(null)
  const [resumeTarget, setResumeTarget] = useState(null)
  const [liveJump, setLiveJump] = useState(null)
  const [libraryStudyMode, setLibraryStudyMode] = useState(null)
  const libraryStudyModeRef = useRef(null)
  const returnStudyRef = useRef(null)
  libraryStudyModeRef.current = libraryStudyMode
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
    if (!window.api?.getLibraryPath) {
      setShellMissing(true)
      setIsLoading(false)
      return
    }
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
      setResumeTarget(target)
      const from = libraryStudyModeRef.current
      returnStudyRef.current =
        from === 'projects' || from === 'annotations' || from === 'playlists' ? from : null
      setLibraryStudyMode(null)
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
    if (!window.api?.onCourseUpdated || !window.api?.onLibraryChanged) {
      setShellMissing(true)
      setIsLoading(false)
      return
    }

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
          returnStudyRef.current = null
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
    if (section === 'projects' || section === 'annotations' || section === 'playlists') {
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
      {shellMissing ? (
        <DesktopShellNotice />
      ) : annotationsWindowMode ? (
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
      ) : libraryStudyMode === 'annotations' ? (
        <LibraryStudyView courses={courses} onNavigate={navigateApp} onOpenCourse={openCourse} />
      ) : libraryStudyMode === 'projects' ? (
        <ProjectsKanban courses={courses} onNavigate={navigateApp} onOpenCourse={openCourse} />
      ) : libraryStudyMode === 'playlists' ? (
        <PlaylistCanvas courses={courses} onNavigate={navigateApp} onOpenCourse={openCourse} />
      ) : activeCourse ? (
        <CourseRoom
          course={activeCourse}
          resumeTarget={resumeTarget}
          liveJump={liveJump}
          onBack={() => {
            const back = returnStudyRef.current
            returnStudyRef.current = null
            setActiveCoursePath(null)
            setResumeTarget(null)
            setLiveJump(null)
            if (back) setLibraryStudyMode(back)
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
