function LessonTree({
  sections = [],
  courseResources = [],
  selectedPath,
  onSelectLesson,
  onToggleLessonComplete,
  progressByLesson = {}
}) {
  const hasContent = sections.some((s) => s.lessons?.length)

  if (!hasContent) {
    return (
      <div className="lesson-tree lesson-tree--empty">
        <p>No hay lecciones reproducibles en esta carpeta.</p>
      </div>
    )
  }

  return (
    <nav className="lesson-tree" aria-label="Contenido del curso">
      {sections.map((section) => (
        <div key={section.id} className="lesson-tree__section">
          <h3 className="lesson-tree__section-title" title={section.title}>
            {section.title}
          </h3>
          <ul className="lesson-tree__list">
            {(section.lessons || []).map((lesson) => {
              const prog = progressByLesson[lesson.relativePath]
              const isActive = selectedPath === lesson.relativePath
              const isDone = Boolean(prog?.completed)
              return (
                <li key={lesson.id || lesson.relativePath} className="lesson-tree__row">
                  <button
                    type="button"
                    className={`lesson-tree__check${isDone ? ' is-done' : ''}`}
                    title={isDone ? 'Marcar como no completada' : 'Marcar como completada'}
                    aria-pressed={isDone}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleLessonComplete?.(lesson, !isDone)
                    }}
                  >
                    {isDone ? '✓' : ''}
                  </button>
                  <button
                    type="button"
                    className={`lesson-tree__item${isActive ? ' is-active' : ''}${
                      isDone ? ' is-done' : ''
                    }`}
                    onClick={() => onSelectLesson(lesson)}
                    title={lesson.relativePath}
                  >
                    <span className="lesson-tree__kind" aria-hidden="true">
                      {lesson.kind === 'audio' ? '♪' : '▶'}
                    </span>
                    <span className="lesson-tree__label">{lesson.title}</span>
                    {prog?.positionSec > 0 && !isDone ? (
                      <span className="lesson-tree__resume" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {courseResources.length > 0 ? (
        <div className="lesson-tree__section">
          <h3 className="lesson-tree__section-title">Recursos</h3>
          <ul className="lesson-tree__list lesson-tree__list--resources">
            {courseResources.slice(0, 40).map((res) => (
              <li key={res.relativePath} className="lesson-tree__resource" title={res.relativePath}>
                <span className="lesson-tree__kind" aria-hidden="true">
                  ·
                </span>
                <span className="lesson-tree__label">{res.title}</span>
                <span className="lesson-tree__ext">{res.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  )
}

export function flattenLessons(sections) {
  return (sections || []).flatMap((s) => s.lessons || [])
}

export default LessonTree
