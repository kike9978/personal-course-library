import { useEffect, useState } from 'react'
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
  currentLessonPath,
  currentLessonTitle
}) {
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!annotations.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !annotations.some((a) => a.id === selectedId)) {
      const prefer =
        (currentLessonPath &&
          annotations.find((a) => a.lessonRelativePath === currentLessonPath)) ||
        annotations[0]
      setSelectedId(prefer?.id || null)
    }
  }, [annotations, selectedId, currentLessonPath])

  const handleCreate = async () => {
    try {
      const list = await window.api.upsertNote(coursePath, {
        body: '',
        bodyHtml: null,
        bodyJson: null,
        lessonRelativePath: currentLessonPath || null,
        lessonTitle: currentLessonPath ? currentLessonTitle || null : null,
        timeSec: null
      })
      onChange?.(list)
      const created = list[list.length - 1]
      if (created) setSelectedId(created.id)
      toast.success('Anotación creada')
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
    />
  )
}

export default CourseAnnotationsView
