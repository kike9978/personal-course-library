import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Por hacer' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Hecho' }
]

function statusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status || 'Por hacer'
}

/**
 * Detail / edit panel for a virtual project item (open-external only).
 */
function ProjectPanel({
  coursePath,
  project,
  sections = [],
  onSaved,
  onDeleted,
  onCancelCreate
}) {
  const isNew = !project?.id
  const [title, setTitle] = useState(project?.title || '')
  const [notes, setNotes] = useState(project?.notes || '')
  const [status, setStatus] = useState(project?.status || 'todo')
  const [sectionId, setSectionId] = useState(project?.sectionId || '')
  const [linkedFolderPath, setLinkedFolderPath] = useState(project?.linkedFolderPath || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(project?.title || '')
    setNotes(project?.notes || '')
    setStatus(project?.status || 'todo')
    setSectionId(project?.sectionId || '')
    setLinkedFolderPath(project?.linkedFolderPath || '')
  }, [project?.id, project?.title, project?.notes, project?.status, project?.sectionId, project?.linkedFolderPath])

  const pickFolder = async () => {
    try {
      const result = await window.api.pickProjectFolder()
      if (!result?.canceled && result.path) {
        setLinkedFolderPath(result.path)
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo elegir carpeta')
    }
  }

  const save = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error('Ponle un título al proyecto')
      return
    }
    setSaving(true)
    try {
      const list = await window.api.upsertProject(coursePath, {
        id: project?.id,
        title: trimmed,
        notes,
        status,
        sectionId: sectionId || null,
        linkedFolderPath: linkedFolderPath.trim() || null
      })
      const saved =
        list.find((p) => p.id === project?.id) ||
        list.find((p) => p.title === trimmed && p.linkedFolderPath === (linkedFolderPath.trim() || null)) ||
        list[list.length - 1]
      toast.success(isNew ? 'Proyecto creado' : 'Proyecto guardado')
      onSaved?.(list, saved)
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const unlink = async () => {
    if (!project?.id) {
      setLinkedFolderPath('')
      return
    }
    setSaving(true)
    try {
      const list = await window.api.upsertProject(coursePath, {
        id: project.id,
        linkedFolderPath: null
      })
      setLinkedFolderPath('')
      const saved = list.find((p) => p.id === project.id)
      toast.success('Vínculo quitado')
      onSaved?.(list, saved)
    } catch (err) {
      toast.error(err.message || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const openLink = async () => {
    if (!project?.id) {
      toast.error('Guarda el proyecto primero')
      return
    }
    try {
      await window.api.openProjectLink(coursePath, project.id)
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir')
    }
  }

  const revealLink = async () => {
    if (!project?.id) {
      toast.error('Guarda el proyecto primero')
      return
    }
    try {
      await window.api.revealProjectLink(coursePath, project.id)
    } catch (err) {
      toast.error(err.message || 'No se pudo revelar')
    }
  }

  const remove = async () => {
    if (!project?.id) {
      onCancelCreate?.()
      return
    }
    if (!window.confirm(`¿Borrar el proyecto “${project.title}”? No se borran archivos en disco.`)) {
      return
    }
    try {
      const list = await window.api.deleteProject(coursePath, project.id)
      toast.success('Proyecto eliminado')
      onDeleted?.(list)
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  const linkBroken = Boolean(linkedFolderPath) && project?.id && project.linkMissing
  const hasLink = Boolean(linkedFolderPath)

  return (
    <div className="project-panel">
      <div className="project-panel__header">
        <div className="project-panel__heading">
          <h2>{isNew ? 'Nuevo proyecto' : project.title}</h2>
          {!isNew ? (
            <span className={`project-panel__status is-${project.status || 'todo'}`}>
              {statusLabel(project.status)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="project-panel__body">
        {linkBroken ? (
          <div className="project-panel__warn" role="alert">
            <p>La carpeta vinculada no existe o se movió. Vuelve a vincularla para seguir.</p>
            <button type="button" className="btn btn--primary" onClick={pickFolder}>
              Volver a vincular
            </button>
          </div>
        ) : null}

        <label className="project-panel__field">
          <span>Título</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mi práctica final"
          />
        </label>

        <label className="project-panel__field">
          <span>Estado</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="project-panel__field">
          <span>Anclar a sección</span>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Proyectos (grupo general)</option>
            {sections
              .filter((s) => s.id && s.id !== '__root__')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
        </label>

        <div className="project-panel__field">
          <span>Carpeta vinculada</span>
          <div className="project-panel__path-row">
            <input
              type="text"
              value={linkedFolderPath}
              onChange={(e) => setLinkedFolderPath(e.target.value)}
              placeholder="Elige una carpeta fuera del curso…"
              spellCheck={false}
            />
            <button type="button" className="btn btn--ghost" onClick={pickFolder}>
              Elegir…
            </button>
          </div>
          <p className="project-panel__hint">
            Puede estar en cualquier disco. No se mueve ni se copia nada del curso.
          </p>
        </div>

        <label className="project-panel__field">
          <span>Notas</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Qué estás practicando, deliverables, recordatorios…"
          />
        </label>

        <div className="project-panel__actions">
          {hasLink && project?.id && !project.linkMissing ? (
            <>
              <button type="button" className="btn btn--primary" onClick={openLink}>
                Abrir carpeta del proyecto
              </button>
              <button type="button" className="btn btn--ghost" onClick={revealLink}>
                Mostrar en explorador
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
            {isNew ? 'Crear' : 'Guardar'}
          </button>
          {hasLink ? (
            <button type="button" className="btn btn--ghost" onClick={unlink} disabled={saving}>
              Quitar vínculo
            </button>
          ) : null}
          {isNew ? (
            <button type="button" className="btn btn--ghost" onClick={onCancelCreate}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={remove}>
              Borrar proyecto
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export { STATUS_OPTIONS, statusLabel }
export default ProjectPanel
