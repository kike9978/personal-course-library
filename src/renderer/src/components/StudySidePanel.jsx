import { useMemo } from 'react'
import NoteEditor, { NoteBody } from './NoteEditor'

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
          <span className="study-panel__tag">Curso</span>
        )}
        {showLesson && item.lessonTitle ? (
          <span className="study-panel__lesson" title={item.lessonTitle}>
            {item.lessonTitle}
          </span>
        ) : null}
      </div>
      <NoteBody body={item.body} bodyHtml={item.bodyHtml} />
      <div className="study-panel__card-actions">
        {timed && item.lessonRelativePath ? (
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

function sortTimed(a, b) {
  const aT = typeof a.timeSec === 'number' ? a.timeSec : Number.POSITIVE_INFINITY
  const bT = typeof b.timeSec === 'number' ? b.timeSec : Number.POSITIVE_INFINITY
  if (aT !== bT) return aT - bT
  return (a.createdAt || 0) - (b.createdAt || 0)
}

/** Group annotations for full-page views. */
export function groupAnnotations(annotations, currentLessonPath = null) {
  const current = []
  const courseWide = []
  const byOtherLesson = new Map()

  for (const item of annotations) {
    const path = item.lessonRelativePath || null
    const isCourseWide = !path && (item.timeSec == null || item.timeSec === undefined)

    if (isCourseWide) {
      courseWide.push(item)
      continue
    }

    if (currentLessonPath && path === currentLessonPath) {
      current.push(item)
      continue
    }

    const key = path || '__unknown__'
    if (!byOtherLesson.has(key)) {
      byOtherLesson.set(key, {
        path: key,
        title: item.lessonTitle || path || 'Otra lección',
        items: []
      })
    }
    byOtherLesson.get(key).items.push(item)
  }

  current.sort(sortTimed)
  courseWide.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const others = [...byOtherLesson.values()].map((g) => ({
    ...g,
    items: [...g.items].sort(sortTimed)
  }))

  return { current, courseWide, others }
}

/**
 * Narrow rail (always) + expandable notes panel for the current lesson.
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
  currentLessonPath,
  currentLessonTitle,
  hasLesson
}) {
  const lessonNotes = useMemo(() => {
    if (!currentLessonPath) return []
    return annotations
      .filter((n) => n.lessonRelativePath === currentLessonPath)
      .sort(sortTimed)
  }, [annotations, currentLessonPath])

  const timedNotes = useMemo(
    () => lessonNotes.filter((n) => typeof n.timeSec === 'number'),
    [lessonNotes]
  )

  const draftText = typeof draft === 'string' ? draft : draft?.text || ''
  const canSave = Boolean(draftText.trim()) || Boolean(editingId)

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
          {expanded ? '‹' : '›'}
        </button>

        <div className="study-rail__count" title={`${timedNotes.length} marcas`}>
          {timedNotes.length}
        </div>

        <ul className="study-rail__marks">
          {timedNotes.map((item) => (
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
          ))}
        </ul>
      </div>

      {expanded ? (
        <aside className="study-panel" aria-label="Anotaciones de esta lección">
          <div className="study-panel__header">
            <h2 className="study-panel__title">
              Esta lección
              <span className="study-panel__count">{lessonNotes.length}</span>
            </h2>
            <div className="study-panel__header-actions">
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
              Solo marcas de este video. <kbd>N</kbd> · <kbd>B</kbd> pin · Todas para el resto del
              curso.
            </p>

            <div className="study-panel__composer">
              {editingId ? (
                <p className="study-panel__hint">Editando anotación</p>
              ) : (
                <div className="study-scope" role="group" aria-label="Dónde guardar">
                  <button
                    type="button"
                    className={noteScope === 'moment' ? 'is-active' : ''}
                    disabled={!hasLesson}
                    onClick={() => onNoteScopeChange('moment')}
                  >
                    En el video · {formatTime(currentTimeSec)}
                  </button>
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
                  “{currentLessonTitle}” @ {formatTime(currentTimeSec)}
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
                placeholder={
                  noteScope === 'moment'
                    ? 'Qué recordar en este momento…'
                    : 'Nota general del curso…'
                }
                onChange={onDraftChange}
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

            {!hasLesson ? (
              <p className="study-panel__empty">Selecciona una lección para ver sus marcas.</p>
            ) : lessonNotes.length === 0 ? (
              <p className="study-panel__empty">Ninguna marca en este video aún.</p>
            ) : (
              <ul className="study-panel__list">
                {lessonNotes.map((item) => (
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
