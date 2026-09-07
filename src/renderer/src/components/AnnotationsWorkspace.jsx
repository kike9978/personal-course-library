import { useEffect, useMemo, useState, Fragment } from 'react'
import { toast } from 'react-hot-toast'
import NoteEditor from './NoteEditor'
import { formatTime } from './StudySidePanel'
import { groupAnnotationsByTarget } from '../utils/annotationGroups'

function noteTitleFallback(item) {
  if (!item) return 'Sin título'
  const first = String(item.body || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (first) return first.length > 72 ? `${first.slice(0, 72)}…` : first
  if (typeof item.timeSec === 'number') {
    return `${item.lessonTitle || 'Marca'} · ${formatTime(item.timeSec)}`
  }
  if (item.projectTitle) return item.projectTitle
  if (item.lessonTitle) return item.lessonTitle
  return 'Nota del curso'
}

function noteTitle(item) {
  const explicit = String(item?.title || '').trim()
  if (explicit) return explicit.length > 72 ? `${explicit.slice(0, 72)}…` : explicit
  return noteTitleFallback(item)
}

function formatDateTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

function contextLabel(item) {
  if (typeof item.timeSec === 'number') return formatTime(item.timeSec)
  if (item.projectId) return 'Proyecto'
  if (item.lessonRelativePath) return 'Sin tiempo'
  return 'Curso'
}

/**
 * Notion-like annotations workspace: table + document pane with Lexical.
 */
function AnnotationsWorkspace({
  title = 'Anotaciones',
  subtitle,
  annotations = [],
  selectedId,
  onSelect,
  onBack,
  onCreate,
  onSave,
  onDelete,
  onJump,
  onOpenPopOut,
  courseColumn = false,
  courseTitleByPath = {},
  preferGroupPath = null,
  preferGroupProjectId = null,
  loading = false
}) {
  const [query, setQuery] = useState('')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draft, setDraft] = useState({ text: '', markdown: '', json: null })
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return annotations
    return annotations.filter((item) => {
      const course = (courseTitleByPath[item.coursePath] || item.coursePath || '').toLowerCase()
      const hay = [
        item.title,
        item.body,
        item.lessonTitle,
        item.projectTitle,
        course,
        noteTitle(item)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [annotations, query, courseTitleByPath])

  const groups = useMemo(
    () =>
      groupAnnotationsByTarget(filtered, {
        preferPath: preferGroupPath,
        preferProjectId: preferGroupProjectId,
        includeCourseKey: courseColumn
      }),
    [filtered, preferGroupPath, preferGroupProjectId, courseColumn]
  )

  const selected = useMemo(() => {
    if (!selectedId) return null
    if (typeof selectedId === 'object' && selectedId.coursePath) {
      return (
        annotations.find((a) => a.id === selectedId.id && a.coursePath === selectedId.coursePath) ||
        null
      )
    }
    return annotations.find((a) => a.id === selectedId) || null
  }, [annotations, selectedId])

  const mentionItems = useMemo(() => {
    const map = new Map()
    for (const item of annotations) {
      if (item.lessonRelativePath) {
        const key = `lesson:${item.lessonRelativePath}`
        if (!map.has(key)) {
          map.set(key, {
            type: 'lesson',
            id: item.lessonRelativePath,
            title: item.lessonTitle || item.lessonRelativePath,
            subtitle: 'Lección'
          })
        }
      }
      if (item.projectId) {
        const key = `project:${item.projectId}`
        if (!map.has(key)) {
          map.set(key, {
            type: 'project',
            id: item.projectId,
            title: item.projectTitle || item.projectId,
            subtitle: 'Proyecto'
          })
        }
      }
    }
    return [...map.values()]
  }, [annotations])

  const isRowActive = (item) => {
    if (!selectedId) return false
    if (typeof selectedId === 'object' && selectedId.coursePath) {
      return item.id === selectedId.id && item.coursePath === selectedId.coursePath
    }
    return item.id === selectedId
  }

  useEffect(() => {
    if (!selected) {
      setDraftTitle('')
      setDraft({ text: '', markdown: '', json: null })
      setDirty(false)
      return
    }
    setDraftTitle(selected.title || '')
    setDraft({
      text: selected.body || '',
      markdown: selected.body || '',
      json: selected.bodyJson || null
    })
    setEditorKey((k) => k + 1)
    setDirty(false)
    // Only remount when switching notes — not after every save (updatedAt).
  }, [selected?.id])

  const handleDraftChange = (next) => {
    setDraft({
      text: next.markdown || next.text || '',
      markdown: next.markdown || next.text || '',
      json: null
    })
    setDirty(true)
  }

  const handleTitleChange = (value) => {
    setDraftTitle(value)
    setDirty(true)
  }

  const displayName = (item) => {
    if (selected && isRowActive(item) && dirty) {
      const typed = draftTitle.trim()
      if (typed) return typed.length > 72 ? `${typed.slice(0, 72)}…` : typed
    }
    return noteTitle(item)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await onSave?.(selected, {
        title: draftTitle.trim() || null,
        body: (draft.markdown || draft.text || '').trim(),
        bodyHtml: null,
        bodyJson: null
      })
      setDirty(false)
      toast.success('Guardado')
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    if (!selected) return
    try {
      const {
        buildNoteMarkdownDocument,
        noteExportBasename,
        listMarkdownNoteAssets,
        rewriteMarkdownAssetLinks
      } = await import('../utils/exportHelpers')

      const titleText = draftTitle.trim() || noteTitle(selected)
      const bodyMarkdown = draft.text || selected.body || ''
      const base = noteExportBasename(titleText)
      const assetDirName = `${base}.assets`

      const assetFiles = new Set(listMarkdownNoteAssets(bodyMarkdown).map((a) => a.file))
      const excalidrawRe = /!\[excalidraw:([^\]]*)\]/gi
      let m
      while ((m = excalidrawRe.exec(bodyMarkdown))) {
        const id = (m[1] || '').trim()
        if (id) {
          assetFiles.add(`${id}.png`)
          assetFiles.add(`${id}.excalidraw`)
        }
      }

      const portableBody = rewriteMarkdownAssetLinks(bodyMarkdown, assetDirName)
      const markdown = buildNoteMarkdownDocument({
        title: titleText,
        bodyMarkdown: portableBody,
        meta: {
          curso: courseTitleByPath[selected.coursePath] || selected.coursePath || null,
          archivo: selected.lessonTitle || selected.projectTitle || 'Del curso',
          proyecto: selected.projectTitle || null,
          tiempo:
            typeof selected.timeSec === 'number' ? formatTime(selected.timeSec) : null,
          creado: formatDateTime(selected.createdAt),
          actualizado:
            selected.updatedAt && selected.updatedAt !== selected.createdAt
              ? formatDateTime(selected.updatedAt)
              : null
        }
      })

      const result = await window.api.exportMarkdownBundle({
        defaultPath: `${base}.md`,
        markdown,
        assetFiles: [...assetFiles]
      })
      if (!result?.canceled) {
        toast.success(
          result.assetCount
            ? `Exportado (.md + ${result.assetCount} adjuntos)`
            : 'Anotación exportada (.md)'
        )
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo exportar')
    }
  }

  const showRowDelete = typeof onDelete === 'function'
  const colSpan = (courseColumn ? 4 : 3) + (showRowDelete ? 1 : 0)

  const handleRowDelete = (event, item) => {
    event.stopPropagation()
    onDelete?.(item)
  }

  const groupHeading = (group) => {
    if (courseColumn && group.coursePath) {
      const courseName = courseTitleByPath[group.coursePath] || group.coursePath
      if (group.projectId) return `${courseName} · ${group.title}`
      if (!group.path) return `${courseName} · Del curso`
      return `${courseName} · ${group.title}`
    }
    return group.title
  }

  const jumpLabel = (item) => {
    if (typeof item.timeSec === 'number') {
      return `Ir al video · ${formatTime(item.timeSec)}`
    }
    if (item.projectId) return 'Abrir proyecto'
    if (item.lessonRelativePath) return 'Abrir archivo'
    return 'Abrir en curso'
  }

  const targetPropLabel = (item) => {
    if (item.projectId) return 'Proyecto'
    if (item.lessonRelativePath) return 'Archivo'
    return 'Archivo'
  }

  const targetPropValue = (item) => {
    if (item.projectId) return item.projectTitle || 'Proyecto'
    return item.lessonTitle || 'Del curso'
  }

  return (
    <div className={`annotations-page${listCollapsed ? ' is-list-collapsed' : ''}`}>
      <header className="annotations-page__top">
        <div className="annotations-page__top-left">
          {onBack ? (
            <button type="button" className="icon-btn icon-btn--ghost" onClick={onBack}>
              ← Volver
            </button>
          ) : null}
          <div className="annotations-page__brand">
            <h1>{title}</h1>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className="annotations-page__top-actions">
          <div className="search-field annotations-page__search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar anotaciones"
            />
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            title="Mostrar learning-store.json en el explorador"
            onClick={async () => {
              try {
                await window.api.revealLearningStore()
              } catch (err) {
                toast.error(err.message || 'No se pudo abrir la ubicación')
              }
            }}
          >
            Abrir ubicación
          </button>
          {onOpenPopOut ? (
            <button
              type="button"
              className="btn btn--ghost"
              title="Abrir anotaciones en una ventana aparte"
              onClick={onOpenPopOut}
            >
              Ventana
            </button>
          ) : null}
          {onCreate ? (
            <button type="button" className="btn btn--primary" onClick={onCreate}>
              Nueva
            </button>
          ) : null}
        </div>
      </header>

      <div className="annotations-page__body">
        <aside className="annotations-table-pane" aria-label="Lista de anotaciones">
          <div className="annotations-table-pane__bar">
            <button
              type="button"
              className="annotations-page__icon-btn"
              onClick={() => setListCollapsed((v) => !v)}
              title={listCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
            >
              {listCollapsed ? '»' : '«'}
            </button>
            <span className="annotations-table-pane__label">Tabla</span>
            <span className="annotations-table-pane__count">{filtered.length}</span>
          </div>

          {!listCollapsed ? (
            <div className="annotations-table-wrap">
              <table className="annotations-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    {courseColumn ? <th>Curso</th> : null}
                    <th>Contexto</th>
                    <th>Fecha de creación</th>
                    {showRowDelete ? <th className="annotations-table__actions-col"> </th> : null}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={colSpan}>Cargando…</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan}>
                        {annotations.length === 0 ? 'Aún no hay anotaciones.' : 'Ningún resultado.'}
                      </td>
                    </tr>
                  ) : (
                    groups.map((group) => (
                      <Fragment key={group.key}>
                        <tr className="annotations-table__group">
                          <td colSpan={colSpan}>
                            <span className="annotations-table__group-title">
                              {groupHeading(group)}
                            </span>
                            <span className="annotations-table__group-count">{group.items.length}</span>
                          </td>
                        </tr>
                        {group.items.map((item) => {
                          const active = isRowActive(item)
                          return (
                            <tr
                              key={`${item.coursePath || 'local'}-${item.id}`}
                              className={active ? 'is-active' : ''}
                              onClick={() => onSelect?.(item)}
                            >
                              <td>
                                <span className="annotations-table__name">{displayName(item)}</span>
                              </td>
                              {courseColumn ? (
                                <td className="annotations-table__muted">
                                  {courseTitleByPath[item.coursePath] || item.coursePath}
                                </td>
                              ) : null}
                              <td className="annotations-table__muted">{contextLabel(item)}</td>
                              <td className="annotations-table__muted">
                                {formatDateTime(item.createdAt)}
                              </td>
                              {showRowDelete ? (
                                <td className="annotations-table__actions">
                                  <button
                                    type="button"
                                    className="annotations-table__delete"
                                    title="Borrar anotación"
                                    aria-label={`Borrar ${displayName(item)}`}
                                    onClick={(event) => handleRowDelete(event, item)}
                                  >
                                    Borrar
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </aside>

        <main className="annotations-doc-pane">
          {!selected ? (
            <div className="annotations-doc-pane__empty">
              <h2>Selecciona una anotación</h2>
              <p>Abre una fila de la tabla o crea una nueva para editarla aquí.</p>
            </div>
          ) : (
            <div className="annotations-doc">
              <div className="annotations-doc__toolbar">
                <div className="annotations-doc__toolbar-left">
                  {onJump ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => onJump(selected)}
                    >
                      {jumpLabel(selected)}
                    </button>
                  ) : null}
                </div>
                <div className="annotations-doc__toolbar-right">
                  {dirty ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--ghost" onClick={handleExport}>
                    Exportar
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onDelete?.(selected)}
                  >
                    Borrar
                  </button>
                </div>
              </div>

              <input
                key={`title-${selected.id}`}
                className="annotations-doc__title-input"
                value={draftTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={noteTitleFallback(selected)}
                aria-label="Título de la anotación"
                autoFocus
              />

              <div className="annotations-doc__props">
                <div className="annotations-doc__prop">
                  <span className="annotations-doc__prop-label">Fecha de creación</span>
                  <span>{formatDateTime(selected.createdAt)}</span>
                </div>
                {courseColumn ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">Curso</span>
                    <span>
                      {courseTitleByPath[selected.coursePath] || selected.coursePath || '—'}
                    </span>
                  </div>
                ) : null}
                <div className="annotations-doc__prop">
                  <span className="annotations-doc__prop-label">{targetPropLabel(selected)}</span>
                  <span>{targetPropValue(selected)}</span>
                </div>
                {typeof selected.timeSec === 'number' ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">Tiempo</span>
                    <span>{formatTime(selected.timeSec)}</span>
                  </div>
                ) : null}
                {selected.updatedAt && selected.updatedAt !== selected.createdAt ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">Actualizado</span>
                    <span>{formatDateTime(selected.updatedAt)}</span>
                  </div>
                ) : null}
              </div>

              <div className="annotations-doc__editor">
                <NoteEditor
                  key={`${selected.id}-${editorKey}`}
                  editorKey={`${selected.id}-${editorKey}`}
                  variant="document"
                  bodyText={draft.text}
                  bodyJson={draft.json}
                  placeholder="Escribe tu anotación…"
                  onChange={handleDraftChange}
                  enableTimestamp={typeof selected.timeSec === 'number'}
                  currentTimeSec={
                    typeof selected.timeSec === 'number' ? selected.timeSec : 0
                  }
                  onSeekTimestamp={
                    onJump
                      ? (timeSec) => onJump({ ...selected, timeSec })
                      : null
                  }
                  mentionItems={mentionItems}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export { noteTitle, formatDateTime }
export default AnnotationsWorkspace
