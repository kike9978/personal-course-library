import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import NoteEditor from './NoteEditor'
import { formatTime } from './StudySidePanel'

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
  courseColumn = false,
  courseTitleByPath = {},
  loading = false
}) {
  const [query, setQuery] = useState('')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draft, setDraft] = useState({ text: '', html: '', json: null })
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...annotations].sort(
      (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    )
    if (!q) return list
    return list.filter((item) => {
      const course = (courseTitleByPath[item.coursePath] || item.coursePath || '').toLowerCase()
      const hay = [item.title, item.body, item.lessonTitle, course, noteTitle(item)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [annotations, query, courseTitleByPath])

  const selected = useMemo(() => {
    if (!selectedId) return null
    if (typeof selectedId === 'object' && selectedId.coursePath) {
      return (
        annotations.find(
          (a) => a.id === selectedId.id && a.coursePath === selectedId.coursePath
        ) || null
      )
    }
    return annotations.find((a) => a.id === selectedId) || null
  }, [annotations, selectedId])

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
      setDraft({ text: '', html: '', json: null })
      setDirty(false)
      return
    }
    setDraftTitle(selected.title || '')
    setDraft({
      text: selected.body || '',
      html: selected.bodyHtml || '',
      json: selected.bodyJson || null
    })
    setEditorKey((k) => k + 1)
    setDirty(false)
    // Only remount when switching notes — not after every save (updatedAt).
  }, [selected?.id])

  const handleDraftChange = (next) => {
    setDraft(next)
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
        body: (draft.text || '').trim(),
        bodyHtml: draft.html || null,
        bodyJson: draft.json || null
      })
      setDirty(false)
      toast.success('Guardado')
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
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
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={courseColumn ? 4 : 3}>Cargando…</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={courseColumn ? 4 : 3}>
                        {annotations.length === 0
                          ? 'Aún no hay anotaciones.'
                          : 'Ningún resultado.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => {
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
                          <td className="annotations-table__muted">
                            {typeof item.timeSec === 'number'
                              ? formatTime(item.timeSec)
                              : item.lessonTitle || 'Curso'}
                          </td>
                          <td className="annotations-table__muted">
                            {formatDateTime(item.createdAt)}
                          </td>
                        </tr>
                      )
                    })
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
                      {typeof selected.timeSec === 'number'
                        ? `Ir al video · ${formatTime(selected.timeSec)}`
                        : 'Abrir en curso'}
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
                  <span className="annotations-doc__prop-label">Lección</span>
                  <span>{selected.lessonTitle || 'Del curso'}</span>
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
