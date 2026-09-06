import { useMemo } from 'react'

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
      {item.body ? (
        <p className="study-panel__body-text">{item.body}</p>
      ) : (
        <p className="study-panel__body-text study-panel__body-text--muted">Sin texto</p>
      )}
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

/**
 * Annotations grouped by lesson: current video first, then course-wide, then other lessons.
 */
function StudySidePanel({
  annotations = [],
  draft,
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
  currentLessonPath,
  currentLessonTitle,
  hasLesson
}) {
  const groups = useMemo(() => {
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

    const sortTimed = (a, b) => {
      const aT = typeof a.timeSec === 'number' ? a.timeSec : Number.POSITIVE_INFINITY
      const bT = typeof b.timeSec === 'number' ? b.timeSec : Number.POSITIVE_INFINITY
      if (aT !== bT) return aT - bT
      return (a.createdAt || 0) - (b.createdAt || 0)
    }

    current.sort(sortTimed)
    courseWide.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

    const others = [...byOtherLesson.values()].map((g) => ({
      ...g,
      items: [...g.items].sort(sortTimed)
    }))

    return { current, courseWide, others }
  }, [annotations, currentLessonPath])

  const currentCount = groups.current.length
  const totalCount = annotations.length

  return (
    <aside className="study-panel" aria-label="Anotaciones">
      <div className="study-panel__header">
        <h2 className="study-panel__title">
          Anotaciones
          {hasLesson ? (
            <span className="study-panel__count">
              {currentCount}
              {totalCount !== currentCount ? ` · ${totalCount}` : ''}
            </span>
          ) : (
            <span className="study-panel__count">{totalCount}</span>
          )}
        </h2>
      </div>

      <div className="study-panel__body">
        <p className="study-panel__explain">
          Las marcas del video van con su lección; las del curso quedan aparte.{' '}
          <kbd>N</kbd> editor · <kbd>B</kbd> pin en el tiempo actual.
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

          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={
              noteScope === 'moment'
                ? 'Qué recordar en este momento…'
                : 'Nota general del curso…'
            }
            rows={4}
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
              disabled={!draft.trim() && !editingId}
            >
              Guardar
            </button>
          </div>
        </div>

        {totalCount === 0 ? (
          <p className="study-panel__empty">
            Sin anotaciones. Elige “En el video” o “Del curso”, escribe y guarda.
          </p>
        ) : (
          <div className="study-panel__groups">
            {hasLesson ? (
              <section className="study-panel__group">
                <h3 className="study-panel__group-title">
                  Esta lección
                  <span>{currentCount}</span>
                </h3>
                {currentCount === 0 ? (
                  <p className="study-panel__empty">Ninguna marca en este video aún.</p>
                ) : (
                  <ul className="study-panel__list">
                    {groups.current.map((item) => (
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
              </section>
            ) : null}

            {groups.courseWide.length > 0 ? (
              <section className="study-panel__group">
                <h3 className="study-panel__group-title">
                  Del curso
                  <span>{groups.courseWide.length}</span>
                </h3>
                <ul className="study-panel__list">
                  {groups.courseWide.map((item) => (
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
              </section>
            ) : null}

            {groups.others.map((group) => (
              <section key={group.path} className="study-panel__group study-panel__group--other">
                <h3 className="study-panel__group-title" title={group.path}>
                  {group.title}
                  <span>{group.items.length}</span>
                </h3>
                <ul className="study-panel__list">
                  {group.items.map((item) => (
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
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

export { formatTime }
export default StudySidePanel
