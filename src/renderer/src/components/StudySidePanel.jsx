import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NoteEditor, { NoteBody } from './NoteEditor'
import { sortWithinGroup } from '../utils/annotationGroups'

const PANEL_MIN = 260
const PANEL_MAX = 720
const PANEL_DEFAULT = 340
const PANEL_WIDTH_KEY = 'study-panel-width'

function clampPanelWidth(width, maxAvailable = PANEL_MAX) {
  const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, maxAvailable))
  return Math.min(max, Math.max(PANEL_MIN, Math.round(width)))
}

function readPanelWidth() {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    if (Number.isFinite(stored)) return clampPanelWidth(stored)
  } catch {
    // Width is only a layout preference.
  }
  return PANEL_DEFAULT
}

function roomMaxWidth(el) {
  const room = el?.closest('.course-room__body')
  return (room?.clientWidth || PANEL_MAX) - 420
}

function formatTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '0:00'
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  }
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Compact mm:ss for the narrow rail. */
function formatTimeShort(sec) {
  if (sec == null || !Number.isFinite(sec)) return '0:00'
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function AnnotationCard({ item, showLesson, onJump, onEdit, onDelete }) {
  const timed = typeof item.timeSec === 'number'
  const hasPath = Boolean(item.lessonRelativePath)
  const hasProject = Boolean(item.projectId)
  const tag = hasPath ? 'Archivo' : hasProject ? 'Proyecto' : 'Curso'
  return (
    <li className="study-panel__card">
      <div className="study-panel__card-meta">
        {timed ? (
          <button
            type="button"
            className="study-panel__time"
            onClick={() => onJump(item)}
            title="Ir a este momento"
          >
            {formatTime(item.timeSec)}
          </button>
        ) : (
          <span className="study-panel__tag">{tag}</span>
        )}
        {showLesson && (item.lessonTitle || item.projectTitle) ? (
          <span className="study-panel__lesson" title={item.lessonTitle || item.projectTitle}>
            {item.lessonTitle || item.projectTitle}
          </span>
        ) : null}
      </div>
      <NoteBody body={item.body} />
      <div className="study-panel__card-actions">
        {hasPath || hasProject ? (
          <button type="button" className="study-action" onClick={() => onJump(item)}>
            Ir
          </button>
        ) : null}
        <button type="button" className="study-action" onClick={() => onEdit(item)}>
          Editar
        </button>
        <button type="button" className="study-action" onClick={() => onDelete(item.id)}>
          Borrar
        </button>
      </div>
    </li>
  )
}

/**
 * Narrow rail (always) + expandable notes panel for the current lesson/file.
 */
function StudySidePanel({
  expanded = false,
  annotations = [],
  draft,
  editorKey = 'new',
  onDraftChange,
  noteScope,
  onNoteScopeChange,
  currentTimeSec = 0,
  onSeekTimestamp = null,
  enableTimestamp = false,
  mentionItems = [],
  onCreateTopic = null,
  onSave,
  onDelete,
  onEdit,
  editingId,
  onCancelEdit,
  onQuickPin,
  onJump,
  onExpand,
  onCollapse,
  currentTargetPath = null,
  currentProjectId = null,
  hasLesson = false,
  hasTarget = false,
  targetKind = null
}) {
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)
  const [resizing, setResizing] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const panelWidthRef = useRef(panelWidth)
  panelWidthRef.current = panelWidth

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth))
    } catch {
      // Ignore storage failures; the width still applies for this session.
    }
  }, [panelWidth])

  const onResizeStart = useCallback((event) => {
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = panelWidthRef.current
    const max = roomMaxWidth(handle)
    setResizing(true)

    const onMove = (moveEvent) => {
      setPanelWidth(clampPanelWidth(startWidth + startX - moveEvent.clientX, max))
    }
    const onUp = () => {
      setResizing(false)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }, [])

  const onResizeKey = useCallback((event) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const max = roomMaxWidth(event.currentTarget)
    const delta = event.key === 'ArrowLeft' ? step : -step
    setPanelWidth((width) => clampPanelWidth(width + delta, max))
  }, [])

  const targetNotes = useMemo(() => {
    if (currentProjectId) {
      return annotations
        .filter((n) => n.projectId === currentProjectId)
        .sort(sortWithinGroup)
    }
    if (!currentTargetPath) return []
    return annotations
      .filter((n) => n.lessonRelativePath === currentTargetPath && !n.projectId)
      .sort(sortWithinGroup)
  }, [annotations, currentTargetPath, currentProjectId])

  const timedNotes = useMemo(
    () => targetNotes.filter((n) => typeof n.timeSec === 'number'),
    [targetNotes]
  )

  const draftText = typeof draft === 'string' ? draft : draft?.text || ''
  const canSave = Boolean(draftText.trim()) || Boolean(editingId)
  const isResource = targetKind === 'resource'
  const isProject = targetKind === 'project'
  const panelLabel = isProject
    ? 'Notas de este proyecto'
    : isResource
      ? 'Notas de este archivo'
      : 'Notas de esta lección'
  const fileScopeLabel = isProject ? 'En este proyecto' : 'En este archivo'
  const scopeSummary =
    noteScope === 'moment'
      ? `En ${formatTime(currentTimeSec)}`
      : noteScope === 'file'
        ? fileScopeLabel
        : 'Del curso'

  const placeholder =
    noteScope === 'moment'
      ? `Qué recordar en ${formatTime(currentTimeSec)}…`
      : noteScope === 'file'
        ? isProject
          ? 'Nota sobre este proyecto…'
          : 'Nota sobre este archivo…'
        : 'Nota general del curso…'

  return (
    <div
      className={`study-dock${expanded ? ' is-open' : ''}${resizing ? ' is-resizing' : ''}`}
      style={expanded ? { '--study-panel-w': `${panelWidth}px` } : undefined}
    >
      {expanded ? (
        <div
          className="study-dock__resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ancho del panel de notas"
          aria-valuemin={PANEL_MIN}
          aria-valuemax={PANEL_MAX}
          aria-valuenow={panelWidth}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onKeyDown={onResizeKey}
        />
      ) : null}
      <div className="study-rail" aria-label="Marcas de esta lección">
        <button
          type="button"
          className="study-rail__toggle"
          onClick={() => (expanded ? onCollapse?.() : onExpand?.())}
          title={expanded ? 'Ocultar panel de notas' : 'Abrir panel de notas (N)'}
          aria-expanded={expanded}
          aria-label={expanded ? 'Cerrar notas' : 'Abrir notas'}
        >
          {expanded ? (
            <svg
              className="study-rail__toggle-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          ) : (
            <svg
              className="study-rail__toggle-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          )}
        </button>

        {!expanded && hasLesson && timedNotes.length > 0 ? (
          <div className="study-rail__count" title={`${timedNotes.length} marcas`}>
            {timedNotes.length}
          </div>
        ) : null}

        {!expanded ? (
          <ul className="study-rail__marks">
            {hasLesson
              ? timedNotes.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="study-rail__mark"
                      onClick={() => onJump?.(item)}
                      title={item.body || formatTime(item.timeSec)}
                    >
                      {formatTimeShort(item.timeSec)}
                    </button>
                  </li>
                ))
              : null}
          </ul>
        ) : null}
      </div>

      {expanded ? (
        <aside className="study-panel" aria-label="Anotaciones del archivo actual">
          <div className="study-panel__header">
            <h2 className="study-panel__title">
              {panelLabel}
              {hasTarget && targetNotes.length > 0 ? (
                <span className="study-panel__count">{targetNotes.length}</span>
              ) : null}
            </h2>
          </div>

          <div className="study-panel__body">
            <div className="study-panel__composer">
              {editingId ? (
                <p className="study-panel__hint">Editando anotación</p>
              ) : (
                <div className="study-scope-wrap">
                  <button
                    type="button"
                    className="study-scope-toggle"
                    aria-expanded={scopeOpen}
                    aria-controls="study-scope-options"
                    onClick={() => setScopeOpen((open) => !open)}
                  >
                    {scopeSummary}
                    <span aria-hidden="true"> ▾</span>
                  </button>
                  {scopeOpen ? (
                    <div className="study-scope" id="study-scope-options" role="group" aria-label="Dónde guardar">
                      {hasLesson ? (
                        <button
                          type="button"
                          className={noteScope === 'moment' ? 'is-active' : ''}
                          onClick={() => {
                            onNoteScopeChange('moment')
                            setScopeOpen(false)
                          }}
                        >
                          En el video · {formatTime(currentTimeSec)}
                        </button>
                      ) : null}
                      {hasTarget ? (
                        <button
                          type="button"
                          className={noteScope === 'file' ? 'is-active' : ''}
                          onClick={() => {
                            onNoteScopeChange('file')
                            setScopeOpen(false)
                          }}
                        >
                          {fileScopeLabel}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={noteScope === 'course' ? 'is-active' : ''}
                        onClick={() => {
                          onNoteScopeChange('course')
                          setScopeOpen(false)
                        }}
                      >
                        Del curso
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <NoteEditor
                key={editorKey}
                editorKey={editorKey}
                bodyText={typeof draft === 'string' ? draft : draft?.text}
                bodyJson={typeof draft === 'object' ? draft?.json : null}
                autofocus={Boolean(editingId)}
                placeholder={placeholder}
                compactToolbar
                onChange={onDraftChange}
                currentTimeSec={currentTimeSec}
                enableTimestamp={enableTimestamp || hasLesson}
                onSeekTimestamp={onSeekTimestamp}
                mentionItems={mentionItems}
                onCreateTopic={onCreateTopic}
              />
              <div className="study-panel__composer-actions">
                {editingId ? (
                  <button type="button" className="btn btn--ghost" onClick={onCancelEdit}>
                    Cancelar
                  </button>
                ) : hasLesson ? (
                  <button
                    type="button"
                    className="study-action"
                    onClick={onQuickPin}
                    title="Marca sin texto en el tiempo actual (B)"
                  >
                    Marcar momento
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={onSave}
                  disabled={!canSave}
                >
                  Guardar
                </button>
              </div>
            </div>

            {hasTarget && targetNotes.length > 0 ? (
              <ul className="study-panel__list">
                {targetNotes.map((item) => (
                  <AnnotationCard
                    key={item.id}
                    item={item}
                    showLesson={false}
                    onJump={onJump}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

export { formatTime, AnnotationCard }
export default StudySidePanel
