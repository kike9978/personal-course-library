import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Check, ChevronLeft, File, FileArchive, FileText, Image } from 'lucide-react'
import LinkProjectMenu from './LinkProjectMenu'
import { ProjectsButton } from './LessonTree'
import { cn } from '../ui/cn'
import { btnGhost, btnPrimary, iconBtn, iconBtnGhost } from '../ui/classes'

const PREVIEWABLE_EXT = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.html',
  '.htm',
  '.txt',
  '.md',
  '.vtt',
  '.srt'
])

function extOf(path) {
  const m = /\.[^.\\/]+$/.exec(String(path || ''))
  return m ? m[0].toLowerCase() : ''
}

function kindLabel(kind) {
  const map = {
    doc: 'Documento',
    image: 'Imagen',
    archive: 'Archivo comprimido',
    subtitle: 'Subtítulos',
    other: 'Archivo'
  }
  return map[kind] || 'Recurso'
}

function isInlinePreview(resource) {
  if (!resource) return false
  const ext = extOf(resource.relativePath || resource.name)
  if (resource.kind === 'image') return true
  if (resource.kind === 'doc' && ['.pdf', '.html', '.htm', '.txt', '.md'].includes(ext)) return true
  if (resource.kind === 'subtitle' && PREVIEWABLE_EXT.has(ext)) return true
  return PREVIEWABLE_EXT.has(ext)
}

const KIND_ICON = {
  doc: FileText,
  image: Image,
  archive: FileArchive,
  other: File
}

function ResourceGroupView({
  title,
  hint,
  resources = [],
  progressByLesson = {},
  projects = [],
  selectedProjectId = null,
  onSelectProject,
  onToggleComplete,
  onOpenResource
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-surface px-[2.75rem] pt-[2.25rem] pb-12 text-ink">
      <header>
        <h2 className="m-0 font-display text-[1.7rem] font-extrabold">{title}</h2>
        <p className="mt-[1.1rem] text-ink-soft">{hint}</p>
      </header>
      <section className="mt-[2.25rem]">
        <h3 className="mt-0 mb-[0.85rem] text-[1.05rem] font-bold">Recursos</h3>
        <ul className="m-0 flex list-none flex-col gap-[0.15rem] p-0">
          {resources.map((res) => {
            const done = Boolean(progressByLesson?.[res.relativePath]?.completed)
            const Icon = KIND_ICON[res.kind] || File
            const linked = projects.filter((project) => project.fileRelativePath === res.relativePath)
            return (
              <li key={res.relativePath}>
                <div className="flex items-center gap-[0.65rem]">
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-[1.05rem] w-[1.05rem] shrink-0 cursor-pointer items-center justify-center rounded-[3px] border-[1.5px] border-ink/38 bg-transparent p-0 text-teal',
                      done && 'border-teal'
                    )}
                    title={done ? 'Marcar como no completado' : 'Marcar como completado'}
                    aria-pressed={done}
                    onClick={() => onToggleComplete?.(res, !done, { playable: false })}
                  >
                    {done ? <Check size={12} strokeWidth={2.75} aria-hidden="true" /> : null}
                  </button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-[0.55rem] rounded-[8px] border-0 bg-transparent px-[0.35rem] py-[0.4rem] text-left text-ink hover:bg-ink/5"
                    onClick={() => onOpenResource?.(res)}
                    title={res.relativePath}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden="true" />
                    <span className={cn('min-w-0 overflow-hidden text-ellipsis whitespace-nowrap', done && 'opacity-65')}>
                      {res.title || res.name}
                    </span>
                    <span className="ml-auto text-[0.75rem] whitespace-nowrap text-ink-soft">
                      {kindLabel(res.kind)}
                    </span>
                  </button>
                  <ProjectsButton
                    projects={linked}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={onSelectProject}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function ResourceViewer({
  coursePath,
  resource,
  projects = [],
  linkSectionId = null,
  linkSectionTitle = '',
  onToggleProjectLink,
  onToggleSectionLink,
  onCreateProject,
  onBack
}) {
  const [src, setSrc] = useState(null)
  const [textBody, setTextBody] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const ext = extOf(resource?.relativePath || resource?.name)
  const canPreview = isInlinePreview(resource)
  const isImage =
    resource?.kind === 'image' ||
    ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].includes(ext)
  const isPdf = ext === '.pdf'
  const isHtml = ext === '.html' || ext === '.htm'
  const isText = ['.txt', '.md', '.vtt', '.srt'].includes(ext)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setTextBody(null)
    setError(null)

    if (!resource?.relativePath || !coursePath || !canPreview) {
      setLoading(false)
      return undefined
    }

    setLoading(true)
    window.api
      .getLessonMediaUrl(coursePath, resource.relativePath)
      .then(async (url) => {
        if (cancelled) return
        setSrc(url)
        if (isText) {
          const res = await fetch(url)
          if (!res.ok) throw new Error('No se pudo leer el archivo')
          const text = await res.text()
          if (!cancelled) setTextBody(text)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'No se pudo cargar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [coursePath, resource?.relativePath, canPreview, isText])

  const openExternal = async () => {
    try {
      await window.api.openCourseFile(coursePath, resource.relativePath)
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir')
    }
  }

  const reveal = async () => {
    try {
      await window.api.revealCourseFile(coursePath, resource.relativePath)
    } catch (err) {
      toast.error(err.message || 'No se pudo revelar')
    }
  }

  if (!resource) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface text-ink-soft">
        <p>Selecciona un recurso del árbol.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface text-ink">
      <div className="relative z-[2] flex flex-wrap items-center gap-3 border-b border-ink/10 bg-surface px-4 py-3">
        {onBack ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-[0.1rem] border-0 bg-transparent py-[0.2rem] pr-[0.2rem] pl-0 text-[0.85rem] font-bold text-coral-deep"
            onClick={onBack}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
            Recursos
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2
            className="m-0 overflow-hidden font-display text-base font-extrabold text-ellipsis whitespace-nowrap"
            title={resource.relativePath}
          >
            {resource.title || resource.name}
          </h2>
          <span className="text-[0.72rem] font-bold tracking-[0.03em] text-ink-soft uppercase">
            {kindLabel(resource.kind)}
          </span>
        </div>
        <div className="flex flex-wrap gap-[0.4rem]">
          {onToggleProjectLink ? (
            <LinkProjectMenu
              projects={projects}
              activePath={resource.relativePath}
              sectionId={linkSectionId}
              sectionTitle={linkSectionTitle}
              onToggleFile={onToggleProjectLink}
              onToggleSection={onToggleSectionLink}
              onCreate={onCreateProject}
            />
          ) : null}
          <button type="button" className={cn(iconBtn, iconBtnGhost)} onClick={openExternal}>
            Abrir externamente
          </button>
          <button type="button" className={cn(iconBtn, iconBtnGhost)} onClick={reveal}>
            Mostrar en carpeta
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-auto p-[0.85rem]">
        {loading ? (
          <p className="absolute top-4 left-1/2 z-[2] m-0 -translate-x-1/2 text-[0.85rem] text-ink-soft">
            Cargando…
          </p>
        ) : null}
        {error ? (
          <p className="absolute top-4 left-1/2 z-[2] m-0 -translate-x-1/2 text-[0.85rem] text-coral-deep">
            {error}
          </p>
        ) : null}

        {!canPreview ? (
          <div className="m-auto flex max-w-[28rem] flex-col gap-4 text-center">
            <p className="m-0 leading-[1.45] text-ink-soft">
              Este tipo de archivo ({ext || resource.kind}) no se previsualiza aquí. Ábrelo con la
              app del sistema o muéstralo en el explorador.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className={btnPrimary} onClick={openExternal}>
                Abrir externamente
              </button>
              <button type="button" className={btnGhost} onClick={reveal}>
                Mostrar en carpeta
              </button>
            </div>
          </div>
        ) : null}

        {canPreview && isImage && src ? (
          <img
            className="max-h-full max-w-full rounded-md bg-[#111] object-contain"
            src={src}
            alt={resource.title || resource.name}
          />
        ) : null}

        {canPreview && isPdf && src ? (
          <iframe
            className="h-full min-h-[24rem] w-full rounded-md border border-ink/10 bg-white"
            title={resource.title || 'PDF'}
            src={src}
          />
        ) : null}

        {canPreview && isHtml && src ? (
          <iframe
            className="h-full min-h-[24rem] w-full rounded-md border border-ink/10 bg-white"
            title={resource.title || 'HTML'}
            src={src}
          />
        ) : null}

        {canPreview && isText && textBody != null ? (
          <pre className="m-0 w-full overflow-auto rounded-md border border-ink/10 bg-surface px-[1.1rem] py-4 text-[0.85rem] leading-[1.45] whitespace-pre-wrap">
            {textBody}
          </pre>
        ) : null}
      </div>
    </div>
  )
}

export { isInlinePreview, ResourceGroupView }
export default ResourceViewer
