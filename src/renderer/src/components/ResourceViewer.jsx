import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

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

function ResourceViewer({ coursePath, resource }) {
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
      <div className="resource-viewer resource-viewer--empty">
        <p>Selecciona un recurso del árbol.</p>
      </div>
    )
  }

  return (
    <div className="resource-viewer">
      <div className="resource-viewer__header">
        <div className="resource-viewer__heading">
          <h2 title={resource.relativePath}>{resource.title || resource.name}</h2>
          <span className="resource-viewer__kind">{kindLabel(resource.kind)}</span>
        </div>
        <div className="resource-viewer__actions">
          <button type="button" className="icon-btn icon-btn--ghost" onClick={openExternal}>
            Abrir externamente
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={reveal}>
            Mostrar en carpeta
          </button>
        </div>
      </div>

      <div className="resource-viewer__body">
        {loading ? <p className="resource-viewer__status">Cargando…</p> : null}
        {error ? (
          <p className="resource-viewer__status resource-viewer__status--error">{error}</p>
        ) : null}

        {!canPreview ? (
          <div className="resource-viewer__handoff">
            <p>
              Este tipo de archivo ({ext || resource.kind}) no se previsualiza aquí. Ábrelo con la
              app del sistema o muéstralo en el explorador.
            </p>
            <div className="resource-viewer__handoff-actions">
              <button type="button" className="btn btn--primary" onClick={openExternal}>
                Abrir externamente
              </button>
              <button type="button" className="btn btn--ghost" onClick={reveal}>
                Mostrar en carpeta
              </button>
            </div>
          </div>
        ) : null}

        {canPreview && isImage && src ? (
          <img className="resource-viewer__image" src={src} alt={resource.title || resource.name} />
        ) : null}

        {canPreview && isPdf && src ? (
          <iframe className="resource-viewer__frame" title={resource.title || 'PDF'} src={src} />
        ) : null}

        {canPreview && isHtml && src ? (
          <iframe className="resource-viewer__frame" title={resource.title || 'HTML'} src={src} />
        ) : null}

        {canPreview && isText && textBody != null ? (
          <pre className="resource-viewer__text">{textBody}</pre>
        ) : null}
      </div>
    </div>
  )
}

export { isInlinePreview }
export default ResourceViewer
