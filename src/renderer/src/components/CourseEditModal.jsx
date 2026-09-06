import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

function CourseEditModal({ course, onCourseUpdated, onClose }) {
  const dialogRef = useRef(null)
  const [instructor, setInstructor] = useState(course.instructor || '')
  const [institution, setInstitution] = useState(course.institution || '')
  const [localCourseTitle, setLocalCourseTitle] = useState(course.title || '')
  const [localProgramsList, setLocalProgramsList] = useState(course.programs || [])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setLocalCourseTitle(course.title || '')
    setLocalProgramsList(course.programs || [])
    setInstructor(course.instructor || '')
    setInstitution(course.institution || '')

    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal()
    }
  }, [course])

  const handleClose = () => {
    if (dialogRef.current) {
      dialogRef.current.close()
    }
    if (onClose) onClose()
  }

  const handleSaveAll = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      const programsArray =
        typeof localProgramsList === 'string'
          ? localProgramsList
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : localProgramsList

      const updates = {
        title: localCourseTitle,
        programs: programsArray,
        instructor,
        institution
      }

      const result = await window.api.updateCourse(course.path, updates)
      if (!result.success) {
        throw new Error(result.error || 'Failed to update course')
      }

      toast.success('Course details updated successfully!')
      if (onCourseUpdated) {
        onCourseUpdated(course.path, result.data)
      }
      handleClose()
    } catch (err) {
      console.error('Error saving course details:', err)
      toast.error(err.message || 'Failed to update course details')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog bg-white p-6 rounded-lg shadow-xl max-w-md w-full"
      onClose={onClose}
    >
      <h3 className="text-xl font-bold mb-4 text-gray-800">Editar propiedades de curso</h3>

      <div className="space-y-4">
        <label className="block">
          <span className="text-gray-700">Nombre de curso:</span>
          <textarea
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={localCourseTitle}
            onChange={(e) => setLocalCourseTitle(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-gray-700">Programas:</span>
          <input
            type="text"
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={
              Array.isArray(localProgramsList) ? localProgramsList.join(', ') : localProgramsList
            }
            onChange={(e) => setLocalProgramsList(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-gray-700">Instructor:</span>
          <input
            type="text"
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-gray-700">Academia:</span>
          <input
            type="text"
            className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </label>

        <div className="flex justify-end space-x-2 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default CourseEditModal
