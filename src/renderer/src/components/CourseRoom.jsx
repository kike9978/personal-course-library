import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import LessonTree, { flattenLessons } from './LessonTree'
import LessonPlayer from './LessonPlayer'
import ResourceViewer from './ResourceViewer'
import ProjectPanel from './ProjectPanel'
import StudySidePanel from './StudySidePanel'
import CourseAnnotationsView from './CourseAnnotationsView'
import Loader from './Loader'

function collectAllResources(tree) {
  if (!tree) return []
  const list = [...(tree.courseResources || [])]
  for (const section of tree.sections || []) {
    list.push(...(section.resources || []))
    for (const lesson of section.lessons || []) {
      list.push(...(lesson.resources || []))
    }
  }
  return list.filter((res) => res.kind !== 'subtitle')
}

function CourseRoom({
  course,
  onBack,
  onOpenExplorer,
  onProgressChange,
  resumeTarget = null,
  liveJump = null
}) {
  const coursePath = course.path
  const [tree, setTree] = useState(null)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [selectedResourcePath, setSelectedResourcePath] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectDraft, setProjectDraft] = useState(null)
  const [projects, setProjects] = useState([])
  const [panelMode, setPanelMode] = useState('lesson') // 'lesson' | 'resource' | 'project'
  const [studyOpen, setStudyOpen] = useState(false)
  const [showCourseAnnotations, setShowCourseAnnotations] = useState(false)
  const [annotations, setAnnotations] = useState([])
  const [topics, setTopics] = useState([])
  const [draft, setDraft] = useState({ text: '', markdown: '', json: null })
  const [editorKey, setEditorKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [noteScope, setNoteScope] = useState('moment')
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [pendingSeek, setPendingSeek] = useState(null)
  const playerRef = useRef(null)
  const resumeApplied = useRef(false)

  const applyProgress = useCallback(
    (next) => {
      setProgress(next)
      onProgressChange?.(coursePath, next)
    },
    [coursePath, onProgressChange]
  )

  const refreshStudy = useCallback(async () => {
    try {
      const [list, topicList] = await Promise.all([
        window.api.listNotes(coursePath),
        window.api.listTopics()
      ])
      setAnnotations(list || [])
      setTopics(topicList || [])
    } catch (err) {
      console.error(err)
    }
  }, [coursePath])

  const refreshProjects = useCallback(async () => {
    try {
      const list = await window.api.listProjects(coursePath)
      setProjects(list || [])
      return list || []
    } catch (err) {
      console.error(err)
      return []
    }
  }, [coursePath])

  const load = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const [scanned, courseProgress] = await Promise.all([
          window.api.scanCourse(coursePath, force),
          window.api.getCourseProgress(coursePath)
        ])
        setTree(scanned)
        applyProgress(courseProgress)
        const [, projectList] = await Promise.all([refreshStudy(), refreshProjects()])

        const flat = flattenLessons(scanned.sections)
        const resources = collectAllResources(scanned)
        const resumeProjectId = resumeTarget?.projectId
        const resumeProject =
          resumeProjectId && Array.isArray(projectList)
            ? projectList.find((p) => p.id === resumeProjectId)
            : null

        setCreatingProject(false)
        if (resumeProject) {
          setSelectedProjectId(resumeProject.id)
          setSelectedPath(null)
          setSelectedResourcePath(null)
          setPanelMode('project')
          setNoteScope('file')
        } else {
          setSelectedProjectId(null)
          const resumePath = resumeTarget?.lessonRelativePath
          const last = resumePath || courseProgress?.lastLessonRelativePath
          const lastLesson = flat.find((l) => l.relativePath === last)
          const lastResource =
            !lastLesson && last ? resources.find((r) => r.relativePath === last) : null

          if (lastLesson) {
            setSelectedPath(lastLesson.relativePath)
            setSelectedResourcePath(null)
            setPanelMode('lesson')
            if (resumeTarget && typeof resumeTarget.timeSec === 'number') {
              setPendingSeek(resumeTarget.timeSec)
            }
            if (resumePath && typeof resumeTarget?.timeSec !== 'number') {
              setNoteScope('file')
            }
          } else if (lastResource) {
            setSelectedPath(null)
            setSelectedResourcePath(lastResource.relativePath)
            setPanelMode('resource')
            setNoteScope('file')
          } else if (flat[0]) {
            setSelectedPath(flat[0].relativePath)
            setSelectedResourcePath(null)
            setPanelMode('lesson')
          } else if (resources[0]) {
            setSelectedPath(null)
            setSelectedResourcePath(resources[0].relativePath)
            setPanelMode('resource')
            setNoteScope('file')
          } else {
            setSelectedPath(null)
            setSelectedResourcePath(null)
            setPanelMode('lesson')
          }
        }
      } catch (err) {
        console.error(err)
        setError(err.message || 'No se pudo escanear el curso')
        setTree(null)
      } finally {
        setLoading(false)
      }
    },
    [coursePath, applyProgress, refreshStudy, refreshProjects, resumeTarget]
  )

  useEffect(() => {
    resumeApplied.current = false
    load(false)
  }, [load])

  useEffect(() => {
    const unsub = window.api.onNotesChanged?.((payload) => {
      if (!payload?.coursePath || payload.coursePath === coursePath) {
        refreshStudy()
      }
    })
    return () => unsub?.()
  }, [coursePath, refreshStudy])

  const flatLessons = useMemo(() => flattenLessons(tree?.sections), [tree])

  const mentionItems = useMemo(() => {
    const items = flatLessons.map((lesson) => ({
      type: 'lesson',
      id: lesson.relativePath,
      title: lesson.title || lesson.name || lesson.relativePath,
      subtitle: 'Lección'
    }))
    for (const project of projects) {
      items.push({
        type: 'project',
        id: project.id,
        title: project.title || project.id,
        subtitle: 'Proyecto'
      })
    }
    if (course?.title || coursePath) {
      items.push({
        type: 'course',
        id: coursePath,
        title: course.title || coursePath,
        subtitle: 'Curso'
      })
    }
    for (const topic of topics) {
      items.push({
        type: 'topic',
        id: topic.id,
        title: topic.title,
        subtitle: 'Tema'
      })
    }
    return items
  }, [course?.title, coursePath, flatLessons, projects, topics])

  const handleSeekTimestamp = useCallback((timeSec) => {
    const sec = Number(timeSec)
    if (!Number.isFinite(sec)) return
    if (playerRef.current?.seekTo) {
      playerRef.current.seekTo(sec)
      return
    }
    setPendingSeek(sec)
  }, [])

  const selectedLesson = useMemo(() => {
    if (!selectedPath) return null
    return flatLessons.find((l) => l.relativePath === selectedPath) || null
  }, [flatLessons, selectedPath])

  const selectedResource = useMemo(() => {
    if (!selectedResourcePath || !tree) return null
    return collectAllResources(tree).find((r) => r.relativePath === selectedResourcePath) || null
  }, [tree, selectedResourcePath])

  const selectedProject = useMemo(() => {
    if (creatingProject) return null
    if (!selectedProjectId) return null
    return projects.find((p) => p.id === selectedProjectId) || null
  }, [projects, selectedProjectId, creatingProject])

  const activeTarget = useMemo(() => {
    if (panelMode === 'project' && selectedProject) {
      return {
        path: null,
        projectId: selectedProject.id,
        title: selectedProject.title || 'Proyecto',
        kind: 'project'
      }
    }
    if (panelMode === 'resource' && selectedResource) {
      return {
        path: selectedResource.relativePath,
        projectId: null,
        title: selectedResource.title || selectedResource.name || selectedResource.relativePath,
        kind: 'resource'
      }
    }
    if (panelMode === 'lesson' && selectedLesson) {
      return {
        path: selectedLesson.relativePath,
        projectId: null,
        title: selectedLesson.title,
        kind: 'lesson'
      }
    }
    return null
  }, [panelMode, selectedLesson, selectedResource, selectedProject])

  const treeHighlightPath = panelMode === 'resource' ? selectedResourcePath : selectedPath

  useEffect(() => {
    if ((panelMode === 'resource' || panelMode === 'project') && noteScope === 'moment') {
      setNoteScope('file')
    }
  }, [panelMode, noteScope])

  const selectedIndex = useMemo(() => {
    if (!selectedPath) return -1
    return flatLessons.findIndex((l) => l.relativePath === selectedPath)
  }, [flatLessons, selectedPath])

  const initialPositionSec = useMemo(() => {
    if (pendingSeek != null) return pendingSeek
    if (!selectedPath || !progress) return 0
    const lessonProg = progress.lessons?.[selectedPath]
    if (lessonProg?.completed) return 0
    if (progress.lastLessonRelativePath === selectedPath) {
      return progress.lastPositionSec || 0
    }
    return lessonProg?.positionSec || 0
  }, [progress, selectedPath, pendingSeek])

  useEffect(() => {
    if (pendingSeek == null || !selectedLesson) return
    const id = requestAnimationFrame(() => {
      playerRef.current?.seekTo?.(pendingSeek)
      setPendingSeek(null)
    })
    return () => cancelAnimationFrame(id)
  }, [selectedLesson, pendingSeek])

  const selectedCompleted = Boolean(progress?.lessons?.[selectedPath]?.completed)

  const handleSelectLesson = (lesson) => {
    setSelectedPath(lesson.relativePath)
    setSelectedResourcePath(null)
    setSelectedProjectId(null)
    setCreatingProject(false)
    setPanelMode('lesson')
    setNoteScope((s) => (s === 'file' || s === 'moment' ? 'moment' : s))
  }

  const handleSelectResource = (resource) => {
    setSelectedResourcePath(resource.relativePath)
    setSelectedProjectId(null)
    setCreatingProject(false)
    setPanelMode('resource')
    setNoteScope((s) => (s === 'moment' ? 'file' : s === 'course' ? 'course' : 'file'))
  }

  const handleSelectProject = (project) => {
    setSelectedProjectId(project.id)
    setCreatingProject(false)
    setProjectDraft(null)
    setPanelMode('project')
    setNoteScope((s) => (s === 'moment' ? 'file' : s === 'course' ? 'course' : 'file'))
  }

  const handleAddProject = async () => {
    try {
      const result = await window.api.pickProjectFolder()
      if (result?.canceled || !result?.path) return
      const folderName =
        result.name ||
        result.path
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() ||
        ''
      setSelectedProjectId(null)
      setProjectDraft({
        title: folderName,
        linkedFolderPath: result.path
      })
      setCreatingProject(true)
      setPanelMode('project')
    } catch (err) {
      toast.error(err.message || 'No se pudo elegir carpeta')
    }
  }

  const handleProjectsSaved = (list, saved) => {
    setProjects(list || [])
    setCreatingProject(false)
    setProjectDraft(null)
    if (saved?.id) {
      setSelectedProjectId(saved.id)
      setPanelMode('project')
    }
  }

  const handleProjectDeleted = (list) => {
    setProjects(list || [])
    setSelectedProjectId(null)
    setCreatingProject(false)
    setProjectDraft(null)
    if (selectedPath) setPanelMode('lesson')
    else if (selectedResourcePath) setPanelMode('resource')
    else setPanelMode('lesson')
  }

  const handleProgress = useCallback(
    async (update) => {
      try {
        const next = await window.api.setLessonProgress(coursePath, {
          relativePath: update.relativePath,
          title: update.title,
          positionSec: update.positionSec,
          durationSec: update.durationSec,
          completed: update.completed,
          setAsLast: true
        })
        applyProgress(next)
      } catch (err) {
        console.error('Failed to save progress', err)
      }
    },
    [coursePath, applyProgress]
  )

  const toggleLessonComplete = useCallback(
    async (lesson, completed) => {
      if (!lesson?.relativePath) return
      try {
        const next = await window.api.setLessonProgress(coursePath, {
          relativePath: lesson.relativePath,
          title: lesson.title,
          completed,
          setAsLast: true
        })
        applyProgress(next)
        toast.success(completed ? 'Lección completada' : 'Lección reabierta')
      } catch (err) {
        toast.error(err.message || 'No se pudo actualizar')
      }
    },
    [coursePath, applyProgress]
  )

  const jumpTo = useCallback(
    (item) => {
      if (item?.projectId) {
        const project = projects.find((p) => p.id === item.projectId)
        if (!project) {
          toast.error('Proyecto no encontrado')
          return
        }
        setCreatingProject(false)
        setSelectedProjectId(project.id)
        setPanelMode('project')
        setNoteScope((s) => (s === 'moment' ? 'file' : s))
        return
      }

      if (!item?.lessonRelativePath) return
      const path = item.lessonRelativePath
      const isLesson = flatLessons.some((l) => l.relativePath === path)
      const resource =
        !isLesson && tree ? collectAllResources(tree).find((r) => r.relativePath === path) : null

      setSelectedProjectId(null)
      setCreatingProject(false)

      if (isLesson) {
        setPanelMode('lesson')
        setSelectedResourcePath(null)
        if (path !== selectedPath) {
          setSelectedPath(path)
          if (typeof item.timeSec === 'number') {
            setPendingSeek(item.timeSec)
          }
        } else if (typeof item.timeSec === 'number') {
          playerRef.current?.seekTo?.(item.timeSec)
        }
        return
      }

      if (resource) {
        setPanelMode('resource')
        setSelectedResourcePath(path)
        setNoteScope((s) => (s === 'moment' ? 'file' : s))
      }
    },
    [selectedPath, flatLessons, tree, projects]
  )

  useEffect(() => {
    if (!liveJump || liveJump.coursePath !== coursePath || !tree) return
    setShowCourseAnnotations(false)
    setStudyOpen(false)
    jumpTo(liveJump)
  }, [liveJump, coursePath, tree, jumpTo])

  const clearDraft = () => {
    setDraft({ text: '', markdown: '', json: null })
    setEditingId(null)
    setEditorKey((k) => k + 1)
  }

  const loadDraftForEdit = (item) => {
    setEditingId(item.id)
    setDraft({
      text: item.body || '',
      markdown: item.body || '',
      json: item.bodyJson || null
    })
    setEditorKey((k) => k + 1)
    setNoteScope(
      typeof item.timeSec === 'number'
        ? 'moment'
        : item.projectId || item.lessonRelativePath
          ? 'file'
          : 'course'
    )
  }

  const handleDraftChange = (next) => {
    const markdown = next?.markdown || next?.text || ''
    setDraft({ text: markdown, markdown, json: null })
  }

  const saveNote = async () => {
    const body = (draft.markdown || draft.text || '').trim()
    try {
      if (editingId) {
        const list = await window.api.upsertNote(coursePath, {
          id: editingId,
          body,
          bodyHtml: null,
          bodyJson: null
        })
        setAnnotations(list)
      } else if (noteScope === 'moment') {
        if (!selectedLesson || panelMode !== 'lesson') {
          toast.error('Selecciona una lección para anotar el video')
          return
        }
        if (!body) {
          toast.error('Escribe algo o usa “Solo pin”')
          return
        }
        const list = await window.api.upsertNote(coursePath, {
          body,
          bodyHtml: null,
          bodyJson: null,
          lessonRelativePath: selectedLesson.relativePath,
          lessonTitle: selectedLesson.title,
          timeSec: playerRef.current?.getCurrentTime?.() ?? currentTimeSec
        })
        setAnnotations(list)
      } else if (noteScope === 'file') {
        if (!activeTarget) {
          toast.error('Selecciona un archivo o proyecto para anotar')
          return
        }
        if (!body) {
          toast.error(
            activeTarget.kind === 'project'
              ? 'Escribe la nota del proyecto'
              : 'Escribe la nota del archivo'
          )
          return
        }
        const list =
          activeTarget.kind === 'project'
            ? await window.api.upsertNote(coursePath, {
                body,
                bodyHtml: null,
                bodyJson: null,
                projectId: activeTarget.projectId,
                projectTitle: activeTarget.title,
                timeSec: null
              })
            : await window.api.upsertNote(coursePath, {
                body,
                bodyHtml: null,
                bodyJson: null,
                lessonRelativePath: activeTarget.path,
                lessonTitle: activeTarget.title,
                timeSec: null
              })
        setAnnotations(list)
      } else {
        if (!body) {
          toast.error('Escribe la nota del curso')
          return
        }
        const list = await window.api.upsertNote(coursePath, {
          body,
          bodyHtml: null,
          bodyJson: null,
          lessonRelativePath: null,
          lessonTitle: null,
          projectId: null,
          projectTitle: null,
          timeSec: null
        })
        setAnnotations(list)
      }
      clearDraft()
      toast.success('Anotación guardada')
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar')
    }
  }

  const focusMomentNote = () => {
    setShowCourseAnnotations(false)
    setStudyOpen(true)
    setEditingId(null)
    if (panelMode === 'project' && selectedProject) {
      setNoteScope('file')
      toast('Escribe y pulsa Guardar — se guarda en este proyecto')
      return
    }
    if (panelMode === 'resource' && selectedResource) {
      setNoteScope('file')
      toast('Escribe y pulsa Guardar — se guarda en este archivo')
      return
    }
    setNoteScope('moment')
    toast('Escribe y pulsa Guardar — se guarda en el tiempo actual')
  }

  const quickPin = () => {
    if (!selectedLesson) {
      toast.error('Selecciona una lección primero')
      return
    }
    setShowCourseAnnotations(false)
    setStudyOpen(true)
    setPanelMode('lesson')
    const timeSec = playerRef.current?.getCurrentTime?.() ?? currentTimeSec
    window.api
      .upsertNote(coursePath, {
        body: '',
        lessonRelativePath: selectedLesson.relativePath,
        lessonTitle: selectedLesson.title,
        timeSec
      })
      .then((list) => {
        setAnnotations(list)
        const created = list.find(
          (n) =>
            n.lessonRelativePath === selectedLesson.relativePath &&
            typeof n.timeSec === 'number' &&
            Math.abs(n.timeSec - timeSec) < 0.75 &&
            !n.body
        )
        if (created) {
          setEditingId(created.id)
          setDraft({ text: '', markdown: '', json: null })
          setEditorKey((k) => k + 1)
          setNoteScope('moment')
        }
        toast.success('Pin creado — puedes añadir texto')
      })
      .catch((err) => toast.error(err.message || 'Error'))
  }

  const timelineMarks = useMemo(() => {
    const marks = []
    for (const note of annotations) {
      const anchors = (note.anchors || []).filter(
        (anchor) => typeof anchor.timeSec === 'number' && anchor.lessonRelativePath
      )
      const source = anchors.length
        ? anchors
        : typeof note.timeSec === 'number' && note.lessonRelativePath
          ? [note]
          : []
      for (const anchor of source) {
        marks.push({
          id: `${note.id}:${anchor.lessonRelativePath}:${anchor.timeSec}`,
          kind: 'annotation',
          lessonRelativePath: anchor.lessonRelativePath,
          timeSec: anchor.timeSec,
          title: note.title || note.body || 'Pin',
          color: note.color || 'coral'
        })
      }
    }
    return marks
  }, [annotations])

  const goPrev = () => {
    if (selectedIndex > 0) {
      setSelectedPath(flatLessons[selectedIndex - 1].relativePath)
      setSelectedResourcePath(null)
      setSelectedProjectId(null)
      setCreatingProject(false)
      setPanelMode('lesson')
    }
  }

  const goNext = () => {
    if (selectedIndex >= 0 && selectedIndex < flatLessons.length - 1) {
      setSelectedPath(flatLessons[selectedIndex + 1].relativePath)
      setSelectedResourcePath(null)
      setSelectedProjectId(null)
      setCreatingProject(false)
      setPanelMode('lesson')
    }
  }

  const handleOpenExplorer = async () => {
    try {
      if (onOpenExplorer) {
        await onOpenExplorer(course)
      } else {
        await window.api.openCourseFolder(coursePath)
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir la carpeta')
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Lexical uses contenteditable DIVs — never steal keys while typing notes
      if (t?.isContentEditable || t?.closest?.('[contenteditable="true"], .note-editor')) return
      if (showCourseAnnotations) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowCourseAnnotations(false)
        }
        return
      }
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return
        e.preventDefault()
        if (studyOpen) {
          setStudyOpen(false)
        } else {
          onBack?.()
        }
      } else if (e.key === '[') {
        e.preventDefault()
        goPrev()
      } else if (e.key === ']') {
        e.preventDefault()
        goNext()
      } else if (e.key.toLowerCase() === 'm' && selectedLesson) {
        e.preventDefault()
        toggleLessonComplete(selectedLesson, !selectedCompleted)
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        focusMomentNote()
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        quickPin()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedIndex,
    flatLessons,
    onBack,
    selectedLesson,
    selectedCompleted,
    noteScope,
    studyOpen,
    showCourseAnnotations
  ])

  const emptyContent =
    !loading &&
    tree &&
    tree.summary?.playableCount === 0 &&
    (tree.summary?.resourceCount || 0) === 0 &&
    projects.length === 0 &&
    !creatingProject
  const percent = progress?.percent ?? 0

  return (
    <div className="course-room">
      <header className="course-room__header">
        <button type="button" className="icon-btn icon-btn--ghost" onClick={onBack}>
          ← Biblioteca
        </button>
        <div className="course-room__heading">
          <h1 title={course.title}>{course.title}</h1>
          {course.institution ? <span>{course.institution}</span> : null}
        </div>
        <div className="course-room__actions">
          {progress ? (
            <span
              className="count-badge"
              title={`${progress.completedCount}/${progress.playableCount}`}
            >
              {percent}% · {progress.completedCount}/{progress.playableCount || '—'}
            </span>
          ) : null}
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={() => {
              setStudyOpen(false)
              setShowCourseAnnotations(true)
            }}
            title="Todas las anotaciones del curso"
          >
            Anotaciones
            {annotations.length ? ` (${annotations.length})` : ''}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            onClick={() => load(true)}
            disabled={loading}
          >
            Rescanear
          </button>
          <button type="button" className="icon-btn icon-btn--ghost" onClick={handleOpenExplorer}>
            Abrir en explorador
          </button>
        </div>
      </header>

      {progress && progress.playableCount > 0 ? (
        <div className="course-room__progress" aria-hidden="true">
          <div className="course-room__progress-bar" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      {loading && !tree ? (
        <div className="loader-container">
          <Loader />
        </div>
      ) : error ? (
        <div className="course-room__empty">
          <h2>No se pudo abrir el curso</h2>
          <p>{error}</p>
          <button type="button" className="icon-btn" onClick={handleOpenExplorer}>
            Abrir en explorador
          </button>
        </div>
      ) : emptyContent ? (
        <div className="course-room__empty">
          <h2>Carpeta vacía</h2>
          <p>
            No hay lecciones ni recursos que mostrar. Puedes vincular un proyecto o abrir el
            explorador.
          </p>
          <div className="course-room__empty-actions">
            <button type="button" className="icon-btn" onClick={handleAddProject}>
              + Proyecto
            </button>
            <button type="button" className="icon-btn icon-btn--ghost" onClick={handleOpenExplorer}>
              Abrir en explorador
            </button>
          </div>
        </div>
      ) : showCourseAnnotations ? (
        <CourseAnnotationsView
          coursePath={coursePath}
          courseTitle={course.title}
          annotations={annotations}
          currentTargetPath={activeTarget?.path}
          currentTargetTitle={activeTarget?.title}
          currentProjectId={activeTarget?.projectId || null}
          onBack={() => setShowCourseAnnotations(false)}
          onChange={setAnnotations}
          onOpenPopOut={() => {
            window.api.openAnnotationsWindow({ coursePath }).catch((err) => {
              toast.error(err.message || 'No se pudo abrir la ventana')
            })
          }}
          onJump={(item) => {
            setShowCourseAnnotations(false)
            setStudyOpen(false)
            jumpTo(item)
          }}
        />
      ) : (
        <div
          className={`course-room__body course-room__body--study${
            studyOpen ? '' : ' course-room__body--study-collapsed'
          }`}
        >
          <aside className="course-room__sidebar">
            <LessonTree
              sections={tree?.sections || []}
              courseResources={tree?.courseResources || []}
              projects={projects}
              selectedPath={treeHighlightPath}
              selectedProjectId={creatingProject ? null : selectedProjectId}
              onSelectLesson={handleSelectLesson}
              onSelectResource={handleSelectResource}
              onSelectProject={handleSelectProject}
              onAddProject={handleAddProject}
              onToggleLessonComplete={toggleLessonComplete}
              progressByLesson={progress?.lessons || {}}
            />
          </aside>
          <main className="course-room__main">
            {panelMode === 'project' ? (
              <ProjectPanel
                coursePath={coursePath}
                project={creatingProject ? projectDraft : selectedProject}
                sections={tree?.sections || []}
                onSaved={handleProjectsSaved}
                onDeleted={handleProjectDeleted}
                onCancelCreate={() => {
                  setCreatingProject(false)
                  setProjectDraft(null)
                  if (selectedProjectId) setPanelMode('project')
                  else if (selectedPath) setPanelMode('lesson')
                  else if (selectedResourcePath) setPanelMode('resource')
                  else setPanelMode('lesson')
                }}
              />
            ) : panelMode === 'resource' ? (
              <ResourceViewer coursePath={coursePath} resource={selectedResource} />
            ) : (
              <LessonPlayer
                ref={playerRef}
                coursePath={coursePath}
                lesson={selectedLesson}
                initialPositionSec={initialPositionSec}
                isCompleted={selectedCompleted}
                timelineMarks={timelineMarks}
                onTimeTick={setCurrentTimeSec}
                onMarkClick={(mark) => {
                  setStudyOpen(true)
                  jumpTo(mark)
                }}
                onProgress={handleProgress}
                onToggleComplete={(completed) =>
                  selectedLesson && toggleLessonComplete(selectedLesson, completed)
                }
                onPrev={goPrev}
                onNext={goNext}
                hasPrev={selectedIndex > 0}
                hasNext={selectedIndex >= 0 && selectedIndex < flatLessons.length - 1}
                onEnded={() => {
                  if (selectedIndex >= 0 && selectedIndex < flatLessons.length - 1) {
                    goNext()
                  }
                }}
              />
            )}
          </main>
          <StudySidePanel
            expanded={studyOpen}
            annotations={annotations}
            draft={draft}
            editorKey={`note-${editorKey}-${editingId || 'new'}`}
            onDraftChange={handleDraftChange}
            noteScope={noteScope}
            onNoteScopeChange={setNoteScope}
            currentTimeSec={currentTimeSec}
            onSeekTimestamp={handleSeekTimestamp}
            enableTimestamp={Boolean(selectedLesson) && panelMode === 'lesson'}
            mentionItems={mentionItems}
            onCreateTopic={async (title) => {
              const saved = await window.api.upsertTopic({ title })
              setTopics((await window.api.listTopics()) || [])
              return saved
            }}
            onSave={saveNote}
            editingId={editingId}
            onCancelEdit={clearDraft}
            onEdit={(item) => {
              setStudyOpen(true)
              loadDraftForEdit(item)
            }}
            onDelete={async (id) => {
              try {
                setAnnotations(await window.api.deleteNote(coursePath, id))
              } catch (err) {
                toast.error(err.message || 'Error')
              }
            }}
            onQuickPin={quickPin}
            onJump={jumpTo}
            onExpand={() => setStudyOpen(true)}
            onCollapse={() => setStudyOpen(false)}
            onOpenFullPage={() => {
              setStudyOpen(false)
              setShowCourseAnnotations(true)
            }}
            onOpenPopOut={() => {
              window.api.openAnnotationsWindow({ coursePath }).catch((err) => {
                toast.error(err.message || 'No se pudo abrir la ventana')
              })
            }}
            currentTargetPath={activeTarget?.path}
            currentTargetTitle={activeTarget?.title}
            currentProjectId={activeTarget?.projectId || null}
            hasLesson={Boolean(selectedLesson) && panelMode === 'lesson'}
            hasTarget={Boolean(activeTarget)}
            targetKind={activeTarget?.kind || null}
          />
        </div>
      )}
    </div>
  )
}

export default CourseRoom
