import { useEffect, useRef, useState } from 'react'
import AppNav from './AppNav'
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  )
}

function CaretIcon() {
  return (
    <svg className="caret" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
    </svg>
  )
}

function FilterChip({ pressed, onClick, title, className = '', children }) {
  return (
    <button
      type="button"
      className={`m3-chip${className ? ` ${className}` : ''}`}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
    >
      {pressed ? <CheckIcon /> : null}
      {children}
    </button>
  )
}

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
  canExport
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [programsOverflow, setProgramsOverflow] = useState(false)
  const filtersRef = useRef(null)
  const moreRef = useRef(null)
  const programsRef = useRef(null)

  const extraFilterCount =
    Number(recentlyViewedOnly) +
    Number(missingPropsOnly) +
    Number(Boolean(institutionFilter)) +
    Number(minRate > 0) +
    Number(Boolean(themeFilter))

  useEffect(() => {
    if (!filtersOpen && !moreOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setFiltersOpen(false)
      setMoreOpen(false)
    }
    const onPointerDown = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setFiltersOpen(false)
      }
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
  }, [filtersOpen, moreOpen])

  useEffect(() => {
    const el = programsRef.current
    if (!el) return undefined
    const update = () => setProgramsOverflow(el.scrollWidth > el.clientWidth + 2)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [programs])

  useEffect(() => {
    const root = programsRef.current
    if (!root || !programFilter) return
    const el = root.querySelector('[aria-pressed="true"]')
    if (!el) return
    const elRect = el.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    if (elRect.left < rootRect.left) {
      root.scrollLeft -= rootRect.left - elRect.left + 8
    } else if (elRect.right > rootRect.right) {
      root.scrollLeft += elRect.right - rootRect.right + 8
    }
  }, [programFilter, programs])

  const clearExtraFilters = () => {
    onRecentlyViewedOnlyChange(false)
    onMissingPropsOnlyChange(false)
    onInstitutionFilterChange('')
    onMinRateChange(0)
    onThemeFilterChange('')
    setFiltersOpen(false)
  }

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
              onClick={() => {
                setFiltersOpen(false)
                setMoreOpen((open) => !open)
              }}
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

        <FilterChip
          pressed={isInProcessOnly}
          onClick={() => onInProcessOnlyChange(!isInProcessOnly)}
        >
          En curso
        </FilterChip>
        <FilterChip
          pressed={isNewOnly}
          title="Carpetas añadidas en los últimos 14 días"
          onClick={() => onNewOnlyChange(!isNewOnly)}
        >
          Nuevos
        </FilterChip>

        {programs.length > 0 ? (
          <>
            <span className="header-divider" aria-hidden="true" />
            <div
              className={`header-programs${programsOverflow ? ' is-overflowing' : ''}`}
              role="group"
              aria-label="Programas"
              ref={programsRef}
            >
              {programs.map((program) => (
                <FilterChip
                  key={program}
                  className="m3-chip--program"
                  pressed={programFilter === program}
                  onClick={() => onProgramFilterChange(programFilter === program ? '' : program)}
                >
                  {program}
                </FilterChip>
              ))}
            </div>
          </>
        ) : (
          <span className="header-programs header-programs--empty" />
        )}

        <div className="header-menu" ref={filtersRef}>
          <button
            type="button"
            className={`m3-chip m3-chip--menu${extraFilterCount ? ' is-active' : ''}`}
            aria-expanded={filtersOpen}
            aria-haspopup="dialog"
            aria-controls="header-filters-panel"
            onClick={() => {
              setMoreOpen(false)
              setFiltersOpen((open) => !open)
            }}
          >
            {extraFilterCount > 0 ? <CheckIcon /> : null}
            {extraFilterCount ? `Filtros · ${extraFilterCount}` : 'Filtros'}
            <CaretIcon />
          </button>
          {filtersOpen ? (
            <div
              id="header-filters-panel"
              className="header-popover header-popover--filters"
              role="dialog"
              aria-label="Filtros"
            >
              <div className="header-popover__chips" role="group" aria-label="Estado">
                <FilterChip
                  pressed={recentlyViewedOnly}
                  title="Cursos abiertos en los últimos 14 días"
                  onClick={() => onRecentlyViewedOnlyChange(!recentlyViewedOnly)}
                >
                  Recientes
                </FilterChip>
                <FilterChip
                  pressed={missingPropsOnly}
                  title="Sin courseProps.json"
                  onClick={() => onMissingPropsOnlyChange(!missingPropsOnly)}
                >
                  Sin props
                </FilterChip>
              </div>

              <label htmlFor="institution-filter">
                Academia
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
              </label>

              <label htmlFor="min-rate-filter">
                Mín. ★
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
              </label>

              {themes.length > 0 ? (
                <div className="header-popover__section">
                  <span className="header-popover__label" id="theme-filter-label">
                    Temas
                  </span>
                  <div
                    className="header-popover__chips"
                    role="group"
                    aria-labelledby="theme-filter-label"
                  >
                    {themes.map((theme) => (
                      <FilterChip
                        key={theme}
                        className="m3-chip--theme"
                        pressed={themeFilter === theme}
                        onClick={() => onThemeFilterChange(themeFilter === theme ? '' : theme)}
                      >
                        {theme}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              ) : null}

              {extraFilterCount > 0 ? (
                <button type="button" className="header-popover__clear" onClick={clearExtraFilters}>
                  Limpiar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <span className="header-count" aria-live="polite">
          {courseCount} {courseCount === 1 ? 'curso' : 'cursos'}
        </span>
      </div>
    </header>
  )
}

export default LibraryHeader
