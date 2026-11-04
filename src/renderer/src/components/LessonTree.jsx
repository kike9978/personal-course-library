import { useEffect, useRef, useState } from 'react'
import {
  ancestorIds,
  collectFilePaths,
  flattenLessons,
  nestedSectionIds,
  orderedContent,
  sectionExists,
  sectionIdForPath
} from '../../../shared/courseTree.js'
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

function panelIdFor(id) {
  return `lesson-section-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function sectionIdForSelection({
  sections,
  projects,
  courseResources,
  selectedPath,
  selectedProjectId
}) {
  const project = selectedProjectId ? projects.find((item) => item.id === selectedProjectId) : null
  if (project) {
    const fromFile = sectionIdForPath(sections, courseResources, project.fileRelativePath)
    if (fromFile) return fromFile
    if (project.sectionId && sectionExists(sections, project.sectionId)) {
      return project.sectionId
    }
    return '__projects__'
  }
  return sectionIdForPath(sections, courseResources, selectedPath)
}

function SectionBlock({ id, title, open, onToggle, nested, children }) {
  const panelId = panelIdFor(id)
  return (
    <div
      className={`lesson-tree__section${nested ? ' lesson-tree__section--nested' : ''}${
        open ? '' : ' is-collapsed'
      }`}
    >
      <h3 className="lesson-tree__section-head">
        <button
          type="button"
          className="lesson-tree__section-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? `Contraer ${title}` : `Expandir ${title}`}
          title={title}
          onClick={onToggle}
        >
          <svg
            className="lesson-tree__section-chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="lesson-tree__section-title">{title}</span>
        </button>
      </h3>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

function ResourceRow({
  res,
  selectedPath,
  onSelectResource,
  linkedProjects,
  selectedProjectId,
  onSelectProject
}) {
  const isActive = selectedPath === res.relativePath
  const projects = linkedProjects || []
  return (
    <li className={projects.length ? 'lesson-tree__block' : undefined}>
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
      <LinkedProjects
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={onSelectProject}
      />
    </li>
  )
}

function LinkedProjects({ projects, selectedProjectId, onSelectProject }) {
  if (!projects?.length) return null
  return (
    <ul className="lesson-tree__list lesson-tree__list--nested">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
        />
      ))}
    </ul>
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
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(nestedSectionIds(sections)))
  const sectionKey = nestedSectionIds(sections)
    .concat(sections.map((section) => section.id))
    .join('\0')
  const selectionSource = useRef({ sections, projects, courseResources })
  selectionSource.current = { sections, projects, courseResources }
  const seenSectionKey = useRef(sectionKey)

  useEffect(() => {
    if (seenSectionKey.current === sectionKey) return
    seenSectionKey.current = sectionKey
    const source = selectionSource.current
    const next = new Set(nestedSectionIds(source.sections))
    const activeId = sectionIdForSelection({
      ...source,
      selectedPath,
      selectedProjectId
    })
    const openIds =
      !activeId || activeId === '__projects__' || activeId === '__course_resources__'
        ? activeId
          ? [activeId]
          : []
        : ancestorIds(source.sections, activeId)
    for (const id of openIds) next.delete(id)
    setCollapsedIds(next)
  }, [sectionKey, selectedPath, selectedProjectId])

  useEffect(() => {
    const source = selectionSource.current
    const activeId = sectionIdForSelection({
      ...source,
      selectedPath,
      selectedProjectId
    })
    if (!activeId) return
    const openIds =
      activeId === '__projects__' || activeId === '__course_resources__'
        ? [activeId]
        : ancestorIds(source.sections, activeId)
    if (!openIds.length) return
    setCollapsedIds((prev) => {
      if (openIds.every((id) => !prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of openIds) next.delete(id)
      return next
    })
  }, [selectedPath, selectedProjectId, sectionKey])

  const toggleSection = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasLessons = flattenLessons(sections).length > 0
  const hasCourseResources = visibleCourseResources.length > 0
  const hasProjects = projects.length > 0
  const hasContent = hasLessons || hasCourseResources || hasProjects

  const filePaths = collectFilePaths(sections, courseResources)

  const projectsByFile = new Map()
  const projectsBySection = new Map()
  const unanchored = []
  for (const project of projects) {
    if (project.fileRelativePath && filePaths.has(project.fileRelativePath)) {
      if (!projectsByFile.has(project.fileRelativePath)) {
        projectsByFile.set(project.fileRelativePath, [])
      }
      projectsByFile.get(project.fileRelativePath).push(project)
    } else if (project.sectionId && sectionExists(sections, project.sectionId)) {
      if (!projectsBySection.has(project.sectionId)) projectsBySection.set(project.sectionId, [])
      projectsBySection.get(project.sectionId).push(project)
    } else {
      unanchored.push(project)
    }
  }

  const projectsFor = (relativePath) => (relativePath ? projectsByFile.get(relativePath) || [] : [])

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
        <SectionBlock
          id="__projects__"
          title="Proyectos"
          open={!collapsedIds.has('__projects__')}
          onToggle={() => toggleSection('__projects__')}
        >
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
        </SectionBlock>
      ) : null}

      {sections.map((section) => (
        <SectionView
          key={section.id}
          section={section}
          depth={0}
          collapsedIds={collapsedIds}
          onToggle={toggleSection}
          projectsBySection={projectsBySection}
          projectsFor={projectsFor}
          selectedPath={selectedPath}
          selectedProjectId={selectedProjectId}
          onSelectLesson={onSelectLesson}
          onSelectResource={onSelectResource}
          onSelectProject={onSelectProject}
          onToggleLessonComplete={onToggleLessonComplete}
          progressByLesson={progressByLesson}
        />
      ))}

      {visibleCourseResources.length > 0 ? (
        <SectionBlock
          id="__course_resources__"
          title="Recursos del curso"
          open={!collapsedIds.has('__course_resources__')}
          onToggle={() => toggleSection('__course_resources__')}
        >
          <ul className="lesson-tree__list lesson-tree__list--resources">
            {visibleCourseResources.map((res) => (
              <ResourceRow
                key={res.relativePath}
                res={res}
                selectedPath={selectedPath}
                onSelectResource={onSelectResource}
                linkedProjects={projectsFor(res.relativePath)}
                selectedProjectId={selectedProjectId}
                onSelectProject={onSelectProject}
              />
            ))}
          </ul>
        </SectionBlock>
      ) : null}
    </nav>
  )
}

function LessonRow({
  lesson,
  progressByLesson,
  selectedPath,
  selectedProjectId,
  onSelectLesson,
  onSelectResource,
  onSelectProject,
  onToggleLessonComplete,
  projectsFor
}) {
  const prog = progressByLesson[lesson.relativePath]
  const isActive = selectedPath === lesson.relativePath
  const isDone = Boolean(prog?.completed)
  const sidecars = visibleResources(lesson.resources)
  return (
    <li className="lesson-tree__block">
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
          className={`lesson-tree__item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
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
      <LinkedProjects
        projects={projectsFor(lesson.relativePath)}
        selectedProjectId={selectedProjectId}
        onSelectProject={onSelectProject}
      />
      {sidecars.length > 0 ? (
        <ul className="lesson-tree__list lesson-tree__list--nested">
          {sidecars.map((res) => (
            <ResourceRow
              key={res.relativePath}
              res={res}
              selectedPath={selectedPath}
              onSelectResource={onSelectResource}
              linkedProjects={projectsFor(res.relativePath)}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function SectionView({
  section,
  depth,
  collapsedIds,
  onToggle,
  projectsBySection,
  projectsFor,
  selectedPath,
  selectedProjectId,
  onSelectLesson,
  onSelectResource,
  onSelectProject,
  onToggleLessonComplete,
  progressByLesson
}) {
  const resources = visibleResources(section.resources)
  const sectionProjects = projectsBySection.get(section.id) || []
  const nodes = orderedContent(section)
  if (!nodes.length && !resources.length && !sectionProjects.length) return null

  const blocks = []
  let lessonBuffer = []
  const flushLessons = () => {
    if (!lessonBuffer.length) return
    const batch = lessonBuffer
    lessonBuffer = []
    blocks.push(
      <ul className="lesson-tree__list" key={`lessons-${batch[0].id || batch[0].relativePath}`}>
        {batch.map((lesson) => (
          <LessonRow
            key={lesson.id || lesson.relativePath}
            lesson={lesson}
            progressByLesson={progressByLesson}
            selectedPath={selectedPath}
            selectedProjectId={selectedProjectId}
            onSelectLesson={onSelectLesson}
            onSelectResource={onSelectResource}
            onSelectProject={onSelectProject}
            onToggleLessonComplete={onToggleLessonComplete}
            projectsFor={projectsFor}
          />
        ))}
      </ul>
    )
  }

  for (const node of nodes) {
    if (node.type === 'lesson') {
      lessonBuffer.push(node.lesson)
      continue
    }
    flushLessons()
    blocks.push(
      <SectionView
        key={node.section.id}
        section={node.section}
        depth={depth + 1}
        collapsedIds={collapsedIds}
        onToggle={onToggle}
        projectsBySection={projectsBySection}
        projectsFor={projectsFor}
        selectedPath={selectedPath}
        selectedProjectId={selectedProjectId}
        onSelectLesson={onSelectLesson}
        onSelectResource={onSelectResource}
        onSelectProject={onSelectProject}
        onToggleLessonComplete={onToggleLessonComplete}
        progressByLesson={progressByLesson}
      />
    )
  }
  flushLessons()

  return (
    <SectionBlock
      id={section.id}
      title={section.title}
      nested={depth > 0}
      open={!collapsedIds.has(section.id)}
      onToggle={() => onToggle(section.id)}
    >
      {sectionProjects.length > 0 ? (
        <ul className="lesson-tree__list">
          {sectionProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
            />
          ))}
        </ul>
      ) : null}
      {blocks}
      {resources.length > 0 ? (
        <ul className="lesson-tree__list">
          {resources.map((res) => (
            <ResourceRow
              key={res.relativePath}
              res={res}
              selectedPath={selectedPath}
              onSelectResource={onSelectResource}
              linkedProjects={projectsFor(res.relativePath)}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
            />
          ))}
        </ul>
      ) : null}
    </SectionBlock>
  )
}

export { flattenLessons }

export default LessonTree
