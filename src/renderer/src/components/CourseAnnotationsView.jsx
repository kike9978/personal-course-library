import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import AnnotationsWorkspace from './AnnotationsWorkspace'

/**
 * Full-page annotations for one course (table + document).
 */
function CourseAnnotationsView({
  coursePath,
  courseTitle,
  annotations = [],
  onBack,
  onJump,
  onChange,
  onOpenPopOut,
  currentTargetPath,
  currentTargetTitle,
  currentProjectId,
  courses = []
}) {
  const courseTitleByPath = useMemo(() => {
    const map = {}
    for (const item of courses) {
      if (item?.path && item.title) map[item.path] = item.title
    }
    if (coursePath && courseTitle) map[coursePath] = courseTitle
    return map
  }, [courses, coursePath, courseTitle])
  const [selectedId, setSelectedId] = useState(null)
  const [topics, setTopics] = useState([])
  const [corpus, setCorpus] = useState(annotations)

  useEffect(() => {
    let cancelled = false
    Promise.all([window.api.listTopics(), window.api.listAllNotes()])
      .then(([topicList, allNotes]) => {
        if (cancelled) return
        setTopics(topicList || [])
        setCorpus(allNotes || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [annotations])

  useEffect(() => {
    if (!annotations.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !annotations.some((a) => a.id === selectedId)) {
      const prefer =
        (currentProjectId && annotations.find((a) => a.projectId === currentProjectId)) ||
        (currentTargetPath &&
          annotations.find((a) => a.lessonRelativePath === currentTargetPath)) ||
        annotations[0]
      setSelectedId(prefer?.id || null)
    }
  }, [annotations, selectedId, currentTargetPath, currentProjectId])

  const handleCreate = async () => {
    try {
      const payload = currentProjectId
        ? {
            body: '',
            bodyHtml: null,
            bodyJson: null,
            projectId: currentProjectId,
            projectTitle: currentTargetTitle || null,
            timeSec: null
          }
        : {
            body: '',
            bodyHtml: null,
            bodyJson: null,
            lessonRelativePath: currentTargetPath || null,
            lessonTitle: currentTargetPath ? currentTargetTitle || null : null,
            timeSec: null
          }
      const list = await window.api.upsertNote(coursePath, payload)
      onChange?.(list)
      const created = list[list.length - 1]
      if (created) setSelectedId(created.id)
      toast.success(
        currentProjectId
          ? 'Anotación creada en este proyecto'
          : currentTargetPath
            ? 'Anotación creada en este archivo'
            : 'Anotación creada'
      )
    } catch (err) {
      toast.error(err.message || 'No se pudo crear')
    }
  }

  const handleSave = async (item, payload) => {
    const list = await window.api.upsertNote(coursePath, {
      id: item.id,
      ...payload
    })
    onChange?.(list)
  }

  const handleDelete = async (item) => {
    if (!window.confirm('¿Borrar esta anotación?')) return
    try {
      const list = await window.api.deleteNote(coursePath, item.id)
      onChange?.(list)
      setSelectedId(null)
      toast.success('Eliminada')
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }

  return (
    <AnnotationsWorkspace
      title="Anotaciones"
      subtitle={courseTitle}
      annotations={annotations}
      selectedId={selectedId}
      onSelect={(item) => setSelectedId(item.id)}
      onBack={onBack}
      onCreate={handleCreate}
      onSave={handleSave}
      onDelete={handleDelete}
      onJump={onJump}
      onOpenPopOut={onOpenPopOut}
      preferGroupPath={currentTargetPath || null}
      preferGroupProjectId={currentProjectId || null}
      topics={topics}
      corpus={corpus}
      courseTitleByPath={courseTitleByPath}
      onUpsertTopic={async (topic) => {
        const saved = await window.api.upsertTopic(topic)
        setTopics(await window.api.listTopics())
        return saved
      }}
    />
  )
}

export default CourseAnnotationsView
