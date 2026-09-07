import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

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
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.path))

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
    <dialog
      ref={dialogRef}
      className="dialog dialog--import"
      onClose={onClose}
      onClick={handleBackdropClick}
    >
      <div className="dialog__preview">
        <div>
          <h3>Importar carpetas sin props</h3>
          <p className="dialog__lead">
            Elige qué carpetas convertir en cursos. Se creará <code>courseProps.json</code> desde el
            nombre de carpeta.
          </p>
        </div>
      </div>

      <div className="dialog__form">
        <div className="import-props__toolbar">
          <input
            type="search"
            className="import-props__search"
            placeholder="Filtrar carpetas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filtrar carpetas"
          />
          <div className="import-props__bulk">
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={allFilteredSelected ? deselectFiltered : selectFiltered}
              disabled={filtered.length === 0}
            >
              {allFilteredSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => setSelected(new Set())}
              disabled={selectedCount === 0}
            >
              Ninguno
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => setSelected(new Set(courses.map((c) => c.path)))}
              disabled={courses.length === 0 || selectedCount === courses.length}
            >
              Todos
            </button>
          </div>
        </div>

        <div className="import-props__list" role="listbox" aria-multiselectable="true">
          {filtered.length === 0 ? (
            <p className="import-props__empty">No hay carpetas que coincidan.</p>
          ) : (
            filtered.map((course) => {
              const checked = selected.has(course.path)
              const programs =
                Array.isArray(course.programs) && course.programs.length > 0
                  ? course.programs.join(', ')
                  : null
              return (
                <label
                  key={course.path}
                  className={`import-props__row${checked ? ' is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(course.path)}
                  />
                  <span className="import-props__meta">
                    <span className="import-props__title">{course.title || course.path}</span>
                    <span className="import-props__folder">{course.path}</span>
                    <span className="import-props__hint">
                      {[course.institution, programs].filter(Boolean).join(' · ') ||
                        'Sin academia / programas detectados'}
                    </span>
                  </span>
                </label>
              )
            })
          )}
        </div>

        <div className="dialog__actions dialog__actions--spread">
          <span className="import-props__count">
            {selectedCount} de {courses.length} seleccionada{selectedCount === 1 ? '' : 's'}
          </span>
          <div className="dialog__actions-btns">
            <button type="button" className="btn btn--ghost" onClick={handleClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--primary"
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
