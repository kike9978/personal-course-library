import { useMemo } from 'react'
import NoteEditor, { NoteBody } from './NoteEditor'
import { sortWithinGroup } from '../utils/annotationGroups'

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
  onOpenFullPage,
  onOpenPopOut,
  currentTargetPath = null,
  currentTargetTitle = null,
  currentProjectId = null,
  hasLesson = false,
  hasTarget = false,
  targetKind = null
}) {
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
  const panelLabel = isProject ? 'Este proyecto' : isResource ? 'Este archivo' : 'Esta lección'
  const fileScopeLabel = isProject ? 'En este proyecto' : 'En este archivo'

  const placeholder =
    noteScope === 'moment'
      ? 'Qué recordar en este momento…'
      : noteScope === 'file'
        ? isProject
          ? 'Nota sobre este proyecto…'
          : 'Nota sobre este archivo…'
        : 'Nota general del curso…'

  return (
    <div className={`study-dock${expanded ? ' is-open' : ''}`}>
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

        <div className="study-rail__count" title={`${timedNotes.length} marcas`}>
          {hasLesson ? timedNotes.length : '·'}
        </div>

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
      </div>

      {expanded ? (
        <aside className="study-panel" aria-label="Anotaciones del archivo actual">
          <div className="study-panel__header">
            <h2 className="study-panel__title">
              {panelLabel}
              <span className="study-panel__count">{hasTarget ? targetNotes.length : 0}</span>
            </h2>
            <div className="study-panel__header-actions">
              {onOpenPopOut ? (
                <button
                  type="button"
                  className="study-panel__icon-btn"
                  onClick={onOpenPopOut}
                  title="Abrir anotaciones en una ventana aparte"
                  aria-label="Abrir anotaciones en ventana aparte"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 3h3v3" />
                    <path d="M11 13L21 3" />
                    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                className="study-panel__icon-btn"
                onClick={onOpenFullPage}
                title="Ver todas las anotaciones del curso"
              >
                Todas
              </button>
            </div>
          </div>

          <div className="study-panel__body">
            <p className="study-panel__explain">
              {isProject ? (
                <>
                  Notas de este proyecto. <kbd>N</kbd> · Todas para el resto del curso.
                </>
              ) : isResource ? (
                <>
                  Notas de este archivo (sin tiempo). <kbd>N</kbd> · Todas para el resto del curso.
                </>
              ) : (
                <>
                  Marcas de este video o notas del archivo. <kbd>N</kbd> · <kbd>B</kbd> pin · Todas
                  para el resto del curso.
                </>
              )}
            </p>

            <div className="study-panel__composer">
              {editingId ? (
                <p className="study-panel__hint">Editando anotación</p>
              ) : (
                <div className="study-scope" role="group" aria-label="Dónde guardar">
                  {hasLesson ? (
                    <button
                      type="button"
                      className={noteScope === 'moment' ? 'is-active' : ''}
                      onClick={() => onNoteScopeChange('moment')}
                    >
                      En el video · {formatTime(currentTimeSec)}
                    </button>
                  ) : null}
                  {hasTarget ? (
                    <button
                      type="button"
                      className={noteScope === 'file' ? 'is-active' : ''}
                      onClick={() => onNoteScopeChange('file')}
                    >
                      {fileScopeLabel}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={noteScope === 'course' ? 'is-active' : ''}
                    onClick={() => onNoteScopeChange('course')}
                  >
                    Del curso
                  </button>
                </div>
              )}

              {!editingId && noteScope === 'moment' && hasLesson ? (
                <p className="study-panel__hint">
                  “{currentTargetTitle}” @ {formatTime(currentTimeSec)}
                </p>
              ) : null}

              {!editingId && noteScope === 'file' && hasTarget ? (
                <p className="study-panel__hint">
                  {isProject
                    ? `Se guarda en el proyecto “${currentTargetTitle}”.`
                    : `Se guarda en “${currentTargetTitle}” sin marca de tiempo.`}
                </p>
              ) : null}

              {!editingId && noteScope === 'course' ? (
                <p className="study-panel__hint">
                  Se guarda en el curso (aparece en la página Todas).
                </p>
              ) : null}

              <NoteEditor
                key={editorKey}
                editorKey={editorKey}
                bodyText={typeof draft === 'string' ? draft : draft?.text}
                bodyJson={typeof draft === 'object' ? draft?.json : null}
                autofocus={Boolean(editingId)}
                placeholder={placeholder}
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
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={onQuickPin}
                    disabled={!hasLesson}
                    title="Pin sin texto en el tiempo actual (B)"
                  >
                    Solo pin
                  </button>
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

            {!hasTarget ? (
              <p className="study-panel__empty">
                Selecciona un video, archivo o proyecto para ver sus notas.
              </p>
            ) : targetNotes.length === 0 ? (
              <p className="study-panel__empty">
                {isProject
                  ? 'Ninguna anotación en este proyecto aún.'
                  : isResource
                    ? 'Ninguna anotación en este archivo aún.'
                    : 'Ninguna marca en este video aún.'}
              </p>
            ) : (
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
            )}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

export { formatTime, AnnotationCard }
export default StudySidePanel
