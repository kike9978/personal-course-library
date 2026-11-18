import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NoteEditor, { NoteBody } from './NoteEditor'
import { noteDisplayTitles, playbackMarkLabel } from '../../../shared/knowledgeGraph.js'
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

function StrokeIcon({ children }) {
  return (
    <svg
      className="study-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function IconBookmark() {
  return (
    <StrokeIcon>
      <path d="M6 4h12v16l-6-3.5L6 20V4z" />
    </StrokeIcon>
  )
}

function IconCamera() {
  return (
    <StrokeIcon>
      <path d="M4 8h3l2-2h6l2 2h3v10H4V8z" />
      <circle cx="12" cy="13" r="3" />
    </StrokeIcon>
  )
}

function IconClock() {
  return (
    <StrokeIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </StrokeIcon>
  )
}

function IconPencil() {
  return (
    <StrokeIcon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </StrokeIcon>
  )
}

function IconTrash() {
  return (
    <StrokeIcon>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </StrokeIcon>
  )
}

function ScopeSegments({ noteScope, hasLesson, hasTarget, fileSegment, onChange }) {
  return (
    <div className="study-scope study-scope--segments" role="group" aria-label="Dónde guardar">
      {hasLesson ? (
        <button
          type="button"
          className={noteScope === 'moment' ? 'is-active' : ''}
          onClick={() => onChange('moment')}
        >
          Este momento
        </button>
      ) : null}
      {hasTarget ? (
        <button
          type="button"
          className={noteScope === 'file' ? 'is-active' : ''}
          onClick={() => onChange('file')}
        >
          {fileSegment}
        </button>
      ) : null}
      <button
        type="button"
        className={noteScope === 'course' ? 'is-active' : ''}
        onClick={() => onChange('course')}
      >
        El curso
      </button>
    </div>
  )
}

function MomentChip({ timeSec, frozen, onUpdate, onRelease }) {
  return (
    <div className="study-moment">
      <span className="study-moment__time">
        {formatTime(timeSec)}
        {frozen ? ' · fijado' : ''}
      </span>
      <button type="button" className="study-action" onClick={onUpdate}>
        Actualizar al ahora
      </button>
      {frozen ? (
        <button type="button" className="study-action" onClick={onRelease}>
          Soltar
        </button>
      ) : null}
    </div>
  )
}

function MomentIcons({
  hasLesson,
  showMark,
  capturingFrame,
  onQuickPin,
  onCaptureFrame,
  onInsertTimestamp
}) {
  if (!hasLesson) return null
  return (
    <>
      {showMark ? (
        <button
          type="button"
          className="study-icon-btn"
          onClick={onQuickPin}
          title="Marcar momento (B)"
          aria-label="Marcar momento"
        >
          <IconBookmark />
        </button>
      ) : null}
      <button
        type="button"
        className="study-icon-btn"
        onClick={onCaptureFrame}
        disabled={capturingFrame || !onCaptureFrame}
        title="Captura"
        aria-label="Captura"
      >
        <IconCamera />
      </button>
      <button
        type="button"
        className="study-icon-btn"
        onClick={onInsertTimestamp}
        title="Insertar segundo"
        aria-label="Insertar segundo"
      >
        <IconClock />
      </button>
    </>
  )
}

function AnnotationCard({ item, highlighted, onJump, onEdit, onDelete }) {
  const timed = typeof item.timeSec === 'number'
  const hasPath = Boolean(item.lessonRelativePath)
  const hasProject = Boolean(item.projectId)
  const tag = hasPath ? 'Archivo' : hasProject ? 'Proyecto' : 'Curso'
  return (
    <li
      className={`study-panel__card${highlighted ? ' is-highlight' : ''}`}
      data-note-id={item.id}
    >
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
        <div className="study-panel__card-tools">
          <button
            type="button"
            className="study-icon-btn"
            onClick={() => onEdit(item)}
            title="Editar"
            aria-label="Editar"
          >
            <IconPencil />
          </button>
          <button
            type="button"
            className="study-icon-btn study-icon-btn--danger"
            onClick={() => onDelete(item.id)}
            title="Borrar"
            aria-label="Borrar"
          >
            <IconTrash />
          </button>
        </div>
      </div>
      <NoteBody body={item.body} />
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
  momentTimeSec = null,
  momentFrozen = false,
  onUpdateMoment = null,
  onReleaseMoment = null,
  onInsertTimestamp = null,
  focusSignal = 0,
  highlightNoteId = null,
  onComposerFocus = null,
  onComposerBlur = null,
  onSeekTimestamp = null,
  enableTimestamp = false,
  mentionItems = [],
  programs = [],
  onCreateTopic = null,
  onOpenMention = null,
  onSave,
  onDelete,
  onEdit,
  editingId,
  onCancelEdit,
  onQuickPin,
  onCaptureFrame,
  capturingFrame = false,
  editorApiRef = null,
  onJump,
  onExpand,
  onCollapse,
  currentTargetPath = null,
  currentProjectId = null,
  hasLesson = false,
  hasTarget = false,
  targetKind = null,
  annotationCount = 0,
  onOpenAnnotations = null,
  annotationsView = null
}) {
  const [panelWidth, setPanelWidth] = useState(readPanelWidth)
  const [resizing, setResizing] = useState(false)
  const panelWidthRef = useRef(panelWidth)
  const listRef = useRef(null)
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
  const noteLabels = useMemo(() => noteDisplayTitles(annotations), [annotations])

  const draftText = typeof draft === 'string' ? draft : draft?.markdown || draft?.text || ''
  const baseline = editingId
    ? annotations.find((item) => item.id === editingId)?.body || ''
    : ''
  const dirty = draftText.trim() !== String(baseline).trim()
  const canSave = Boolean(draftText.trim()) || Boolean(editingId)
  const isResource = targetKind === 'resource'
  const isProject = targetKind === 'project'
  const panelLabel = isProject
    ? 'Notas de este proyecto'
    : isResource
      ? 'Notas de este archivo'
      : 'Notas de esta lección'
  const fileSegment = isProject ? 'Este proyecto' : 'Este archivo'
  const shownMomentSec = momentTimeSec == null ? currentTimeSec : momentTimeSec
  const showMomentChip = noteScope === 'moment' && hasLesson
  const editingVisible = Boolean(editingId) && targetNotes.some((item) => item.id === editingId)

  const placeholder =
    noteScope === 'moment'
      ? `Qué recordar en ${formatTime(shownMomentSec)}…`
      : noteScope === 'file'
        ? isProject
          ? 'Nota sobre este proyecto…'
          : 'Nota sobre este archivo…'
        : 'Nota general del curso…'

  useEffect(() => {
    if (!expanded || !highlightNoteId || !listRef.current) return
    const card = listRef.current.querySelector(`[data-note-id="${CSS.escape(highlightNoteId)}"]`)
    card?.scrollIntoView({ block: 'nearest' })
  }, [highlightNoteId, expanded, targetNotes.length])

  useEffect(() => {
    if (!expanded || !editingId || !listRef.current) return
    const card = listRef.current.querySelector(`[data-note-id="${CSS.escape(editingId)}"]`)
    card?.scrollIntoView({ block: 'nearest' })
  }, [editingId, expanded, editorKey])

  const editorProps = {
    bodyText: typeof draft === 'string' ? draft : draft?.text,
    bodyJson: typeof draft === 'object' ? draft?.json : null,
    placeholder,
    compactToolbar: true,
    onChange: onDraftChange,
    onFocus: onComposerFocus,
    onBlur: onComposerBlur,
    currentTimeSec,
    enableTimestamp: enableTimestamp || hasLesson,
    onSeekTimestamp,
    mentionItems,
    programs,
    onCreateTopic,
    onOpenMention,
    onCaptureFrame: hasLesson ? onCaptureFrame : null
  }

  const saveRow = (editing) => (
    <div className="study-panel__composer-actions">
      <div className="study-panel__composer-side">
        {editing ? (
          <button type="button" className="btn btn--ghost" onClick={onCancelEdit}>
            Cancelar
          </button>
        ) : null}
        <MomentIcons
          hasLesson={hasLesson}
          showMark={!editing}
          capturingFrame={capturingFrame}
          onQuickPin={onQuickPin}
          onCaptureFrame={onCaptureFrame}
          onInsertTimestamp={onInsertTimestamp}
        />
      </div>
      <div className="study-panel__save">
        {dirty ? <span className="study-panel__unsaved">Sin guardar</span> : null}
        <button type="button" className="btn btn--primary" onClick={onSave} disabled={!canSave}>
          Guardar
        </button>
      </div>
    </div>
  )

  return (
    <div
      className={`study-dock${expanded ? ' is-open' : ''}${resizing ? ' is-resizing' : ''}`}
      style={
        expanded
          ? { '--study-panel-w': `${annotationsView ? Math.max(panelWidth, 560) : panelWidth}px` }
          : undefined
      }
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
      {expanded ? (
        <aside className="study-panel" aria-label="Anotaciones del archivo actual">
          <div className="study-panel__header">
            <h2 className="study-panel__title">
              {panelLabel}
              {hasTarget && targetNotes.length > 0 ? (
                <span className="study-panel__count">{targetNotes.length}</span>
              ) : null}
            </h2>
            {onOpenAnnotations ? (
              <button
                type="button"
                className={`study-panel__annotations-btn${annotationsView ? ' is-active' : ''}`}
                title="Abrir la página de anotaciones"
                onClick={onOpenAnnotations}
              >
                Anotaciones
                {annotationCount ? ` (${annotationCount})` : ''}
              </button>
            ) : null}
          </div>

          {annotationsView ? (
            <div className="study-panel__annotations">{annotationsView}</div>
          ) : (
          <div className="study-panel__body">
            <div className="study-panel__composer">
              {editingVisible ? (
                <p className="study-panel__hint">Termina o cancela la nota abierta</p>
              ) : (
                <>
                  <ScopeSegments
                    noteScope={noteScope}
                    hasLesson={hasLesson}
                    hasTarget={hasTarget}
                    fileSegment={fileSegment}
                    onChange={onNoteScopeChange}
                  />
                  {showMomentChip ? (
                    <MomentChip
                      timeSec={shownMomentSec}
                      frozen={momentFrozen}
                      onUpdate={onUpdateMoment}
                      onRelease={onReleaseMoment}
                    />
                  ) : null}
                  <NoteEditor
                    key={`${editingId || 'new'}-${editorKey}`}
                    editorKey={`${editingId || 'new'}-${editorKey}`}
                    {...editorProps}
                    autofocus={Boolean(editingId)}
                    focusSignal={editingId ? 0 : focusSignal}
                    editorApiRef={editorApiRef}
                  />
                  {saveRow(Boolean(editingId))}
                  {!editingId && hasLesson && targetNotes.length === 0 ? (
                    <p className="study-panel__empty">
                      <kbd>N</kbd> anota este momento · <kbd>B</kbd> deja una marca sin texto
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {hasTarget && targetNotes.length > 0 ? (
              <ul className="study-panel__list" ref={listRef}>
                {targetNotes.map((item) =>
                  editingVisible && item.id === editingId ? (
                    <li
                      key={item.id}
                      className={`study-panel__card is-editing${
                        highlightNoteId === item.id ? ' is-highlight' : ''
                      }`}
                      data-note-id={item.id}
                    >
                      <ScopeSegments
                        noteScope={noteScope}
                        hasLesson={hasLesson}
                        hasTarget={hasTarget}
                        fileSegment={fileSegment}
                        onChange={onNoteScopeChange}
                      />
                      {showMomentChip ? (
                        <MomentChip
                          timeSec={shownMomentSec}
                          frozen={momentFrozen}
                          onUpdate={onUpdateMoment}
                          onRelease={onReleaseMoment}
                        />
                      ) : null}
                      <NoteEditor
                        key={`edit-${item.id}-${editorKey}`}
                        editorKey={`edit-${item.id}-${editorKey}`}
                        {...editorProps}
                        autofocus
                        editorApiRef={editorApiRef}
                      />
                      {saveRow(true)}
                    </li>
                  ) : (
                    <AnnotationCard
                      key={item.id}
                      item={item}
                      highlighted={highlightNoteId === item.id}
                      onJump={onJump}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  )
                )}
              </ul>
            ) : null}
          </div>
          )}
        </aside>
      ) : null}
      <div className="study-rail" aria-label="Marcas de esta lección">
        <button
          type="button"
          className={`study-rail__toggle${expanded ? ' is-active' : ''}`}
          onClick={() => (expanded ? onCollapse?.() : onExpand?.())}
          title={expanded ? 'Ocultar panel de notas' : 'Abrir panel de notas (N)'}
          aria-expanded={expanded}
          aria-label={expanded ? 'Cerrar notas' : 'Abrir notas'}
        >
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
          <span className="study-rail__label">Notas</span>
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
                      title={
                        playbackMarkLabel(item, noteLabels.get(item.id)) || formatTime(item.timeSec)
                      }
                    >
                      {formatTimeShort(item.timeSec)}
                    </button>
                  </li>
                ))
              : null}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export { formatTime }
export default StudySidePanel
