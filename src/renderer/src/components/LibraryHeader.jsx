import { useEffect, useRef, useState } from 'react'
import AppNav from './AppNav'
import CourseFilterBar from './CourseFilterBar'
import brandMark from '../assets/img/brand-mark.svg'

const SORT_OPTIONS = [
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'recent', label: 'Recientes' },
  { value: 'added', label: 'Fecha de añadido' },
  { value: 'addedOldest', label: 'Añadidos primero' },
  { value: 'newest', label: 'Última modificación' },
  { value: 'rate', label: 'Mejor valorados' },
  { value: 'progress', label: 'Más progreso' },
  { value: 'inProgress', label: 'En curso primero' }
]

function LibraryHeader({
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
  onSortModeChange,
  onExportCourses,
  isExporting,
  canExport,
  missingCoverCount = 0,
  missingDescriptionCount = 0,
  onSearchCovers,
  onWriteDescriptions
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  useEffect(() => {
    if (!moreOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setMoreOpen(false)
    }
    const onPointerDown = (event) => {
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [moreOpen])

  return (
    <header className="app-header">
      <div className="app-header__bar">
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

        <div className="header-tools">
          <button
            type="button"
            className="header-icon"
            onClick={onChangeLibrary}
            title="Cambiar carpeta"
            aria-label="Cambiar carpeta"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
              />
            </svg>
          </button>
          <button
            type="button"
            className={`header-icon${isLoading ? ' is-busy' : ''}`}
            onClick={onRefresh}
            disabled={isLoading}
            title="Refrescar (Ctrl+R)"
            aria-label="Refrescar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              />
            </svg>
          </button>
          <div className="header-menu" ref={moreRef}>
            <button
              type="button"
              className="header-icon"
              aria-label="Más acciones"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="Más acciones"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
                />
              </svg>
            </button>
            {moreOpen ? (
              <div className="header-popover" role="menu" aria-label="Más acciones">
                <button
                  type="button"
                  className="header-popover__item"
                  role="menuitem"
                  disabled={isLoading || isExporting || !canExport}
                  onClick={() => {
                    setMoreOpen(false)
                    onExportCourses()
                  }}
                >
                  <span>{isExporting ? 'Exportando…' : 'Exportar cursos'}</span>
                  <small>JSON con metadatos</small>
                </button>
                {missingCoverCount > 0 || missingDescriptionCount > 0 ? (
                  <hr className="header-popover__sep" />
                ) : null}
                {missingCoverCount > 0 ? (
                  <button
                    type="button"
                    className="header-popover__item"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false)
                      onSearchCovers?.()
                    }}
                  >
                    <span>Buscar portadas</span>
                    <small>
                      {missingCoverCount} curso{missingCoverCount === 1 ? '' : 's'} sin portada
                    </small>
                  </button>
                ) : null}
                {missingDescriptionCount > 0 ? (
                  <button
                    type="button"
                    className="header-popover__item"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false)
                      onWriteDescriptions?.()
                    }}
                  >
                    <span>Escribir descripciones</span>
                    <small>
                      {missingDescriptionCount} curso{missingDescriptionCount === 1 ? '' : 's'} sin
                      descripción
                    </small>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="app-header__toolbar">
        <div className="segmented" role="group" aria-label="Vista">
          <button
            type="button"
            aria-pressed={isCardLayout}
            aria-label="Cards"
            title="Cards"
            onClick={() => onCardLayoutChange(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-pressed={!isCardLayout}
            aria-label="Lista"
            title="Lista"
            onClick={() => onCardLayoutChange(false)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 6h2v2H4V6zm4 0h12v2H8V6zM4 11h2v2H4v-2zm4 0h12v2H8v-2zM4 16h2v2H4v-2zm4 0h12v2H8v-2z"
              />
            </svg>
          </button>
        </div>

        <div className="header-sort">
          <label htmlFor="sort-mode">Orden</label>
          <select
            id="sort-mode"
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <CourseFilterBar
          idPrefix="library"
          isInProcessOnly={isInProcessOnly}
          onInProcessOnlyChange={onInProcessOnlyChange}
          isNewOnly={isNewOnly}
          onNewOnlyChange={onNewOnlyChange}
          recentlyViewedOnly={recentlyViewedOnly}
          onRecentlyViewedOnlyChange={onRecentlyViewedOnlyChange}
          missingPropsOnly={missingPropsOnly}
          onMissingPropsOnlyChange={onMissingPropsOnlyChange}
          institutions={institutions}
          programs={programs}
          themes={themes}
          institutionFilter={institutionFilter}
          onInstitutionFilterChange={onInstitutionFilterChange}
          programFilter={programFilter}
          onProgramFilterChange={onProgramFilterChange}
          themeFilter={themeFilter}
          onThemeFilterChange={onThemeFilterChange}
          minRate={minRate}
          onMinRateChange={onMinRateChange}
          closeSignal={moreOpen}
          onFiltersToggle={(open) => {
            if (open) setMoreOpen(false)
          }}
        />

        <span className="header-count" aria-live="polite">
          {courseCount} {courseCount === 1 ? 'curso' : 'cursos'}
        </span>
      </div>
    </header>
  )
}

export default LibraryHeader
