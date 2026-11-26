import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { cn } from '../ui/cn'
import { Archive, ArchiveRestore, Folder, FolderOpen, FolderSearch, Trash2 } from 'lucide-react'
import { btnCompact, btnGhost, btnPrimary, btnQuiet, segmented, segmentedItem } from '../ui/classes'
import { askConfirm } from '../utils/askConfirm'
import AnchorPicker from './AnchorPicker'

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
  if (status === 'paused') return 'border-warn-border bg-warn text-warn-text'
  return 'border-ink/16 bg-cream-deep text-ink-soft'
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Por hacer' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'paused', label: 'En pausa' },
  { value: 'done', label: 'Hecho' }
]

function statusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status || 'Por hacer'
}

function formatHistoryDate(at) {
  if (!at) return ''
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  })
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
    items.push({ value: `file:${relativePath}`, label: title || 'Archivo', kind: kind || 'other' })
  }

  const visit = (list, prefix) => {
    for (const section of list || []) {
      const title = section.title || 'Sección'
      const label = prefix ? `${prefix} / ${title}` : title
      const items = []
      const sectionValue = section.id && section.id !== '__root__' ? `section:${section.id}` : null
      for (const lesson of section.lessons || []) {
        pushFile(items, section.id, lesson.relativePath, lesson.title, lesson.kind)
        for (const res of visibleAnchorResources(lesson.resources)) {
          pushFile(items, section.id, res.relativePath, res.title || res.name, res.kind)
        }
      }
      for (const res of visibleAnchorResources(section.resources)) {
        pushFile(items, section.id, res.relativePath, res.title || res.name, res.kind)
      }
      if (items.length || sectionValue) {
        groups.push({ id: section.id || label, label, sectionValue, items })
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
  // Only a folder the person picked or removed is sent on save. A project linked on another
  // computer has no local path until this one sets its projects root, and saving must keep it.
  const [folderTouched, setFolderTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const { groups, fileSection } = buildAnchorCatalog(
    sections,
    courseResources,
    courseResourceSections
  )

  // One effect per field, so saving the status instantly does not wipe unsaved edits elsewhere.
  useEffect(() => setTitle(project?.title || ''), [project?.id, project?.title])
  useEffect(() => setNotes(project?.notes || ''), [project?.id, project?.notes])
  useEffect(() => setStatus(project?.status || 'todo'), [project?.id, project?.status])
  useEffect(
    () => setAnchor(anchorFromProject(project)),
    [project?.id, project?.sectionId, project?.fileRelativePath]
  )
  useEffect(() => {
    setLinkedFolderPath(project?.linkedFolderPath || '')
    setFolderTouched(false)
  }, [project?.id, project?.linkedFolderPath, project?.linkedFolderRelative])

  const changeStatus = async (next) => {
    if (next === status) return
    const previous = status
    setStatus(next)
    if (isNew) return
    try {
      const list = await window.api.upsertProject(coursePath, { id: project.id, status: next })
      const saved = list.find((p) => p.id === project.id)
      const becameDone = next === 'done' && (project?.status || 'todo') !== 'done'
      onSaved?.(list, saved, { becameDone })
    } catch (err) {
      setStatus(previous)
      toast.error(err.message || 'No se pudo cambiar el estado')
    }
  }

  const pickFolder = async () => {
    try {
      const result = await window.api.pickProjectFolder()
      if (result?.canceled || !result?.path) return
      const nextName = result.name || folderNameFromPath(result.path)
      const previousName = folderNameFromPath(linkedFolderPath)
      setLinkedFolderPath(result.path)
      setFolderTouched(true)
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
        ...(isNew || folderTouched ? { linkedFolderPath: linkedFolderPath.trim() || null } : {})
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

  const savedAnchor = anchorFromProject(project)
  const savedFolder = project?.linkedFolderPath || ''
  const dirty =
    !isNew &&
    (title.trim() !== (project?.title || '') ||
      notes.trim() !== (project?.notes || '') ||
      anchor !== savedAnchor ||
      folderTouched)

  const discard = () => {
    setTitle(project?.title || '')
    setNotes(project?.notes || '')
    setAnchor(savedAnchor)
    setLinkedFolderPath(savedFolder)
    setFolderTouched(false)
  }

  const pickProjectsRoot = async () => {
    try {
      const result = await window.api.pickProjectsRoot()
      if (result?.canceled) return
      // The board and course room reload on the projects-changed broadcast.
      toast.success('Carpeta de proyectos guardada en este equipo')
    } catch (err) {
      toast.error(err.message || 'No se pudo elegir la carpeta de proyectos')
    }
  }

  const openLink = async () => {
    try {
      await window.api.openProjectLink(coursePath, project.id)
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir')
    }
  }

  const revealLink = async () => {
    try {
      await window.api.revealProjectLink(coursePath, project.id)
    } catch (err) {
      toast.error(err.message || 'No se pudo revelar')
    }
  }

  const remove = async () => {
    if (
      !(await askConfirm({
        title: 'Borrar proyecto',
        message: `¿Borrar «${project.title}»? Los archivos de la carpeta no se tocan.`,
        confirmLabel: 'Borrar',
        cancelLabel: 'Cancelar'
      }))
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

  const toggleArchive = async () => {
    try {
      const list = await window.api.upsertProject(coursePath, {
        id: project.id,
        archived: !project.archivedAt
      })
      toast.success(project.archivedAt ? 'Proyecto desarchivado' : 'Proyecto archivado')
      onSaved?.(
        list,
        list.find((p) => p.id === project.id)
      )
    } catch (err) {
      toast.error(err.message || 'No se pudo archivar')
    }
  }

  const history = (project?.statusHistory || []).slice(-6)

  const onKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (isNew || dirty) void save()
    }
  }

  // The stored link is what open/reveal act on; an unsaved folder change hides them.
  const canOpen = !isNew && Boolean(savedFolder) && !project.linkMissing
  const linkBroken = !isNew && Boolean(savedFolder) && project.linkMissing && !folderTouched
  // Linked on another computer; this one has not set its projects root yet.
  const needsRoot = !isNew && project?.linkNeedsRoot && !folderTouched
  const sharedFolder = !isNew && !folderTouched && Boolean(project?.linkedFolderRelative)
  const folderName = needsRoot
    ? folderNameFromPath(project.linkedFolderRelative)
    : folderNameFromPath(linkedFolderPath)

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col text-ink',
        plain
          ? 'bg-surface'
          : 'bg-[radial-gradient(circle_at_8%_0%,rgba(232,69,112,0.04),transparent_42%),radial-gradient(circle_at_92%_6%,rgba(61,122,122,0.04),transparent_40%),var(--color-cream-deep)]'
      )}
      onKeyDown={onKeyDown}
    >
      <div className="flex flex-wrap items-center gap-[0.65rem] border-b border-ink/10 bg-surface-muted px-5 py-4 backdrop-blur-[10px]">
        <h2 className="m-0 min-w-0 truncate font-display text-lg font-bold tracking-[-0.02em] text-ink">
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
        {canOpen ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={revealLink}
              title="Mostrar en explorador"
            >
              <FolderSearch size={16} aria-hidden="true" />
              Mostrar
            </button>
            <button type="button" className={btnPrimary} onClick={openLink}>
              <FolderOpen size={16} aria-hidden="true" />
              Abrir carpeta
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 max-w-[40rem] flex-1 flex-col gap-[1.1rem] overflow-auto px-5 pt-[1.15rem] pb-7">
        <label className={field}>
          <span>Título</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mi práctica final"
            autoFocus={isNew}
          />
        </label>

        <div className={field} role="group" aria-labelledby="project-status-label">
          <span id="project-status-label">
            Estado
            {!isNew ? (
              <span className="ml-2 font-medium tracking-normal text-ink-faint">
                · se guarda al instante
              </span>
            ) : null}
          </span>
          <div className={cn(segmented, 'self-start')}>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={segmentedItem}
                aria-pressed={status === opt.value}
                onClick={() => changeStatus(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={field}>
          <span id="project-anchor-label">Dónde aparece en el curso</span>
          <AnchorPicker
            value={anchor}
            groups={groups}
            onChange={setAnchor}
            fallbackLabel={
              anchor.startsWith('file:')
                ? folderNameFromPath(anchor.slice('file:'.length))
                : anchor.slice('section:'.length)
            }
          />
        </div>

        <div className={field}>
          <span>Carpeta del proyecto</span>
          <div
            className={cn(
              'flex items-center gap-3 rounded-sm border px-3 py-2.5',
              linkBroken
                ? 'border-[rgba(232,69,112,0.28)] bg-[rgba(232,69,112,0.07)]'
                : 'border-ink/10 bg-surface'
            )}
            role={linkBroken ? 'alert' : undefined}
          >
            <Folder
              className={cn('size-5 shrink-0', linkBroken ? 'text-coral-deep' : 'text-ink-faint')}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 tracking-normal">
              {needsRoot ? (
                <>
                  <div className="truncate text-sm font-semibold text-ink">{folderName}</div>
                  <div className="text-2xs font-medium text-ink-soft">
                    Vinculada en otro equipo ({project.linkedFolderRelative}). Elige dónde está tu
                    carpeta de proyectos en este equipo.
                  </div>
                </>
              ) : linkedFolderPath ? (
                <>
                  <div className="truncate text-sm font-semibold text-ink">{folderName}</div>
                  <div
                    className="truncate font-mono text-2xs font-medium text-ink-soft select-text"
                    title={linkedFolderPath}
                  >
                    {linkBroken ? 'No se encuentra: ' : ''}
                    {linkedFolderPath}
                  </div>
                  {!isNew && !folderTouched ? (
                    <div className="text-2xs font-medium text-ink-faint">
                      {sharedFolder
                        ? 'En tu carpeta de proyectos: se abre en todos tus equipos'
                        : 'Fuera de la carpeta de proyectos: solo en este equipo'}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-sm font-medium text-ink-soft">
                  Sin carpeta. Puede estar en cualquier disco; no se copia nada.
                </div>
              )}
            </div>
            {needsRoot ? (
              <button
                type="button"
                className={cn(btnPrimary, btnCompact)}
                onClick={pickProjectsRoot}
              >
                Carpeta de proyectos…
              </button>
            ) : null}
            <button
              type="button"
              className={cn(linkBroken ? btnPrimary : btnGhost, btnCompact)}
              onClick={pickFolder}
            >
              {linkBroken ? 'Volver a vincular' : linkedFolderPath ? 'Cambiar…' : 'Elegir…'}
            </button>
            {linkedFolderPath || needsRoot ? (
              <button
                type="button"
                className={cn(btnQuiet, btnCompact)}
                onClick={() => {
                  setLinkedFolderPath('')
                  setFolderTouched(true)
                }}
                title="Quitar vínculo (no borra la carpeta)"
              >
                Quitar
              </button>
            ) : null}
          </div>
        </div>

        <label className={field}>
          <span>Notas</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Qué estás practicando, entregables, recordatorios…"
          />
        </label>

        {!isNew && history.length ? (
          <div className={field}>
            <span>Historial</span>
            <ol className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-1 p-0 text-xs font-medium tracking-normal text-ink-soft">
              {history.map((entry, index) => (
                <li
                  key={`${entry.status}-${entry.at}`}
                  className="inline-flex items-center gap-1.5"
                >
                  {index > 0 ? <span aria-hidden="true">→</span> : null}
                  <span className="font-semibold text-ink">{statusLabel(entry.status)}</span>
                  <span>{formatHistoryDate(entry.at)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <div className="flex max-w-[40rem] flex-wrap items-center gap-2 border-t border-ink/10 px-5 py-3">
        {isNew ? null : (
          <button
            type="button"
            className={cn(btnQuiet, 'enabled:hover:bg-danger-soft enabled:hover:text-danger')}
            onClick={remove}
          >
            <Trash2 size={15} aria-hidden="true" />
            Borrar
          </button>
        )}
        {!isNew && project.status === 'done' ? (
          <button
            type="button"
            className={btnQuiet}
            onClick={toggleArchive}
            title={
              project.archivedAt
                ? 'Volver a mostrarlo en la columna Hecho'
                : 'Sacarlo del tablero; sigue en el curso y en el archivo'
            }
          >
            {project.archivedAt ? (
              <ArchiveRestore size={15} aria-hidden="true" />
            ) : (
              <Archive size={15} aria-hidden="true" />
            )}
            {project.archivedAt ? 'Desarchivar' : 'Archivar'}
          </button>
        ) : null}
        <span className="ml-auto text-xs font-medium text-ink-soft" aria-live="polite">
          {dirty ? 'Cambios sin guardar' : ''}
        </span>
        {isNew ? (
          <button type="button" className={btnGhost} onClick={onCancelCreate}>
            Cancelar
          </button>
        ) : dirty ? (
          <button type="button" className={btnGhost} onClick={discard}>
            Descartar
          </button>
        ) : null}
        <button
          type="button"
          className={btnPrimary}
          onClick={save}
          disabled={saving || (!isNew && !dirty)}
          title="Ctrl+S"
        >
          {isNew ? 'Crear proyecto' : dirty ? 'Guardar cambios' : 'Guardado'}
        </button>
      </div>
    </div>
  )
}

export { STATUS_OPTIONS, statusLabel }
export default ProjectPanel
