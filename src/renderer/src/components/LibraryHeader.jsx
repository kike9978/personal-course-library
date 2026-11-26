import { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, Ellipsis, FolderOpen, LayoutGrid, List, RefreshCw, Search } from 'lucide-react'
import AppHeader from './AppHeader'
import CourseFilterBar from './CourseFilterBar'
import { NotionSyncButton } from './NotionSyncControl'
import { cn } from '../ui/cn'
import {
  iconOnly,
  menuDivider,
  menuItem,
  popover,
  searchIcon,
  searchInput,
  segmented,
  segmentedItem,
  selectControl
} from '../ui/classes'

const SORT_OPTIONS = [
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'recent', label: 'Recientes' },
  { value: 'added', label: 'Fecha de añadido' },
  { value: 'addedOldest', label: 'Añadidos primero' },
  { value: 'newest', label: 'Última modificación' },
  { value: 'rate', label: 'Mejor valorados' },
  { value: 'excitement', label: 'Más ganas' },
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
    <AppHeader
      active="library"
      onNavigate={onNavigate}
      center={
        <>
          <Search className={searchIcon} aria-hidden="true" />
          <input
            type="search"
            data-search-field=""
            className={cn(searchInput, 'motion-reduce:animate-none @min-[700px]:pr-16')}
            value={filterText}
            placeholder="Buscar título, academia, instructor, temas, notas…"
            onChange={(e) => onFilterTextChange(e.target.value)}
            aria-label="Buscar"
            title="Buscar (Ctrl+F)"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-xs border border-ink/10 bg-cream px-1.5 font-body text-2xs text-ink-faint @min-[700px]:block">
            Ctrl F
          </kbd>
        </>
      }
      actions={
        <>
          <NotionSyncButton />
          <span className="mx-1 h-5 w-px bg-ink/10" aria-hidden="true" />
          <button
            type="button"
            className={iconOnly}
            onClick={onChangeLibrary}
            title="Cambiar carpeta"
            aria-label="Cambiar carpeta"
          >
            <FolderOpen aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(iconOnly, isLoading && '[&_svg]:animate-loader')}
            onClick={onRefresh}
            disabled={isLoading}
            title="Refrescar (Ctrl+R)"
            aria-label="Refrescar"
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              className={cn(iconOnly, moreOpen && 'bg-ink/6 text-ink')}
              aria-label="Más acciones"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="Más acciones"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Ellipsis aria-hidden="true" />
            </button>
            {moreOpen ? (
              <div className={popover} role="menu" aria-label="Más acciones">
                <button
                  type="button"
                  className={menuItem}
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
                  <hr className={menuDivider} />
                ) : null}
                {missingCoverCount > 0 ? (
                  <button
                    type="button"
                    className={menuItem}
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
                    className={menuItem}
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
        </>
      }
    >
      <div className={cn(segmented, 'h-8')} role="group" aria-label="Vista">
        <button
          type="button"
          className={cn(segmentedItem, 'w-8 px-0')}
          aria-pressed={isCardLayout}
          aria-label="Tarjetas"
          title="Tarjetas"
          onClick={() => onCardLayoutChange(true)}
        >
          <LayoutGrid aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(segmentedItem, 'w-8 px-0')}
          aria-pressed={!isCardLayout}
          aria-label="Lista"
          title="Lista"
          onClick={() => onCardLayoutChange(false)}
        >
          <List aria-hidden="true" />
        </button>
      </div>

      <label className="relative inline-flex h-8 shrink-0 items-center" htmlFor="sort-mode">
        <ArrowDownUp
          className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint"
          aria-hidden="true"
        />
        <span className="sr-only">Orden</span>
        <select
          id="sort-mode"
          className={cn(selectControl, 'h-8 max-w-[11rem] pl-8 text-xs')}
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value)}
          title="Orden"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <span className="h-4 w-px shrink-0 bg-ink/12" aria-hidden="true" />

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
        className="shrink-0 text-xs whitespace-nowrap text-ink-soft tabular-nums"
        aria-live="polite"
      >
        {courseCount} {courseCount === 1 ? 'curso' : 'cursos'}
      </span>
    </AppHeader>
  )
}

export default LibraryHeader
