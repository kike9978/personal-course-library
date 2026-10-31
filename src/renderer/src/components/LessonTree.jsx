import { statusLabel } from './ProjectPanel'

const KIND_LABEL = {
  doc: 'doc',
  image: 'img',
  archive: 'zip',
  subtitle: 'cc',
  other: 'file',
  video: '▶',
  audio: '♪'
}

function visibleResources(resources) {
  return (resources || []).filter((res) => res.kind !== 'subtitle')
}

function ResourceRow({ res, selectedPath, onSelectResource }) {
  const isActive = selectedPath === res.relativePath
  return (
    <li>
      <button
        type="button"
        className={`lesson-tree__item lesson-tree__item--resource${isActive ? ' is-active' : ''}`}
        onClick={() => onSelectResource?.(res)}
        title={res.relativePath}
      >
        <span className="lesson-tree__kind" aria-hidden="true">
          {KIND_LABEL[res.kind] || '·'}
        </span>
        <span className="lesson-tree__label">{res.title || res.name}</span>
        <span className="lesson-tree__ext">{res.kind}</span>
      </button>
    </li>
  )
}

function ProjectRow({ project, selectedProjectId, onSelectProject }) {
  const isActive = selectedProjectId === project.id
  return (
    <li>
      <button
        type="button"
        className={`lesson-tree__item lesson-tree__item--project${isActive ? ' is-active' : ''}${
          project.linkMissing ? ' is-broken' : ''
        }`}
        onClick={() => onSelectProject?.(project)}
        title={project.linkedFolderPath || 'Sin carpeta vinculada'}
      >
        <span className="lesson-tree__kind" aria-hidden="true">
          ◇
        </span>
        <span className="lesson-tree__label">{project.title}</span>
        <span className="lesson-tree__ext">
          {project.linkMissing ? '!' : statusLabel(project.status)}
        </span>
      </button>
    </li>
  )
}

function LessonTree({
  sections = [],
  courseResources = [],
  projects = [],
  selectedPath,
  selectedProjectId,
  onSelectLesson,
  onSelectResource,
  onSelectProject,
  onAddProject,
  onToggleLessonComplete,
  progressByLesson = {},
  completedCount = 0,
  playableCount = 0
}) {
  const visibleCourseResources = visibleResources(courseResources)
  const hasLessons = sections.some((s) => s.lessons?.length)
  const hasSectionResources = sections.some((s) => visibleResources(s.resources).length)
  const hasCourseResources = visibleCourseResources.length > 0
  const hasProjects = projects.length > 0
  const hasContent = hasLessons || hasSectionResources || hasCourseResources || hasProjects

  const projectsBySection = new Map()
  const unanchored = []
  for (const project of projects) {
    if (project.sectionId && sections.some((s) => s.id === project.sectionId)) {
      if (!projectsBySection.has(project.sectionId)) projectsBySection.set(project.sectionId, [])
      projectsBySection.get(project.sectionId).push(project)
    } else {
      unanchored.push(project)
    }
  }

  if (!hasContent) {
    return (
      <div className="lesson-tree lesson-tree--empty">
        <p>No hay lecciones ni recursos en esta carpeta.</p>
        <button type="button" className="btn btn--ghost" onClick={() => onAddProject?.()}>
          + Proyecto
        </button>
      </div>
    )
  }

  return (
    <nav className="lesson-tree" aria-label="Contenido del curso">
      <div className="lesson-tree__toolbar">
        {playableCount > 0 ? (
          <span
            className="lesson-tree__progress"
            title={`${completedCount} de ${playableCount} lecciones`}
          >
            {completedCount} de {playableCount}
          </span>
        ) : null}
        <button
          type="button"
          className="lesson-tree__add-project"
          onClick={() => onAddProject?.()}
          title="Añadir proyecto virtual"
        >
          + Proyecto
        </button>
      </div>

      {unanchored.length > 0 ? (
        <div className="lesson-tree__section">
          <h3 className="lesson-tree__section-title">Proyectos</h3>
          <ul className="lesson-tree__list">
            {unanchored.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                selectedProjectId={selectedProjectId}
                onSelectProject={onSelectProject}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {sections.map((section) => {
        const lessons = section.lessons || []
        const resources = visibleResources(section.resources)
        const sectionProjects = projectsBySection.get(section.id) || []
        if (!lessons.length && !resources.length && !sectionProjects.length) return null

        return (
          <div key={section.id} className="lesson-tree__section">
            <h3 className="lesson-tree__section-title" title={section.title}>
              {section.title}
            </h3>
            <ul className="lesson-tree__list">
              {sectionProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={onSelectProject}
                />
              ))}
              {lessons.map((lesson) => {
                const prog = progressByLesson[lesson.relativePath]
                const isActive = selectedPath === lesson.relativePath
                const isDone = Boolean(prog?.completed)
                const sidecars = visibleResources(lesson.resources)
                return (
                  <li key={lesson.id || lesson.relativePath} className="lesson-tree__block">
                    <div className="lesson-tree__row">
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
                        onClick={() => onSelectLesson?.(lesson)}
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
                    </div>
                    {sidecars.length > 0 ? (
                      <ul className="lesson-tree__list lesson-tree__list--nested">
                        {sidecars.map((res) => (
                          <ResourceRow
                            key={res.relativePath}
                            res={res}
                            selectedPath={selectedPath}
                            onSelectResource={onSelectResource}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
              {resources.map((res) => (
                <ResourceRow
                  key={res.relativePath}
                  res={res}
                  selectedPath={selectedPath}
                  onSelectResource={onSelectResource}
                />
              ))}
            </ul>
          </div>
        )
      })}

      {visibleCourseResources.length > 0 ? (
        <div className="lesson-tree__section">
          <h3 className="lesson-tree__section-title">Recursos del curso</h3>
          <ul className="lesson-tree__list lesson-tree__list--resources">
            {visibleCourseResources.map((res) => (
              <ResourceRow
                key={res.relativePath}
                res={res}
                selectedPath={selectedPath}
                onSelectResource={onSelectResource}
              />
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
