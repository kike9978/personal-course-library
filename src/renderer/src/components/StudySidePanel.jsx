import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NoteEditor, { NoteBody } from './NoteEditor'
import { noteDisplayTitles, playbackMarkLabel } from '../../../shared/knowledgeGraph.js'
import { sortWithinGroup } from '../utils/annotationGroups'
import { cn } from '../ui/cn'
import { btnGhost, btnPrimary, segmented, segmentedItem } from '../ui/classes'

const studyIcon = 'block size-4'
const studyAction =
  'shrink-0 cursor-pointer rounded-sm border border-ink/10 bg-surface px-[0.55rem] py-[0.28rem] text-xs leading-[1.2] font-semibold whitespace-nowrap text-ink hover:border-coral hover:text-coral-deep disabled:cursor-default disabled:opacity-55 disabled:hover:border-ink/10 disabled:hover:text-ink'
const studyIconBtn =
  'inline-flex size-[1.85rem] cursor-pointer items-center justify-center rounded-sm border border-ink/10 bg-surface p-0 text-ink hover:border-coral hover:text-coral-deep disabled:cursor-default disabled:opacity-55'
const scopeBtn = cn(segmentedItem, 'min-w-0 flex-1 truncate px-2 text-xs')
const scopeOn = 'bg-surface text-ink shadow-card'
const dock =
  'group relative flex min-h-0 items-stretch gap-0 border-l border-ink/10 bg-transparent max-[900px]:max-h-[42%] max-[900px]:w-auto max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:border-ink/10 min-[901px]:[&.is-open]:w-[min(calc(var(--study-panel-w,340px)+3.4rem),90vw)] min-[901px]:[&.is-open]:flex-none max-[900px]:[&.is-open]:w-auto max-[900px]:[&.is-open]:flex-col [&.is-resizing]:select-none'
const resizer =
  'absolute top-0 -left-1 z-[3] h-full w-2 cursor-col-resize touch-none hover:bg-[rgba(232,69,112,0.45)] focus-visible:bg-[rgba(232,69,112,0.45)] focus-visible:outline-none max-[900px]:hidden'
const rail =
  'flex w-11 shrink-0 flex-col items-center gap-[0.4rem] self-stretch bg-transparent pt-[0.55rem] text-ink-soft group-[.is-open]:border-l group-[.is-open]:border-ink/10 max-[900px]:h-auto max-[900px]:w-auto max-[900px]:flex-none max-[900px]:flex-row max-[900px]:border-r-0 max-[900px]:border-b-0 max-[900px]:px-2 max-[900px]:py-[0.35rem]'
const railToggle =
  'inline-flex w-[2.4rem] min-h-[2.4rem] cursor-pointer flex-col items-center justify-center gap-[0.15rem] rounded-md border-0 bg-transparent px-[0.1rem] py-[0.3rem] text-2xs leading-[1.1] font-semibold text-ink-soft hover:bg-surface hover:text-coral-deep hover:shadow-card'
const railMark =
  'w-full cursor-pointer rounded-sm border border-[rgba(232,69,112,0.35)] bg-[rgba(232,69,112,0.12)] px-[0.1rem] py-[0.28rem] text-2xs leading-[1.1] font-semibold text-coral-deep tabular-nums hover:bg-[rgba(232,69,112,0.22)] max-[900px]:w-auto max-[900px]:px-[0.4rem] max-[900px]:whitespace-nowrap'
const panel =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-transparent shadow-none'
const embeddedAnnotations =
  'flex min-h-0 min-w-0 flex-1 overflow-hidden [&_header]:px-[0.7rem] [&_header]:py-[0.55rem] [&_header_h1]:text-md [&_header+div]:!flex [&_header+div]:!flex-col [&_header+div]:!overflow-auto [&_[data-annotations-list]]:max-h-[38%] [&_[data-annotations-list]]:min-h-[7.5rem] [&_[data-annotations-list]]:flex-none [&_[data-annotations-list]]:overflow-auto [&_[data-annotations-doc]]:min-h-56 [&_[data-annotations-doc]]:flex-[1_0_14rem] [&_header+div>aside:last-child]:min-h-48 [&_header+div>aside:last-child]:flex-[0_0_12rem] [&_[role=separator]]:hidden'

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
  const room = el?.closest('[data-course-room]')
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
      className={studyIcon}
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
    <div
      className={cn(segmented, 'flex h-8 w-full')}
      role="group"
      aria-label="Dónde guardar"
    >
      {hasLesson ? (
        <button
          type="button"
          className={cn(scopeBtn, noteScope === 'moment' && scopeOn)}
          aria-pressed={noteScope === 'moment'}
          onClick={() => onChange('moment')}
        >
          Este momento
        </button>
      ) : null}
      {hasTarget ? (
        <button
          type="button"
          className={cn(scopeBtn, noteScope === 'file' && scopeOn)}
          aria-pressed={noteScope === 'file'}
          onClick={() => onChange('file')}
        >
          {fileSegment}
        </button>
      ) : null}
      <button
        type="button"
        className={cn(scopeBtn, noteScope === 'course' && scopeOn)}
          aria-pressed={noteScope === 'course'}
        onClick={() => onChange('course')}
      >
        El curso
      </button>
    </div>
  )
}

function MomentChip({ timeSec, frozen, onUpdate, onRelease }) {
  return (
    <div className="flex flex-wrap items-center gap-[0.35rem]">
      <span className="text-xs font-semibold text-coral-deep tabular-nums">
        {formatTime(timeSec)}
        {frozen ? ' · fijado' : ''}
      </span>
      <button type="button" className={studyAction} onClick={onUpdate}>
        Actualizar al ahora
      </button>
      {frozen ? (
        <button type="button" className={studyAction} onClick={onRelease}>
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
          className={studyIconBtn}
          onClick={onQuickPin}
          title="Marcar momento (B)"
          aria-label="Marcar momento"
        >
          <IconBookmark />
        </button>
      ) : null}
      <button
        type="button"
        className={studyIconBtn}
        onClick={onCaptureFrame}
        disabled={capturingFrame || !onCaptureFrame}
        title="Captura"
        aria-label="Captura"
      >
        <IconCamera />
      </button>
      <button
        type="button"
        className={studyIconBtn}
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
      className={cn(
        'group overflow-hidden rounded-md border border-ink/10 bg-surface px-[0.75rem] py-[0.7rem]',
        highlighted && 'border-coral shadow-ring-soft'
      )}
      data-note-id={item.id}
    >
      <div className="mb-[0.35rem] flex flex-wrap items-center gap-[0.45rem]">
        {timed ? (
          <button
            type="button"
            className="cursor-pointer rounded-full border-0 bg-[rgba(232,69,112,0.12)] px-2 py-[0.15rem] text-xs font-semibold text-coral-deep"
            onClick={() => onJump(item)}
            title="Ir a este momento"
          >
            {formatTime(item.timeSec)}
          </button>
        ) : (
          <span className="text-2xs font-semibold tracking-[0.03em] text-teal uppercase">{tag}</span>
        )}
        <div className="ml-auto flex gap-[0.2rem] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            className={studyIconBtn}
            onClick={() => onEdit(item)}
            title="Editar"
            aria-label="Editar"
          >
            <IconPencil />
          </button>
          <button
            type="button"
            className={studyIconBtn}
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
    <div className="flex items-center justify-between gap-[0.4rem]">
      <div className="flex min-w-0 flex-wrap items-center gap-[0.35rem]">
        {editing ? (
          <button type="button" className={btnGhost} onClick={onCancelEdit}>
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
      <div className="flex items-center gap-[0.45rem]">
        {dirty ? <span className="text-xs font-semibold text-ink-soft">Sin guardar</span> : null}
        <button type="button" className={btnPrimary} onClick={onSave} disabled={!canSave}>
          Guardar
        </button>
      </div>
    </div>
  )

  return (
    <div
      className={cn(dock, expanded && 'is-open', resizing && 'is-resizing')}
      style={
        expanded
          ? { '--study-panel-w': `${annotationsView ? Math.max(panelWidth, 560) : panelWidth}px` }
          : undefined
      }
    >
      {expanded ? (
        <div
          className={resizer}
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
        <aside className={panel} aria-label="Anotaciones del archivo actual">
          <div className="flex items-center justify-between gap-2 px-[0.85rem] pt-[0.8rem] pb-[0.35rem]">
            <h2 className="m-0 flex items-baseline gap-[0.45rem] font-display text-md font-semibold">
              {panelLabel}
              {hasTarget && targetNotes.length > 0 ? (
                <span className="font-body text-xs font-semibold text-ink-soft">
                  {targetNotes.length}
                </span>
              ) : null}
            </h2>
            {onOpenAnnotations ? (
              <button
                type="button"
                className={cn(
                  'shrink-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-coral-deep hover:underline',
                  annotationsView && 'underline'
                )}
                title="Abrir la página de anotaciones"
                onClick={onOpenAnnotations}
              >
                Anotaciones
                {annotationCount ? ` (${annotationCount})` : ''}
              </button>
            ) : null}
          </div>

          {annotationsView ? (
            <div className={embeddedAnnotations}>{annotationsView}</div>
          ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pt-[0.35rem] pb-3">
            <div className="flex flex-col gap-[0.4rem] px-0 pt-[0.15rem] pb-[0.35rem]">
              {editingVisible ? (
                <p className="m-0 text-xs text-ink-soft">Termina o cancela la nota abierta</p>
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
                    <p className="px-2 py-2 text-sm text-ink-soft [&_kbd]:rounded-[4px] [&_kbd]:border [&_kbd]:border-ink/10 [&_kbd]:bg-cream [&_kbd]:px-[0.3rem] [&_kbd]:py-[0.05rem] [&_kbd]:font-body [&_kbd]:text-[0.7em]">
                      <kbd>N</kbd> anota este momento · <kbd>B</kbd> deja una marca sin texto
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {hasTarget && targetNotes.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-[0.55rem] p-0" ref={listRef}>
                {targetNotes.map((item) =>
                  editingVisible && item.id === editingId ? (
                    <li
                      key={item.id}
                      className={cn(
                        'flex flex-col gap-[0.45rem] overflow-hidden rounded-md border border-ink/10 bg-surface px-[0.75rem] py-[0.7rem]',
                        highlightNoteId === item.id &&
                          'border-coral shadow-ring-soft'
                      )}
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
      <div className={rail} aria-label="Marcas de esta lección">
        <button
          type="button"
          className={cn(
            railToggle,
            expanded && 'bg-surface text-coral-deep shadow-card'
          )}
          onClick={() => (expanded ? onCollapse?.() : onExpand?.())}
          title={expanded ? 'Ocultar panel de notas' : 'Abrir panel de notas (N)'}
          aria-expanded={expanded}
          aria-label={expanded ? 'Cerrar notas' : 'Abrir notas'}
        >
          <svg
            className="block size-[1.05rem]"
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
          <span className="text-2xs font-semibold">Notas</span>
        </button>

        {!expanded && hasLesson && timedNotes.length > 0 ? (
          <div className="text-2xs font-semibold text-ink-soft tabular-nums" title={`${timedNotes.length} marcas`}>
            {timedNotes.length}
          </div>
        ) : null}

        {!expanded ? (
          <ul className="mt-1 flex min-h-0 w-full flex-1 list-none flex-col items-center gap-[0.3rem] overflow-auto p-0 max-[900px]:flex-row max-[900px]:overflow-x-auto max-[900px]:overflow-y-hidden">
            {hasLesson
              ? timedNotes.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={railMark}
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
