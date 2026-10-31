import { useEffect, useRef, useState } from 'react'

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

function CourseFilterBar({
  idPrefix = 'library',
  className = '',
  showSearch = false,
  query = '',
  onQueryChange,
  isInProcessOnly,
  onInProcessOnlyChange,
  isNewOnly,
  onNewOnlyChange,
  recentlyViewedOnly,
  onRecentlyViewedOnlyChange,
  missingPropsOnly,
  onMissingPropsOnlyChange,
  institutions = [],
  programs = [],
  themes = [],
  institutionFilter,
  onInstitutionFilterChange,
  programFilter,
  onProgramFilterChange,
  themeFilter,
  onThemeFilterChange,
  minRate,
  onMinRateChange,
  courseCount = null,
  courseTotal = null,
  closeSignal = false,
  onFiltersToggle
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [programsOverflow, setProgramsOverflow] = useState(false)
  const filtersRef = useRef(null)
  const programsRef = useRef(null)
  const panelId = `${idPrefix}-filters-panel`
  const institutionId = `${idPrefix}-institution-filter`
  const rateId = `${idPrefix}-min-rate-filter`
  const themeLabelId = `${idPrefix}-theme-filter-label`

  const extraFilterCount =
    Number(recentlyViewedOnly) +
    Number(missingPropsOnly) +
    Number(Boolean(institutionFilter)) +
    Number(minRate > 0) +
    Number(Boolean(themeFilter))

  useEffect(() => {
    if (closeSignal) setFiltersOpen(false)
  }, [closeSignal])

  useEffect(() => {
    if (!filtersOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setFiltersOpen(false)
    }
    const onPointerDown = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setFiltersOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [filtersOpen])

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

  const narrowed = typeof courseTotal === 'number' && courseTotal !== courseCount

  return (
    <div className={`course-filter-bar${className ? ` ${className}` : ''}`}>
      {showSearch ? (
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
            value={query}
            placeholder="Buscar título, academia, instructor, temas, notas…"
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="Buscar cursos en las listas"
            title="Buscar (Ctrl+F)"
          />
        </div>
      ) : null}

      <FilterChip pressed={isInProcessOnly} onClick={() => onInProcessOnlyChange(!isInProcessOnly)}>
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
          aria-controls={panelId}
          onClick={() =>
            setFiltersOpen((open) => {
              const next = !open
              onFiltersToggle?.(next)
              return next
            })
          }
        >
          {extraFilterCount > 0 ? <CheckIcon /> : null}
          {extraFilterCount ? `Filtros · ${extraFilterCount}` : 'Filtros'}
          <CaretIcon />
        </button>
        {filtersOpen ? (
          <div
            id={panelId}
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

            <label htmlFor={institutionId}>
              Academia
              <select
                id={institutionId}
                value={institutionFilter}
                onChange={(event) => onInstitutionFilterChange(event.target.value)}
              >
                <option value="">Todas</option>
                {institutions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor={rateId}>
              Mín. ★
              <select
                id={rateId}
                value={minRate}
                onChange={(event) => onMinRateChange(Number(event.target.value))}
              >
                <option value={0}>Cualquiera</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
                <option value={5}>5</option>
              </select>
            </label>

            {themes.length > 0 ? (
              <div className="header-popover__section">
                <span className="header-popover__label" id={themeLabelId}>
                  Temas
                </span>
                <div className="header-popover__chips" role="group" aria-labelledby={themeLabelId}>
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

      {typeof courseCount === 'number' ? (
        <span className="header-count" aria-live="polite">
          {narrowed
            ? `${courseCount} de ${courseTotal} cursos`
            : `${courseCount} ${courseCount === 1 ? 'curso' : 'cursos'}`}
        </span>
      ) : null}
    </div>
  )
}

export default CourseFilterBar
