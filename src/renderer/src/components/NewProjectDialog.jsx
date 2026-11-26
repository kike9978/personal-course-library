import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import {
  btnGhost,
  btnPrimary,
  dialogBody,
  dialogLead,
  dialogShell,
  dialogTitle,
  fieldControl,
  fieldLabel,
  segmented,
  segmentedItem,
  selectControl
} from '../ui/classes'
import { STATUS_OPTIONS } from './ProjectPanel'

function folderName(folderPath) {
  return (
    String(folderPath || '')
      .replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() || ''
  )
}

/**
 * Create a project from the board without opening its course first.
 * The project lands in the course's general "Proyectos" group; anchor it later from the course.
 */
function NewProjectDialog({ courses = [], defaultCoursePath = '', onCreated, onClose }) {
  const dialogRef = useRef(null)
  const titleRef = useRef(null)
  const [coursePath, setCoursePath] = useState(defaultCoursePath)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('todo')
  const [folder, setFolder] = useState('')
  const [saving, setSaving] = useState(false)

  const sortedCourses = useMemo(
    () =>
      [...courses].sort((a, b) =>
        (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
      ),
    [courses]
  )

  useEffect(() => {
    const dialog = dialogRef.current
    const frame = requestAnimationFrame(() => {
      if (dialog && !dialog.open) {
        try {
          dialog.showModal()
          ;(defaultCoursePath ? titleRef.current : dialog.querySelector('select'))?.focus()
        } catch (err) {
          console.error('Failed to open new project dialog:', err)
        }
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [defaultCoursePath])

  const close = () => {
    dialogRef.current?.close()
  }

  const pickFolder = async () => {
    try {
      const result = await window.api.pickProjectFolder()
      if (result?.canceled || !result?.path) return
      const previous = folderName(folder)
      setFolder(result.path)
      if (!title.trim() || (previous && title.trim() === previous)) {
        setTitle(result.name || folderName(result.path))
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo elegir carpeta')
    }
  }

  const create = async (event) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!coursePath) {
      toast.error('Elige un curso')
      return
    }
    if (!trimmed) {
      toast.error('Ponle un título al proyecto')
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      await window.api.upsertProject(coursePath, {
        title: trimmed,
        status,
        linkedFolderPath: folder || null
      })
      toast.success('Proyecto creado')
      onCreated?.()
      close()
    } catch (err) {
      toast.error(err.message || 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={cn(dialogShell, 'max-w-[480px]')}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) close()
      }}
    >
      <form className={dialogBody} onSubmit={create}>
        <div className="pt-3">
          <h3 className={dialogTitle}>Nuevo proyecto</h3>
          <p className={dialogLead}>
            Queda en el grupo Proyectos del curso. Puedes anclarlo a una sección desde el curso.
          </p>
        </div>

        <label className="flex flex-col">
          <span className={fieldLabel}>Curso</span>
          <select
            className={cn(selectControl, 'w-full')}
            value={coursePath}
            onChange={(e) => setCoursePath(e.target.value)}
          >
            <option value="">Elige un curso…</option>
            {sortedCourses.map((course) => (
              <option key={course.path} value={course.path}>
                {course.title || course.path}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col">
          <span className={fieldLabel}>Título</span>
          <input
            ref={titleRef}
            type="text"
            className={fieldControl}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mi práctica final"
          />
        </label>

        <div className="flex flex-col" role="group" aria-labelledby="new-project-status">
          <span id="new-project-status" className={fieldLabel}>
            Estado
          </span>
          <div className={cn(segmented, 'self-start')}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={segmentedItem}
                aria-pressed={status === opt.value}
                onClick={() => setStatus(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <span className={fieldLabel}>Carpeta (opcional)</span>
          <div className="flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate text-sm text-ink-soft"
              title={folder || undefined}
            >
              {folder || 'Sin carpeta'}
            </span>
            {folder ? (
              <button type="button" className={btnGhost} onClick={() => setFolder('')}>
                Quitar
              </button>
            ) : null}
            <button type="button" className={btnGhost} onClick={pickFolder}>
              Elegir…
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={close}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            Crear
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default NewProjectDialog
