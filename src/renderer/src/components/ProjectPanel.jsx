import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import { btnGhost, btnPrimary } from '../ui/classes'

const control =
  '[&_:is(input,select,textarea)]:w-full [&_:is(input,select,textarea)]:border [&_:is(input,select,textarea)]:border-ink/10 [&_:is(input,select,textarea)]:rounded-sm [&_:is(input,select,textarea)]:bg-surface [&_:is(input,select,textarea)]:px-3 [&_:is(input,select,textarea)]:py-[0.6rem] [&_:is(input,select,textarea)]:font-medium [&_:is(input,select,textarea)]:tracking-normal [&_:is(input,select,textarea)]:text-ink [&_:is(input,select,textarea)]:shadow-none [&_:is(input,select,textarea)]:outline-none [&_:is(input,select,textarea)]:transition-[box-shadow,border-color] [&_:is(input,select,textarea)]:duration-150 [&_:is(input,select,textarea)]:focus:border-[rgba(232,69,112,0.45)] [&_:is(input,select,textarea)]:focus:shadow-focus [&_textarea]:min-h-[5rem] [&_textarea]:resize-y [&_textarea]:leading-[1.45]'
const field = cn(
  control,
  'flex flex-col gap-[0.4rem] text-xs font-semibold tracking-[0.02em] text-ink-soft'
)

function statusTone(status) {
  if (status === 'in_progress') {
    return 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
  }
  if (status === 'done') return 'border-chip-status-border bg-chip-status text-chip-status-text'
  return 'border-ink/16 bg-cream-deep text-ink-soft'
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Por hacer' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Hecho' }
]

function statusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status || 'Por hacer'
}

function folderNameFromPath(folderPath) {
  if (!folderPath) return ''
  return (
    String(folderPath)
      .replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() || ''
  )
}

function fileAnchorLabel(title, kind) {
  const name = title || 'Archivo'
  if (!kind || kind === 'video' || kind === 'audio') return name
  return `${name} · ${kind}`
}

/**
 * Select values are `section:<id>` or `file:<relativePath>`.
 * `fileSection` maps a file path to its section id (including `__root__`).
 */
function buildAnchorCatalog(sections, courseResources, courseResourceSections = []) {
  const groups = []
  const fileSection = new Map()

  const pushFile = (items, sectionId, relativePath, title, kind) => {
    if (!relativePath || fileSection.has(relativePath)) return
    fileSection.set(relativePath, sectionId || null)
    items.push({ value: `file:${relativePath}`, label: fileAnchorLabel(title, kind) })
  }

  const visit = (list, prefix) => {
    for (const section of list || []) {
      const title = section.title || 'Sección'
      const label = prefix ? `${prefix} / ${title}` : title
      const items = []
      if (section.id && section.id !== '__root__') {
        items.push({ value: `section:${section.id}`, label: 'Toda la sección' })
      }
      for (const lesson of section.lessons || []) {
        pushFile(items, section.id, lesson.relativePath, lesson.title, lesson.kind)
        for (const res of visibleAnchorResources(lesson.resources)) {
          pushFile(items, section.id, res.relativePath, res.title || res.name, res.kind)
        }
      }
      for (const res of visibleAnchorResources(section.resources)) {
        pushFile(items, section.id, res.relativePath, res.title || res.name, res.kind)
      }
      if (items.length) {
        groups.push({ id: section.id || label, label, items })
      }
      visit(section.sections, label)
    }
  }
  visit(sections, '')

  const courseItems = []
  for (const res of visibleAnchorResources(courseResources)) {
    pushFile(courseItems, null, res.relativePath, res.title || res.name, res.kind)
  }
  if (courseItems.length) {
    groups.push({ id: '__course_resources__', label: 'Recursos del curso', items: courseItems })
  }
  visit(courseResourceSections, 'Recursos del curso')

  return { groups, fileSection }
}

/** Real course section that contains a lesson or file. Root files have no section anchor. */
export function sectionForPath(sections, relativePath) {
  if (!relativePath) return null
  let found = null
  const walk = (list) => {
    for (const section of list || []) {
      if (section?.id && section.id !== '__root__') {
        const inLesson = (section.lessons || []).some(
          (lesson) =>
            lesson.relativePath === relativePath ||
            (lesson.resources || []).some((res) => res.relativePath === relativePath)
        )
        const inResources = (section.resources || []).some(
          (res) => res.relativePath === relativePath
        )
        if (inLesson || inResources) found = { id: section.id, title: section.title || section.id }
      }
      walk(section.sections)
    }
  }
  walk(sections)
  return found
}

/** Section stored alongside a file anchor, including `__root__` when the file lives there. */
export function placementForFile(
  sections,
  courseResources,
  relativePath,
  courseResourceSections = []
) {
  const path = relativePath || null
  if (!path) return { fileRelativePath: null, sectionId: null }
  const { fileSection } = buildAnchorCatalog(sections, courseResources, courseResourceSections)
  return {
    fileRelativePath: path,
    sectionId: fileSection.get(path) || null
  }
}

function visibleAnchorResources(resources) {
  return (resources || []).filter((res) => res.kind !== 'subtitle' && res.relativePath)
}

function anchorFromProject(project) {
  if (project?.fileRelativePath) return `file:${project.fileRelativePath}`
  if (project?.sectionId && project.sectionId !== '__root__') return `section:${project.sectionId}`
  return ''
}

function resolveAnchor(anchor, fileSection) {
  if (!anchor) return { sectionId: null, fileRelativePath: null }
  if (anchor.startsWith('file:')) {
    const fileRelativePath = anchor.slice('file:'.length)
    return {
      fileRelativePath,
      sectionId: fileSection.get(fileRelativePath) || null
    }
  }
  if (anchor.startsWith('section:')) {
    return { sectionId: anchor.slice('section:'.length) || null, fileRelativePath: null }
  }
  return { sectionId: null, fileRelativePath: null }
}

/**
 * Detail / edit panel for a virtual project item (open-external only).
 */
function ProjectPanel({
  coursePath,
  project,
  sections = [],
  courseResources = [],
  courseResourceSections = [],
  onSaved,
  onDeleted,
  onCancelCreate,
  plain = false
}) {
  const isNew = !project?.id
  const [title, setTitle] = useState(project?.title || '')
  const [notes, setNotes] = useState(project?.notes || '')
  const [status, setStatus] = useState(project?.status || 'todo')
  const [anchor, setAnchor] = useState(() => anchorFromProject(project))
  const [linkedFolderPath, setLinkedFolderPath] = useState(project?.linkedFolderPath || '')
  const [saving, setSaving] = useState(false)
  const { groups, fileSection } = buildAnchorCatalog(
    sections,
    courseResources,
    courseResourceSections
  )

  useEffect(() => {
    setTitle(project?.title || '')
    setNotes(project?.notes || '')
    setStatus(project?.status || 'todo')
    setAnchor(anchorFromProject(project))
    setLinkedFolderPath(project?.linkedFolderPath || '')
  }, [
    project?.id,
    project?.title,
    project?.notes,
    project?.status,
    project?.sectionId,
    project?.fileRelativePath,
    project?.linkedFolderPath
  ])

  const pickFolder = async () => {
    try {
      const result = await window.api.pickProjectFolder()
      if (result?.canceled || !result?.path) return
      const nextName = result.name || folderNameFromPath(result.path)
      const previousName = folderNameFromPath(linkedFolderPath)
      setLinkedFolderPath(result.path)
      // Prefill title from folder when empty, or when it still matches the previous folder name.
      if (!title.trim() || (previousName && title.trim() === previousName)) {
        setTitle(nextName)
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
      const placement = resolveAnchor(anchor, fileSection)
      const list = await window.api.upsertProject(coursePath, {
        id: project?.id,
        title: trimmed,
        notes,
        status,
        sectionId: placement.sectionId,
        fileRelativePath: placement.fileRelativePath,
        linkedFolderPath: linkedFolderPath.trim() || null
      })
      const saved =
        list.find((p) => p.id === project?.id) ||
        list.find(
          (p) => p.title === trimmed && p.linkedFolderPath === (linkedFolderPath.trim() || null)
        ) ||
        list[list.length - 1]
      toast.success(isNew ? 'Proyecto creado' : 'Proyecto guardado')
      const becameDone = status === 'done' && (project?.status || 'todo') !== 'done'
      onSaved?.(list, saved, { becameDone })
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
    if (
      !window.confirm(`¿Borrar el proyecto “${project.title}”? No se borran archivos en disco.`)
    ) {
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
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col text-ink',
        plain
          ? 'bg-surface'
          : 'bg-[radial-gradient(circle_at_8%_0%,rgba(232,69,112,0.04),transparent_42%),radial-gradient(circle_at_92%_6%,rgba(61,122,122,0.04),transparent_40%),var(--color-cream-deep)]'
      )}
    >
      <div className="border-b border-ink/10 bg-surface-muted px-5 py-4 backdrop-blur-[10px]">
        <div className="flex flex-wrap items-center gap-[0.65rem]">
          <h2 className="m-0 font-display text-lg font-bold tracking-[-0.02em] text-ink">
            {isNew ? 'Nuevo proyecto' : project.title}
          </h2>
          {!isNew ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-[0.6rem] py-[0.22rem] text-2xs font-semibold tracking-[0.05em] uppercase',
                statusTone(project.status)
              )}
            >
              {statusLabel(project.status)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex max-w-[40rem] min-h-0 flex-1 flex-col gap-[0.95rem] overflow-auto px-5 pt-[1.15rem] pb-7">
        {linkBroken ? (
          <div
            className="flex flex-wrap items-center gap-[0.65rem] rounded-md border border-[rgba(232,69,112,0.28)] bg-[rgba(232,69,112,0.07)] px-[0.95rem] py-[0.85rem] shadow-card"
            role="alert"
          >
            <p className="m-0 min-w-[12rem] flex-1 text-base font-medium text-ink">
              La carpeta vinculada no existe o se movió. Vuelve a vincularla para seguir.
            </p>
            <button type="button" className={btnPrimary} onClick={pickFolder}>
              Volver a vincular
            </button>
          </div>
        ) : null}

        <div className={field}>
          <span>Carpeta vinculada</span>
          <div className="flex gap-[0.45rem] [&_input]:min-w-0 [&_input]:flex-1">
            <input
              type="text"
              value={linkedFolderPath}
              onChange={(e) => setLinkedFolderPath(e.target.value)}
              placeholder="Elige una carpeta fuera del curso…"
              spellCheck={false}
            />
            <button type="button" className={btnGhost} onClick={pickFolder}>
              Elegir…
            </button>
          </div>
          <p className="m-0 text-xs font-medium text-ink-soft">
            Puede estar en cualquier disco. No se mueve ni se copia nada del curso.
          </p>
        </div>

        <label className={field}>
          <span>Título</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mi práctica final"
          />
        </label>

        <label className={field}>
          <span>Estado</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className={field}>
          <span>Anclar a</span>
          <select value={anchor} onChange={(e) => setAnchor(e.target.value)}>
            <option value="">Proyectos (grupo general)</option>
            {anchor &&
            !groups.some((group) => group.items.some((item) => item.value === anchor)) ? (
              <option value={anchor}>
                {anchor.startsWith('file:')
                  ? folderNameFromPath(anchor.slice('file:'.length))
                  : anchor.slice('section:'.length)}
              </option>
            ) : null}
            {groups.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="m-0 text-xs font-medium text-ink-soft">
            El proyecto puede quedar en una sección o junto a un archivo o video.
          </p>
        </label>

        <label className={field}>
          <span>Notas</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Qué estás practicando, deliverables, recordatorios…"
          />
        </label>

        <div className="mt-[0.15rem] flex flex-wrap gap-2 border-t border-ink/10 pt-2">
          {hasLink && project?.id && !project.linkMissing ? (
            <>
              <button type="button" className={btnPrimary} onClick={openLink}>
                Abrir carpeta del proyecto
              </button>
              <button type="button" className={btnGhost} onClick={revealLink}>
                Mostrar en explorador
              </button>
            </>
          ) : null}
          <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
            {isNew ? 'Crear' : 'Guardar'}
          </button>
          {hasLink ? (
            <button type="button" className={btnGhost} onClick={unlink} disabled={saving}>
              Quitar vínculo
            </button>
          ) : null}
          {isNew ? (
            <button type="button" className={btnGhost} onClick={onCancelCreate}>
              Cancelar
            </button>
          ) : (
            <button type="button" className={btnGhost} onClick={remove}>
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
