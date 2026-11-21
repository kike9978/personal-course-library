import { useEffect, useRef, useState } from 'react'
import { EXCITEMENT_LEVELS } from './ExcitementGauge'
import { cn } from '../ui/cn'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  )
}

function CaretIcon() {
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 transition-transform duration-[120ms] ease-[ease] group-aria-expanded:rotate-180"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
    </svg>
  )
}

const chipBase =
  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 text-[0.8125rem] font-[650] whitespace-nowrap text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus has-[svg]:px-2 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0'

function FilterChip({ pressed, onClick, title, tone = 'status', children }) {
  return (
    <button
      type="button"
      className={cn(
        chipBase,
        tone === 'status' &&
          'aria-pressed:border-chip-status-border aria-pressed:bg-chip-status aria-pressed:text-chip-status-text',
        tone === 'program' &&
          'font-bold text-ink-soft aria-pressed:border-chip-programs-border aria-pressed:bg-chip-programs aria-pressed:text-chip-programs-text',
        tone === 'theme' &&
          'aria-pressed:border-[#5a4a7a] aria-pressed:bg-[#ece6f7] aria-pressed:text-[#3d3058]'
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

const popoverLabel =
  'mt-3 flex flex-col gap-1 text-[0.72rem] font-bold tracking-[0.04em] text-ink-soft uppercase'

const popoverSelect =
  'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-[0.85rem] font-semibold tracking-normal text-ink normal-case focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

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
          ? 'relative z-[4] flex min-w-0 flex-wrap items-center gap-2 border-b border-ink/10 bg-surface-muted px-3 py-[0.55rem]'
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
          <svg
            className={cn(
              'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 opacity-55',
              board ? 'left-3' : 'left-[0.95rem]'
            )}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="search"
            data-search-field=""
            className={cn(
              'w-full rounded-full border border-ink/10 bg-surface text-ink shadow-none outline-none transition-[box-shadow,transform] duration-[120ms] ease-[ease] focus:shadow-find motion-reduce:animate-none',
              board
                ? 'h-8 py-0 pr-[0.85rem] pl-[2.15rem] text-[0.8125rem]'
                : 'py-[0.7rem] pr-4 pl-[2.6rem]'
            )}
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
          <span className="h-[18px] w-px shrink-0 bg-border-strong" aria-hidden="true" />
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
            chipBase,
            'group',
            extraFilterCount
              ? 'border-chip-status-border bg-chip-status text-chip-status-text'
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
          {extraFilterCount > 0 ? <CheckIcon /> : null}
          {extraFilterCount ? `Filtros · ${extraFilterCount}` : 'Filtros'}
          <CaretIcon />
        </button>
        {filtersOpen ? (
          <div
            id={panelId}
            className="absolute top-[calc(100%+6px)] right-0 z-[5] max-h-[min(70vh,480px)] w-[320px] overflow-auto rounded-md border border-ink/10 bg-surface p-3 shadow-panel"
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
              Emoción
              <select
                id={excitementId}
                className={popoverSelect}
                value={minExcitement}
                onChange={(event) => onMinExcitementChange?.(Number(event.target.value))}
              >
                <option value={0}>Cualquiera</option>
                {EXCITEMENT_LEVELS.map((item) => (
                  <option key={item.level} value={item.level}>
                    {item.label}
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
                className="mt-3 h-8 w-full cursor-pointer rounded-sm border border-border-strong bg-transparent font-bold text-ink hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
          className="shrink-0 text-[0.8rem] font-[650] whitespace-nowrap text-ink-soft"
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
