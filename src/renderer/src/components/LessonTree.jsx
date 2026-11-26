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
  Plus,
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
import { cn } from '../ui/cn'
import { btnCompact, btnGhost, btnQuiet } from '../ui/classes'

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral'

const treeItem =
  'flex min-w-0 cursor-pointer items-start gap-[0.45rem] border-0 bg-transparent text-left text-ink'

const treeLabel = 'min-w-0 flex-1 text-base leading-[1.3] line-clamp-2'

const treeBody = 'flex min-w-0 flex-1 flex-col gap-[0.28rem]'

const treeMeta =
  'inline-flex min-w-0 items-center gap-[0.35rem] text-xs font-medium leading-none text-ink-soft'

const treeList = 'm-0 flex list-none flex-col gap-[0.2rem] p-0'

function sectionCopyClass({ dense }) {
  return cn(
    'flex min-w-0 flex-1 flex-col gap-[0.15rem]',
    dense && 'flex-row items-center gap-[0.45rem] overflow-hidden'
  )
}

function sectionMetaClass({ dense, nested }) {
  return cn(
    'font-body text-xs font-medium normal-case tracking-normal text-ink-soft',
    dense &&
      'mt-[0.05rem] min-w-[1.15rem] shrink-0 rounded-full bg-cream-deep px-[0.38rem] py-[0.02rem] text-center text-2xs leading-[1.35] font-semibold',
    dense && nested && 'bg-transparent pr-0'
  )
}

function sectionClass({ nested, dense, bar, open, className }) {
  const loose = typeof className === 'string' && className.split(/\s+/).includes('is-loose')
  return cn(
    'mb-4',
    bar && 'mb-0 border-b border-ink/10',
    !open && !dense && 'mb-[0.35rem]',
    nested &&
      !bar &&
      'mt-[0.15rem] mr-0 mb-[0.45rem] ml-[0.55rem] border-l border-ink/10 pl-[0.35rem]',
    dense &&
      !nested &&
      !bar &&
      'm-0 border-b border-ink/6 px-0.5 pt-1 pb-1.5 last:border-b-0',
    dense &&
      nested &&
      !bar &&
      'm-0 mt-[0.04rem] ml-[var(--ann-indent)] border-0 border-l border-ink/8 bg-transparent p-0 pl-1',
    nested &&
      bar &&
      'mt-0 mr-0 mb-0 ml-[0.8rem] border-b-0 border-l-2 border-ink/18 bg-surface pl-0',
    bar && '[&>div>ul]:gap-0',
    className,
    loose && 'bg-transparent'
  )
}

function sectionHeadClass({ bar, nested }) {
  return cn(
    'm-0 flex min-w-0 items-center',
    bar && !nested && 'border-t border-ink/6 bg-surface hover:bg-ink/[0.025]'
  )
}

function sectionToggleClass({ nested, dense, bar }) {
  return cn(
    'flex w-auto min-w-0 flex-1 cursor-pointer items-center gap-[0.28rem] border-0 bg-transparent text-left text-xs font-semibold uppercase tracking-[0.04em] text-ink-soft',
    'mb-[0.35rem] rounded-sm px-[0.3rem] py-[0.2rem] hover:bg-ink/5 hover:text-ink',
    focusRing,
    nested && 'mb-[0.2rem] text-2xs normal-case tracking-[0.02em]',
    dense && !nested && !bar &&
      'mb-0 items-center gap-[var(--ann-chevron-gap)] rounded-md px-[var(--ann-pad-x)] py-[0.22rem] font-display text-sm leading-[1.25] font-semibold tracking-normal text-ink normal-case hover:bg-ink/5 hover:text-ink',
    dense &&
      nested &&
      !bar &&
      'mb-0 px-[var(--ann-pad-x)] py-[0.16rem] text-xs font-semibold tracking-normal text-ink-soft normal-case',
    bar &&
      'm-0 items-start gap-3 rounded-none bg-transparent px-4 py-3 text-sm font-semibold normal-case tracking-normal text-ink hover:bg-ink/[0.025] hover:text-ink',
    bar && !nested && 'bg-transparent hover:bg-transparent hover:text-ink',
    bar &&
      nested &&
      'm-0 bg-transparent px-[0.75rem] pt-[0.65rem] pb-[0.4rem] text-base font-semibold hover:bg-ink/5'
  )
}

function sectionChevronClass({ bar, nested, dense, open }) {
  return cn(
    'shrink-0 transition-transform duration-150 ease-pop',
    bar ? 'mt-0.5 size-4 text-ink-faint' : 'h-[0.65rem] w-[0.65rem]',
    bar && nested && 'h-[0.95rem] w-[0.95rem]',
    dense && !bar && 'mt-0 size-[var(--ann-chevron)]',
    open && (bar ? 'rotate-180' : 'rotate-90')
  )
}

function sectionTitleClass({ bar, nested }) {
  return cn(
    'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
    bar &&
      'overflow-visible font-display text-clip font-semibold leading-[1.25] whitespace-normal',
    bar && nested && 'font-semibold'
  )
}

const iconBtnQuiet =
  'inline-flex h-[1.85rem] w-[1.85rem] cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-ink-soft hover:bg-ink/6 hover:text-ink'

const pillBtn =
  'relative inline-flex max-w-[11rem] cursor-pointer items-center gap-1 rounded-full border border-coral/40 bg-surface px-2 py-1 text-xs leading-none font-medium text-coral-deep hover:bg-coral/10'

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

function SectionPick({ checked, indeterminate, label, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked
  }, [checked, indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="ml-[var(--ann-pad-x,0.35rem)] size-3.5 shrink-0 cursor-pointer accent-coral"
      checked={checked}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={() => onChange?.()}
    />
  )
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
  pick,
  children
}) {
  const panelId = panelIdFor(id, idPrefix)
  const Chevron = bar ? ChevronDown : ChevronRight
  const chevronClass = sectionChevronClass({ bar, nested, dense, open })
  return (
    <div className={sectionClass({ nested, dense, bar, open, className })}>
      <h3 className={sectionHeadClass({ bar, nested })}>
        {pick ? (
          <SectionPick
            checked={pick.checked}
            indeterminate={pick.indeterminate}
            label={pick.label}
            onChange={pick.onChange}
          />
        ) : null}
        <button
          type="button"
          className={sectionToggleClass({ nested, dense, bar })}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? `Contraer ${title}` : `Expandir ${title}`}
          title={title}
          onClick={onToggle}
        >
          {bar ? null : <Chevron className={chevronClass} aria-hidden="true" />}
          <span className={sectionCopyClass({ dense })}>
            <span className={sectionTitleClass({ bar, nested })}>{title}</span>
            {meta ? <span className={sectionMetaClass({ dense, nested })}>{meta}</span> : null}
          </span>
        </button>
        {actions ? (
          <div className="mr-3 ml-0 inline-flex items-center gap-[0.4rem] self-center">
            {actions}
          </div>
        ) : null}
        {bar ? (
          <button
            type="button"
            className={cn(
              'mr-[0.7rem] ml-0 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-[0.2rem] text-ink-soft',
              focusRing
            )}
            aria-expanded={open}
            aria-label={open ? `Contraer ${title}` : `Expandir ${title}`}
            onClick={onToggle}
          >
            <Chevron className={chevronClass} aria-hidden="true" />
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
      className={cn(
        'mt-[0.12rem] inline-flex h-[1.05rem] w-[1.05rem] cursor-pointer items-center justify-center rounded-[3px] border-[1.5px] border-ink/38 bg-transparent p-0 text-teal',
        done && 'border-teal'
      )}
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
    <span className="relative inline-flex min-w-0" ref={rootRef}>
      <button
        type="button"
        className={cn(pillBtn, active && 'bg-coral/10')}
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
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
        {single ? null : (
          <ChevronDown
            size={14}
            strokeWidth={2}
            aria-hidden="true"
            className={cn(
              'transition-transform duration-150 ease-pop',
              open && 'rotate-180'
            )}
          />
        )}
      </button>
      {open ? (
        <ul
          className="absolute top-[calc(100%+0.35rem)] right-0 z-[4] m-0 min-w-[11rem] max-w-[16rem] list-none rounded-sm border border-ink/10 bg-surface p-[0.3rem] shadow-lift"
          role="menu"
        >
          {list.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                role="menuitem"
                className={cn(
                  'w-full cursor-pointer rounded-sm border-0 bg-transparent px-[0.55rem] py-[0.4rem] text-left text-sm font-semibold text-ink hover:bg-coral/12',
                  selectedProjectId === project.id && 'bg-coral/12'
                )}
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
        data-tree-item=""
        className={cn(
          treeItem,
          'w-full rounded-none pt-[0.6rem] pr-[0.95rem] pb-[0.65rem] pl-[2.15rem] hover:bg-ink/4',
          isActive && 'is-active bg-coral/20 text-ink',
          project.linkMissing && !isActive && 'text-coral-deep'
        )}
        onClick={() => onSelectProject?.(project)}
        title={project.linkedFolderPath || 'Sin carpeta vinculada'}
      >
        <span className={treeBody}>
          <span className={treeLabel}>{project.title}</span>
          <span className={cn(treeMeta, 'text-teal')}>
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
    const active = treeRef.current?.querySelector('[data-tree-item].is-active')
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
          className={cn(iconBtnQuiet, focusRing)}
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
      <div className="p-5 text-base text-ink-soft">
        <p>No hay lecciones ni recursos en esta carpeta.</p>
        <button type="button" className={btnGhost} onClick={() => onAddProject?.()}>
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
        className={cn(iconBtnQuiet, focusRing)}
        onClick={onToggleCollapsed}
        title="Mostrar contenido"
        aria-expanded={false}
        aria-label="Mostrar contenido"
      >
        <PanelLeftOpen size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    ) : null}
    <nav
      className="px-0 pt-0 pb-6"
      aria-label="Contenido del curso"
      hidden={collapsed}
      ref={treeRef}
    >
      <div className="sticky top-0 z-[2] bg-surface pb-3">
        <div className="static z-[1] flex items-center justify-between gap-3 bg-surface px-4 pt-3.5 pb-2">
          <div className="min-w-0 flex-1">
            <h2
              className="m-0 overflow-hidden font-display text-md font-semibold text-ellipsis whitespace-nowrap"
              title={courseTitle}
            >
              {courseTitle}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-[0.15rem]">
            <button
              type="button"
              className={cn(btnQuiet, btnCompact, 'h-7 px-2 text-coral-deep enabled:hover:bg-coral-soft enabled:hover:text-coral-deep')}
              onClick={() => onAddProject?.()}
              title="Añadir proyecto virtual"
            >
              <Plus size={14} aria-hidden="true" />
              Proyecto
            </button>
            {onToggleCollapsed ? (
              <button
                type="button"
                className={cn(iconBtnQuiet, focusRing)}
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
          <div className="mx-4 mt-1 mb-1 flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-ink-soft">Progreso</span>
              <span className="text-ink-soft tabular-nums">
                <strong className="font-semibold text-ink">{completedCount}</strong> /{' '}
                {playableCount} lecciones
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-ink/8"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={playableCount}
              aria-valuenow={completedCount}
              aria-label="Lecciones completadas"
            >
              <div
                className="h-full rounded-full bg-teal transition-[width] duration-300 ease-pop"
                style={{ width: `${Math.round((completedCount / playableCount) * 100)}%` }}
              />
            </div>
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
          <ul className={treeList}>
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
    <li className="flex flex-col gap-[0.15rem]">
      <div
        className={cn(
          'relative grid items-start gap-x-2.5 px-4 py-2.5 transition-colors duration-100 hover:bg-ink/[0.03]',
          linked.length > 0 || sidecars.length > 0
            ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
            : 'grid-cols-[auto_minmax(0,1fr)]',
          isActive &&
            'is-active bg-coral-soft shadow-[inset_3px_0_0_var(--color-coral)] hover:bg-coral-soft'
        )}
      >
        <CheckControl
          done={isDone}
          doneLabel="Marcar como no completada"
          openLabel="Marcar como completada"
          onToggle={() => onToggleLessonComplete?.(lesson, !isDone)}
        />
        <button
          type="button"
          data-tree-item=""
          className={cn(
            treeItem,
            'flex-1 rounded-none p-0 hover:bg-transparent hover:text-ink',
            isActive && 'is-active bg-transparent text-ink'
          )}
          onClick={() => onSelectLesson?.(lesson)}
          title={lesson.relativePath}
        >
          <span className={treeBody}>
            <span className={cn(treeLabel, isDone && 'opacity-65')}>{lesson.title}</span>
            <span className={treeMeta}>
              <KindMark kind={kind} size={13} />
              <span>{duration || KIND_NAME[kind]}</span>
              {prog?.positionSec > 0 && !isDone ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal" aria-hidden="true" />
              ) : null}
            </span>
          </span>
        </button>
        {linked.length > 0 || sidecars.length > 0 ? (
          <div className="ml-[0.65rem] inline-flex items-center gap-[0.4rem] self-center">
            <ProjectsButton
              projects={linked}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
            />
            {sidecars.length > 0 ? (
              <button
                type="button"
                className={cn(pillBtn, resourcesActive && 'bg-coral/10')}
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
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="transition-transform duration-150 ease-pop"
                />
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
      <ul className={treeList} key={`lessons-${batch[0].id || batch[0].relativePath}`}>
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
        <ul className={treeList}>
          <li>
            <button
              type="button"
              data-tree-item=""
              className={cn(
                treeItem,
                'w-full items-center rounded-none pt-[0.7rem] pr-[0.95rem] pb-[0.75rem] pl-[2.6rem] hover:bg-ink/4',
                activeResourceGroupId === `section:${section.id}` && 'is-active bg-coral/20 text-ink'
              )}
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
              <span className={treeBody}>
                <span className={treeLabel}>Recursos</span>
                <span className={treeMeta}>
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
