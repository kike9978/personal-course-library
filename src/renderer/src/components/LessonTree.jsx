import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Captions,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileArchive,
  FileText,
  Folder,
  FolderKanban,
  Image,
  Music,
  PanelLeftOpen,
  Play,
  X
} from 'lucide-react'
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

const KIND_ICON = {
  doc: FileText,
  image: Image,
  archive: FileArchive,
  subtitle: Captions,
  other: File,
  video: Play,
  audio: Music
}

const KIND_NAME = {
  doc: 'Documento',
  image: 'Imagen',
  archive: 'Archivo comprimido',
  subtitle: 'Subtítulos',
  other: 'Archivo',
  video: 'Video',
  audio: 'Audio'
}

function KindMark({ kind, size = 14 }) {
  const Icon = KIND_ICON[kind] || File
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}

function formatDuration(sec) {
  const total = Math.round(Number(sec) || 0)
  if (total <= 0) return ''
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`
  if (hours > 0) return `${hours} h`
  if (minutes > 0) return `${minutes} min`
  return `${total} s`
}

function collectSectionFiles(section) {
  const files = [
    ...visibleResources(section?.resources),
    ...(section?.lessons || []).flatMap((lesson) => visibleResources(lesson.resources))
  ]
  for (const child of section?.sections || []) files.push(...collectSectionFiles(child))
  return files
}

function sectionMeta(section, progressByLesson) {
  const lessons = flattenLessons([section])
  const files = collectSectionFiles(section)
  if (!lessons.length && !files.length) return ''
  let done = 0
  let duration = 0
  for (const lesson of lessons) {
    const prog = progressByLesson?.[lesson.relativePath]
    if (prog?.completed) done += 1
    duration += lessonDurationSec(lesson, prog)
  }
  for (const file of files) {
    if (progressByLesson?.[file.relativePath]?.completed) done += 1
  }
  const count = `${done} / ${lessons.length + files.length}`
  const length = formatDuration(duration)
  return length ? `${count} | ${length}` : count
}

function lessonDurationSec(lesson, prog) {
  const probed = Number(lesson?.durationSec) || 0
  const played = Number(prog?.durationSec) || 0
  return Math.max(probed, played)
}

function visibleResources(resources) {
  return (resources || []).filter((res) => res.kind !== 'subtitle')
}

function panelIdFor(id, prefix = 'lesson-section') {
  return `${prefix}-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function collapsedIdsForTree(sections, projects, courseResources, selectedPath, selectedProjectId) {
  const next = new Set(nestedSectionIds(sections))
  const activeId = sectionIdForSelection({
    sections,
    projects,
    courseResources,
    selectedPath,
    selectedProjectId
  })
  const openIds =
    !activeId || activeId === '__projects__' || activeId === '__course_resources__'
      ? activeId
        ? [activeId]
        : []
      : ancestorIds(sections, activeId)
  for (const id of openIds) next.delete(id)
  return next
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

function TreeSection({
  id,
  title,
  meta,
  open,
  onToggle,
  nested,
  dense,
  bar,
  idPrefix,
  actions,
  className,
  children
}) {
  const panelId = panelIdFor(id, idPrefix)
  const Chevron = bar ? ChevronDown : ChevronRight
  return (
    <div
      className={`lesson-tree__section${nested ? ' lesson-tree__section--nested' : ''}${
        dense ? ' lesson-tree__section--dense' : ''
      }${bar ? ' lesson-tree__section--bar' : ''}${open ? '' : ' is-collapsed'}${
        className ? ` ${className}` : ''
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
          {bar ? null : <Chevron className="lesson-tree__section-chevron" aria-hidden="true" />}
          <span className="lesson-tree__section-copy">
            <span className="lesson-tree__section-title">{title}</span>
            {meta ? <span className="lesson-tree__section-meta">{meta}</span> : null}
          </span>
        </button>
        {actions ? <div className="lesson-tree__actions">{actions}</div> : null}
        {bar ? (
          <button
            type="button"
            className="lesson-tree__section-chevron-btn"
            aria-expanded={open}
            aria-label={open ? `Contraer ${title}` : `Expandir ${title}`}
            onClick={onToggle}
          >
            <Chevron className="lesson-tree__section-chevron" aria-hidden="true" />
          </button>
        ) : null}
      </h3>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  )
}

function CheckControl({ done, onToggle, doneLabel, openLabel }) {
  return (
    <button
      type="button"
      className={`lesson-tree__check${done ? ' is-done' : ''}`}
      title={done ? doneLabel : openLabel}
      aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.()
      }}
    >
      {done ? <Check size={12} strokeWidth={2.75} aria-hidden="true" /> : null}
    </button>
  )
}

function ProjectsButton({ projects, selectedProjectId, onSelectProject }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const list = projects || []
  const active = list.some((project) => project.id === selectedProjectId)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!list.length) return null

  const single = list.length === 1
  const label = single ? list[0].title || 'Proyecto' : 'Proyectos'
  const hint = list
    .map((project) =>
      project.linkMissing ? `${project.title} (sin carpeta)` : project.title || 'Proyecto'
    )
    .join(', ')

  const choose = (project) => {
    setOpen(false)
    onSelectProject?.(project)
  }

  return (
    <span className="lesson-tree__projects" ref={rootRef}>
      <button
        type="button"
        className={`lesson-tree__resources${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={single ? undefined : open}
        aria-haspopup={single ? undefined : 'menu'}
        title={hint}
        onClick={(event) => {
          event.stopPropagation()
          if (single) choose(list[0])
          else setOpen((value) => !value)
        }}
      >
        <FolderKanban size={14} strokeWidth={2} aria-hidden="true" />
        <span className="lesson-tree__pill-label">{label}</span>
        {single ? null : <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />}
      </button>
      {open ? (
        <ul className="lesson-tree__projects-menu" role="menu">
          {list.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                role="menuitem"
                className={selectedProjectId === project.id ? 'is-active' : ''}
                title={project.linkMissing ? 'Sin carpeta vinculada' : project.linkedFolderPath || project.title}
                onClick={(event) => {
                  event.stopPropagation()
                  choose(project)
                }}
              >
                {project.title || 'Proyecto'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </span>
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
        <span className="lesson-tree__body">
          <span className="lesson-tree__label">{project.title}</span>
          <span className="lesson-tree__meta">
            <FolderKanban size={13} strokeWidth={2} aria-hidden="true" />
            <span>{project.linkMissing ? 'Sin carpeta' : statusLabel(project.status)}</span>
          </span>
        </span>
      </button>
    </li>
  )
}

function resourceNavSection(courseResources, courseResourceSections) {
  const resources = courseResources || []
  const nested = courseResourceSections || []
  if (!resources.length && !nested.length) return null
  return {
    id: '__course_resources__',
    title: 'Recursos del curso',
    lessons: [],
    resources,
    sections: nested
  }
}

function LessonTree({
  sections = [],
  courseResources = [],
  courseResourceSections = [],
  projects = [],
  selectedPath,
  selectedProjectId,
  activeResourceGroupId = null,
  onSelectLesson,
  onOpenResources,
  onSelectProject,
  onAddProject,
  onToggleLessonComplete,
  onToggleCollapsed,
  collapsed = false,
  progressByLesson = {},
  completedCount = 0,
  playableCount = 0,
  courseTitle = 'Contenido'
}) {
  const resourceNav = resourceNavSection(courseResources, courseResourceSections)
  const navSections = resourceNav ? [...sections, resourceNav] : sections
  const [collapsedIds, setCollapsedIds] = useState(() =>
    collapsedIdsForTree(navSections, projects, courseResources, selectedPath, selectedProjectId)
  )
  const sectionKey = nestedSectionIds(navSections)
    .concat(navSections.map((section) => section.id))
    .join('\0')
  const selectionSource = useRef({ sections: navSections, projects, courseResources })
  selectionSource.current = { sections: navSections, projects, courseResources }
  const seenSectionKey = useRef(sectionKey)
  if (seenSectionKey.current !== sectionKey) {
    seenSectionKey.current = sectionKey
    setCollapsedIds(
      collapsedIdsForTree(navSections, projects, courseResources, selectedPath, selectedProjectId)
    )
  }

  useLayoutEffect(() => {
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

  const treeRef = useRef(null)
  const scrolledSectionKey = useRef(null)
  useLayoutEffect(() => {
    if (collapsed || scrolledSectionKey.current === sectionKey) return
    const active = treeRef.current?.querySelector('.lesson-tree__item.is-active')
    if (!active) return
    active.scrollIntoView({ block: 'center', inline: 'nearest' })
    scrolledSectionKey.current = sectionKey
  }, [sectionKey, selectedPath, selectedProjectId, collapsed, collapsedIds])

  const toggleSection = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasLessons = flattenLessons(sections).length > 0
  const hasCourseResources = Boolean(resourceNav)
  const hasProjects = projects.length > 0
  const hasContent = hasLessons || hasCourseResources || hasProjects

  const filePaths = collectFilePaths(navSections, courseResources)

  const projectsByFile = new Map()
  const projectsBySection = new Map()
  const unanchored = []
  for (const project of projects) {
    if (project.fileRelativePath && filePaths.has(project.fileRelativePath)) {
      if (!projectsByFile.has(project.fileRelativePath)) {
        projectsByFile.set(project.fileRelativePath, [])
      }
      projectsByFile.get(project.fileRelativePath).push(project)
    } else if (project.sectionId && sectionExists(navSections, project.sectionId)) {
      if (!projectsBySection.has(project.sectionId)) projectsBySection.set(project.sectionId, [])
      projectsBySection.get(project.sectionId).push(project)
    } else {
      unanchored.push(project)
    }
  }

  const projectsFor = (relativePath) => (relativePath ? projectsByFile.get(relativePath) || [] : [])

  if (!hasContent) {
    if (collapsed && onToggleCollapsed) {
      return (
        <button
          type="button"
          className="lesson-tree__expand"
          onClick={onToggleCollapsed}
          title="Mostrar contenido"
          aria-expanded={false}
          aria-label="Mostrar contenido"
        >
          <PanelLeftOpen size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )
    }
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
    <>
    {collapsed && onToggleCollapsed ? (
      <button
        type="button"
        className="lesson-tree__expand"
        onClick={onToggleCollapsed}
        title="Mostrar contenido"
        aria-expanded={false}
        aria-label="Mostrar contenido"
      >
        <PanelLeftOpen size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    ) : null}
    <nav
      className="lesson-tree"
      aria-label="Contenido del curso"
      hidden={collapsed}
      ref={treeRef}
    >
      <div className="lesson-tree__sticky">
        <div className="lesson-tree__header">
          <div className="lesson-tree__header-copy">
            <h2 title={courseTitle}>{courseTitle}</h2>
          </div>
          <div className="lesson-tree__header-actions">
            <button
              type="button"
              className="lesson-tree__add-project"
              onClick={() => onAddProject?.()}
              title="Añadir proyecto virtual"
            >
              + Proyecto
            </button>
            {onToggleCollapsed ? (
              <button
                type="button"
                className="lesson-tree__collapse"
                onClick={onToggleCollapsed}
                title="Cerrar panel"
                aria-expanded={!collapsed}
                aria-label="Cerrar panel"
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        {playableCount > 0 ? (
          <div
            className="course-goal"
            style={{ '--goal': `${Math.round((completedCount / playableCount) * 100)}%` }}
          >
            <div className="course-goal__copy">
              <strong>
                Progreso · {completedCount}/{playableCount}
              </strong>
              <p>
                {completedCount} de {playableCount}{' '}
                {playableCount === 1 ? 'lección completada' : 'lecciones completadas'}.
              </p>
            </div>
            <div className="course-goal__ring" aria-hidden="true" />
          </div>
        ) : null}
      </div>

      {unanchored.length > 0 ? (
        <TreeSection
          id="__projects__"
          title="Proyectos"
          meta={`${unanchored.length} ${unanchored.length === 1 ? 'proyecto' : 'proyectos'}`}
          bar
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
        </TreeSection>
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
          onOpenResources={onOpenResources}
          activeResourceGroupId={activeResourceGroupId}
          onSelectProject={onSelectProject}
          onToggleLessonComplete={onToggleLessonComplete}
          progressByLesson={progressByLesson}
        />
      ))}

      {resourceNav ? (
        <SectionView
          section={resourceNav}
          depth={0}
          collapsedIds={collapsedIds}
          onToggle={toggleSection}
          projectsBySection={projectsBySection}
          projectsFor={projectsFor}
          selectedPath={selectedPath}
          selectedProjectId={selectedProjectId}
          onSelectLesson={onSelectLesson}
          onOpenResources={onOpenResources}
          activeResourceGroupId={activeResourceGroupId}
          onSelectProject={onSelectProject}
          onToggleLessonComplete={onToggleLessonComplete}
          progressByLesson={progressByLesson}
        />
      ) : null}
    </nav>
    </>
  )
}

function LessonRow({
  lesson,
  progressByLesson,
  selectedPath,
  selectedProjectId,
  activeResourceGroupId,
  onSelectLesson,
  onOpenResources,
  onSelectProject,
  onToggleLessonComplete,
  projectsFor
}) {
  const prog = progressByLesson[lesson.relativePath]
  const isActive = selectedPath === lesson.relativePath
  const isDone = Boolean(prog?.completed)
  const sidecars = visibleResources(lesson.resources)
  const linked = projectsFor(lesson.relativePath)
  const groupId = `lesson:${lesson.relativePath}`
  const resourcesActive = activeResourceGroupId === groupId
  const duration = formatDuration(lessonDurationSec(lesson, prog))
  const kind = lesson.kind === 'audio' ? 'audio' : 'video'

  return (
    <li className="lesson-tree__block">
      <div
        className={`lesson-tree__row${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
      >
        <CheckControl
          done={isDone}
          doneLabel="Marcar como no completada"
          openLabel="Marcar como completada"
          onToggle={() => onToggleLessonComplete?.(lesson, !isDone)}
        />
        <button
          type="button"
          className={`lesson-tree__item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
          onClick={() => onSelectLesson?.(lesson)}
          title={lesson.relativePath}
        >
          <span className="lesson-tree__body">
            <span className="lesson-tree__label">{lesson.title}</span>
            <span className="lesson-tree__meta">
              <KindMark kind={kind} size={13} />
              <span>{duration || KIND_NAME[kind]}</span>
              {prog?.positionSec > 0 && !isDone ? (
                <span className="lesson-tree__resume" aria-hidden="true" />
              ) : null}
            </span>
          </span>
        </button>
        {linked.length > 0 || sidecars.length > 0 ? (
          <div className="lesson-tree__actions">
            <ProjectsButton
              projects={linked}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
            />
            {sidecars.length > 0 ? (
              <button
                type="button"
                className={`lesson-tree__resources${resourcesActive ? ' is-active' : ''}`}
                aria-pressed={resourcesActive}
                onClick={() =>
                  onOpenResources?.({
                    id: groupId,
                    title: lesson.title,
                    hint: 'Archivos adjuntos de esta lección.',
                    lessonPath: lesson.relativePath,
                    sectionId: lesson.sectionId,
                    resources: sidecars
                  })
                }
              >
                <Folder size={14} strokeWidth={2} aria-hidden="true" />
                Recursos
                <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
  activeResourceGroupId,
  onSelectLesson,
  onOpenResources,
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
            activeResourceGroupId={activeResourceGroupId}
            onSelectLesson={onSelectLesson}
            onOpenResources={onOpenResources}
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
        activeResourceGroupId={activeResourceGroupId}
        onSelectLesson={onSelectLesson}
        onOpenResources={onOpenResources}
        onSelectProject={onSelectProject}
        onToggleLessonComplete={onToggleLessonComplete}
        progressByLesson={progressByLesson}
      />
    )
  }
  flushLessons()

  return (
    <TreeSection
      id={section.id}
      title={section.title}
      meta={sectionMeta(section, progressByLesson)}
      nested={depth > 0}
      bar
      open={!collapsedIds.has(section.id)}
      onToggle={() => onToggle(section.id)}
      actions={
        sectionProjects.length > 0 ? (
          <ProjectsButton
            projects={sectionProjects}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
          />
        ) : null
      }
    >
      {blocks}
      {resources.length > 0 ? (
        <ul className="lesson-tree__list">
          <li>
            <button
              type="button"
              className={`lesson-tree__item lesson-tree__item--resources${
                activeResourceGroupId === `section:${section.id}` ? ' is-active' : ''
              }`}
              onClick={() =>
                onOpenResources?.({
                  id: `section:${section.id}`,
                  title: section.title,
                  hint: 'Archivos de esta sección.',
                  sectionId: section.id,
                  resources
                })
              }
            >
              <span className="lesson-tree__body">
                <span className="lesson-tree__label">Recursos</span>
                <span className="lesson-tree__meta">
                  <Folder size={13} strokeWidth={2} aria-hidden="true" />
                  <span>
                    {resources.length} {resources.length === 1 ? 'archivo' : 'archivos'}
                  </span>
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        </ul>
      ) : null}
    </TreeSection>
  )
}

export { flattenLessons, TreeSection, ProjectsButton }

export default LessonTree
