import { useEffect, useRef, useState } from 'react'
import { EXCITEMENT_LEVELS } from './ExcitementGauge'
import { Check, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { cn } from '../ui/cn'
import { btnGhost, popover, searchIcon, searchInput } from '../ui/classes'

function CheckIcon() {
  return <Check aria-hidden="true" strokeWidth={2.5} />
}

function CaretIcon() {
  return (
    <ChevronDown
      className="!size-3.5 shrink-0 text-ink-faint transition-transform duration-150 ease-pop group-aria-expanded:rotate-180"
      aria-hidden="true"
    />
  )
}

const chipBase =
  'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-ink/10 bg-surface px-2.5 text-xs font-medium whitespace-nowrap text-ink transition-[background-color,border-color,color] duration-150 ease-pop hover:border-ink/20 focus-visible:outline-none focus-visible:shadow-focus [&_svg]:size-3.5 [&_svg]:shrink-0'

function FilterChip({ pressed, onClick, title, tone = 'status', children }) {
  return (
    <button
      type="button"
      className={cn(
        chipBase,
        tone === 'status' &&
          'aria-pressed:border-chip-status-border aria-pressed:bg-chip-status aria-pressed:text-chip-status-text',
        tone === 'program' &&
          'text-ink-soft hover:text-ink aria-pressed:border-chip-programs-border aria-pressed:bg-chip-programs aria-pressed:text-chip-programs-text',
        tone === 'theme' &&
          'aria-pressed:border-chip-theme-border aria-pressed:bg-chip-theme aria-pressed:text-chip-theme-text'
      )}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
    >
      {pressed ? <CheckIcon /> : null}
      {children}
    </button>
  )
}

const programsRail =
  'flex min-w-[4.5rem] flex-[1_1_auto] items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

const popoverLabel = 'mt-3 flex flex-col gap-1.5 text-xs font-medium text-ink-soft'

const popoverSelect =
  'h-9 cursor-pointer rounded-sm border border-ink/12 bg-surface px-2.5 text-sm font-medium text-ink outline-none hover:border-ink/20 focus:border-coral/60 focus:shadow-focus'

function CourseFilterBar({
  board = false,
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
  minExcitement = 0,
  onMinExcitementChange,
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
  const excitementId = `${idPrefix}-min-excitement-filter`
  const themeLabelId = `${idPrefix}-theme-filter-label`
  const passed = className || ''
  const extraClass = passed.replace(/\bcourse-filter-bar(--board)?\b/g, '').trim()

  const extraFilterCount =
    Number(recentlyViewedOnly) +
    Number(missingPropsOnly) +
    Number(Boolean(institutionFilter)) +
    Number(minRate > 0) +
    Number(minExcitement > 0) +
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
    onMinExcitementChange?.(0)
    onThemeFilterChange('')
    setFiltersOpen(false)
  }

  const narrowed = typeof courseTotal === 'number' && courseTotal !== courseCount

  return (
    <div
      className={cn(
        board
          ? 'relative z-[4] flex min-w-0 flex-wrap items-center gap-2 border-b border-ink/8 bg-surface-muted px-3 py-2 backdrop-blur-xl'
          : 'contents',
        extraClass
      )}
    >
      {showSearch ? (
        <div
          className={cn(
            'relative',
            board
              ? 'min-w-[9rem] max-w-[22rem] flex-[0_1_18rem]'
              : 'min-w-[200px] max-w-[420px] flex-1'
          )}
        >
          <Search className={searchIcon} aria-hidden="true" />
          <input
            type="search"
            data-search-field=""
            className={cn(searchInput, 'motion-reduce:animate-none', board && 'h-8 text-sm')}
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
          <span className="h-4 w-px shrink-0 bg-ink/12" aria-hidden="true" />
          <div
            className={cn(
              programsRail,
              programsOverflow &&
                'pr-7 [mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-28px),transparent)] [-webkit-mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-28px),transparent)]'
            )}
            role="group"
            aria-label="Programas"
            ref={programsRef}
          >
            {programs.map((program) => (
              <FilterChip
                key={program}
                tone="program"
                pressed={programFilter === program}
                onClick={() => onProgramFilterChange(programFilter === program ? '' : program)}
              >
                {program}
              </FilterChip>
            ))}
          </div>
        </>
      ) : (
        <span className={cn(programsRail, 'min-w-0 p-0')} />
      )}

      <div className="relative shrink-0" ref={filtersRef}>
        <button
          type="button"
          className={cn(
            btnGhost,
            'group h-7 gap-1.5 rounded-full px-2.5 text-xs shadow-none [&_svg]:size-3.5',
            extraFilterCount
              ? 'border-chip-status-border bg-chip-status text-chip-status-text enabled:hover:bg-chip-status'
              : null
          )}
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
          <SlidersHorizontal aria-hidden="true" />
          {extraFilterCount ? `Filtros · ${extraFilterCount}` : 'Filtros'}
          <CaretIcon />
        </button>
        {filtersOpen ? (
          <div
            id={panelId}
            className={cn(popover, 'max-h-[min(70vh,480px)] w-[320px] overflow-auto p-3')}
            role="dialog"
            aria-label="Filtros"
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="Estado">
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

            <label className={popoverLabel} htmlFor={institutionId}>
              Academia
              <select
                id={institutionId}
                className={popoverSelect}
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

            <label className={popoverLabel} htmlFor={rateId}>
              Mín. ★
              <select
                id={rateId}
                className={popoverSelect}
                value={minRate}
                onChange={(event) => onMinRateChange(Number(event.target.value))}
              >
                <option value={0}>Cualquiera</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
                <option value={5}>5</option>
              </select>
            </label>

            <label className={popoverLabel} htmlFor={excitementId}>
              Ganas
              <select
                id={excitementId}
                className={popoverSelect}
                value={minExcitement}
                onChange={(event) => onMinExcitementChange?.(Number(event.target.value))}
              >
                <option value={0}>Cualquiera</option>
                {EXCITEMENT_LEVELS.map((item) => (
                  <option key={item.level} value={item.level}>
                    {item.filterLabel}
                  </option>
                ))}
              </select>
            </label>

            {themes.length > 0 ? (
              <div className="mt-3">
                <span className={cn(popoverLabel, 'mt-0 mb-2')} id={themeLabelId}>
                  Temas
                </span>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby={themeLabelId}>
                  {themes.map((theme) => (
                    <FilterChip
                      key={theme}
                      tone="theme"
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
              <button
                type="button"
                className={cn(btnGhost, 'mt-3 h-8 w-full shadow-none')}
                onClick={clearExtraFilters}
              >
                Limpiar
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {typeof courseCount === 'number' ? (
        <span
          className="shrink-0 text-xs whitespace-nowrap text-ink-soft tabular-nums"
          aria-live="polite"
        >
          {narrowed
            ? `${courseCount} de ${courseTotal} cursos`
            : `${courseCount} ${courseCount === 1 ? 'curso' : 'cursos'}`}
        </span>
      ) : null}
    </div>
  )
}

export default CourseFilterBar
