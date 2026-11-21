import { useEffect, useRef, useState } from 'react'
import AppNav from './AppNav'
import CourseFilterBar from './CourseFilterBar'
import { NotionSyncButton } from './NotionSyncControl'
import brandMark from '../assets/img/brand-mark.svg'
import { cn } from '../ui/cn'

const SORT_OPTIONS = [
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'recent', label: 'Recientes' },
  { value: 'added', label: 'Fecha de añadido' },
  { value: 'addedOldest', label: 'Añadidos primero' },
  { value: 'newest', label: 'Última modificación' },
  { value: 'rate', label: 'Mejor valorados' },
  { value: 'excitement', label: 'Más emoción' },
  { value: 'progress', label: 'Más progreso' },
  { value: 'inProgress', label: 'En curso primero' }
]

const headerIcon =
  'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:hover:bg-ink/[0.06] disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-5 [&_svg]:w-5'

const popoverItem =
  'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left text-sm font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus enabled:hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50 [&_small]:text-xs [&_small]:font-medium [&_small]:text-ink-soft'

const searchInput =
  'h-9 w-full rounded-full border border-ink/10 bg-surface py-0 pr-4 pl-[2.4rem] text-ink shadow-none outline-none transition-[box-shadow,transform] duration-[120ms] ease-[ease] focus:shadow-find motion-reduce:animate-none'

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
  minExcitement,
  onMinExcitementChange,
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
    <header className="relative z-40 shrink-0 border-b border-ink/10 bg-cream/92 px-6 pt-[0.6rem] pb-[0.55rem] backdrop-blur-[10px]">
      <div className="@container flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex shrink-0 items-center gap-[0.65rem] min-w-max">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-ink/10 bg-cream shadow-card [&_img]:block [&_img]:h-full [&_img]:w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full">
            <img src={brandMark} alt="" />
          </div>
          <div className="flex min-w-0 flex-row items-center gap-3 [&_nav]:flex-nowrap">
            <h1 className="m-0 font-display text-[1.15rem] leading-[1.1] font-black tracking-[-0.02em] whitespace-nowrap text-ink">
              Catálogo de cursos
            </h1>
            <AppNav active="library" onSelect={onNavigate} />
          </div>
        </div>

        <div className="relative min-w-[12rem] flex-[1_1_16rem] @max-[860px]:order-1 @max-[860px]:basis-full">
          <svg
            className="pointer-events-none absolute top-1/2 left-[0.95rem] h-4 w-4 -translate-y-1/2 opacity-55"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="search"
            data-search-field=""
            className={searchInput}
            value={filterText}
            placeholder="Buscar título, academia, instructor, temas, notas…"
            onChange={(e) => onFilterTextChange(e.target.value)}
            aria-label="Buscar"
            title="Buscar (Ctrl+F)"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-[0.15rem]">
          <NotionSyncButton />
          <button
            type="button"
            className={headerIcon}
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
            className={cn(headerIcon, isLoading && '[&_svg]:animate-loader')}
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
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              className={headerIcon}
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
              <div
                className="absolute top-[calc(100%+6px)] right-0 z-[5] min-w-[17rem] rounded-md border border-ink/10 bg-surface p-1.5 shadow-panel"
                role="menu"
                aria-label="Más acciones"
              >
                <button
                  type="button"
                  className={popoverItem}
                  role="menuitem"
                  disabled={isLoading || isExporting || !canExport}
                  onClick={() => {
                    setMoreOpen(false)
                    onExportCourses()
                  }}
                >
                  <span>{isExporting ? 'Exportando…' : 'Exportar metadatos de cursos'}</span>
                  <small>JSON con metadatos</small>
                </button>
                {missingCoverCount > 0 || missingDescriptionCount > 0 ? (
                  <hr className="mx-1.5 my-1 h-px border-0 bg-ink/10" />
                ) : null}
                {missingCoverCount > 0 ? (
                  <button
                    type="button"
                    className={popoverItem}
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
                    className={popoverItem}
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

      <div className="mt-2 flex min-w-0 items-center gap-2">
        <div
          className="inline-flex h-8 shrink-0 gap-[0.2rem] rounded-sm border border-ink/10 bg-surface p-0.5 shadow-none"
          role="group"
          aria-label="Vista"
        >
          <button
            type="button"
            className="grid h-[26px] w-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-0 text-ink-soft aria-pressed:bg-ink aria-pressed:text-white [&_svg]:h-4 [&_svg]:w-4"
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
            className="grid h-[26px] w-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent p-0 text-ink-soft aria-pressed:bg-ink aria-pressed:text-white [&_svg]:h-4 [&_svg]:w-4"
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

        <div className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border-strong bg-surface pr-2 pl-2.5">
          <label
            className="text-[0.72rem] font-bold tracking-[0.04em] text-ink-soft uppercase"
            htmlFor="sort-mode"
          >
            Orden
          </label>
          <select
            id="sort-mode"
            className="max-w-[9.5rem] cursor-pointer border-0 bg-transparent py-0 pr-0.5 pl-0 text-[0.8125rem] font-[650] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
          minExcitement={minExcitement}
          onMinExcitementChange={onMinExcitementChange}
          closeSignal={moreOpen}
          onFiltersToggle={(open) => {
            if (open) setMoreOpen(false)
          }}
        />

        <span
          className="shrink-0 text-[0.8rem] font-[650] whitespace-nowrap text-ink-soft"
          aria-live="polite"
        >
          {courseCount} {courseCount === 1 ? 'curso' : 'cursos'}
        </span>
      </div>
    </header>
  )
}

export default LibraryHeader
