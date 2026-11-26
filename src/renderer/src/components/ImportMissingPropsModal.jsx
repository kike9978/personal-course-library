import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  btnPrimary,
  dialogShell as dialogBase,
  dialogBody,
  dialogLead as sharedDialogLead
} from '../ui/classes'

const dialogShell = cn(dialogBase, 'max-w-[560px]')
const dialogForm = dialogBody
const dialogLead = sharedDialogLead
const searchInput =
  'w-full rounded-md border border-ink/10 bg-surface px-3 py-[0.55rem] text-ink outline-none focus:shadow-focus motion-reduce:animate-none'
const rowBase =
  'flex cursor-pointer items-start gap-[0.65rem] rounded-md px-[0.65rem] py-[0.55rem] hover:bg-coral/8'

function ImportMissingPropsModal({ courses = [], onImported, onClose }) {
  const dialogRef = useRef(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set(courses.map((c) => c.path)))
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    setSelected(new Set(courses.map((c) => c.path)))
    setQuery('')
  }, [courses])

  useEffect(() => {
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) {
        try {
          dialog.showModal()
        } catch (err) {
          console.error('Failed to open import dialog:', err)
        }
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => {
      const hay = `${c.path} ${c.title || ''} ${c.institution || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [courses, query])

  const selectedCount = selected.size
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.path))

  const handleClose = () => {
    if (dialogRef.current) dialogRef.current.close()
    onClose?.()
  }

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) handleClose()
  }

  const toggleOne = (path) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of filtered) next.add(c.path)
      return next
    })
  }

  const deselectFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of filtered) next.delete(c.path)
      return next
    })
  }

  const handleImport = async () => {
    if (isImporting || selectedCount === 0) return
    setIsImporting(true)
    try {
      const paths = [...selected]
      const result = await window.api.generateCoursePropsBatch(paths)
      toast.success(
        result.createdCount
          ? `Importados ${result.createdCount} curso${result.createdCount === 1 ? '' : 's'}`
          : 'No se importó ninguno'
      )
      onImported?.(result)
      handleClose()
    } catch (err) {
      toast.error(err.message || 'No se pudo importar')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <dialog ref={dialogRef} className={dialogShell} onClose={onClose} onClick={handleBackdropClick}>
      <div className="flex items-center gap-[0.85rem] px-[1.15rem] pt-4 pb-2">
        <div>
          <h3>Importar carpetas sin props</h3>
          <p className={dialogLead}>
            Elige qué carpetas convertir en cursos. Se creará <code>courseProps.json</code> desde el
            nombre de carpeta.
          </p>
        </div>
      </div>

      <div className={dialogForm}>
        <div className="flex flex-col gap-[0.55rem]">
          <input
            type="search"
            data-search-field=""
            className={searchInput}
            placeholder="Filtrar carpetas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filtrar carpetas"
          />
          <div className="flex flex-wrap gap-[0.35rem]">
            <button
              type="button"
              className={cn(btnGhost, btnCompact)}
              onClick={allFilteredSelected ? deselectFiltered : selectFiltered}
              disabled={filtered.length === 0}
            >
              {allFilteredSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
            </button>
            <button
              type="button"
              className={cn(btnGhost, btnCompact)}
              onClick={() => setSelected(new Set())}
              disabled={selectedCount === 0}
            >
              Ninguno
            </button>
            <button
              type="button"
              className={cn(btnGhost, btnCompact)}
              onClick={() => setSelected(new Set(courses.map((c) => c.path)))}
              disabled={courses.length === 0 || selectedCount === courses.length}
            >
              Todos
            </button>
          </div>
        </div>

        <div
          className="flex max-h-[min(42vh,360px)] flex-col gap-[0.35rem] overflow-auto rounded-md border border-ink/10 bg-surface p-[0.15rem]"
          role="listbox"
          aria-multiselectable="true"
        >
          {filtered.length === 0 ? (
            <p className="m-0 p-4 text-center text-base text-ink-soft">
              No hay carpetas que coincidan.
            </p>
          ) : (
            filtered.map((course) => {
              const checked = selected.has(course.path)
              const programs =
                Array.isArray(course.programs) && course.programs.length > 0
                  ? course.programs.join(', ')
                  : null
              return (
                <label key={course.path} className={cn(rowBase, checked && 'bg-coral/12')}>
                  <input
                    className="mt-[0.2rem] shrink-0 accent-coral"
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(course.path)}
                  />
                  <span className="flex min-w-0 flex-col gap-[0.15rem]">
                    <span className="font-display leading-[1.25] font-semibold text-ink">
                      {course.title || course.path}
                    </span>
                    <span className="text-xs break-all text-ink-soft">{course.path}</span>
                    <span className="text-xs text-ink-soft">
                      {[course.institution, programs].filter(Boolean).join(' · ') ||
                        'Sin academia / programas detectados'}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-[0.35rem]">
          <span className="text-sm font-semibold text-ink-soft">
            {selectedCount} de {courses.length} seleccionada{selectedCount === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={handleClose}>
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={handleImport}
              disabled={isImporting || selectedCount === 0}
            >
              {isImporting
                ? 'Importando…'
                : `Importar${selectedCount ? ` (${selectedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

export default ImportMissingPropsModal
