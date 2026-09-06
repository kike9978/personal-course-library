function LessonTree({
  sections = [],
  courseResources = [],
  selectedPath,
  onSelectLesson,
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
              return (
                <li key={lesson.id || lesson.relativePath}>
                  <button
                    type="button"
                    className={`lesson-tree__item${isActive ? ' is-active' : ''}${
                      prog?.completed ? ' is-done' : ''
                    }`}
                    onClick={() => onSelectLesson(lesson)}
                    title={lesson.relativePath}
                  >
                    <span className="lesson-tree__kind" aria-hidden="true">
                      {lesson.kind === 'audio' ? '♪' : '▶'}
                    </span>
                    <span className="lesson-tree__label">{lesson.title}</span>
                    {prog?.positionSec > 0 && !prog?.completed ? (
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
