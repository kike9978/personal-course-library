import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

function CourseEditModal({ path, courseTitle, programsList, onCourseUpdated, onClose }) {
  const dialogRef = useRef(null)
  const [instructor, setInstructor] = useState('')
  const [institution, setInstitution] = useState('')
  const [localCourseTitle, setLocalCourseTitle] = useState('')
  const [localProgramsList, setLocalProgramsList] = useState([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Set local state from props
    setLocalCourseTitle(courseTitle || '')
    setLocalProgramsList(programsList || [])

    // Load additional data if path exists
    if (path) {
      try {
        const courseData = window.readJSON(path)
        setInstructor(courseData.instructor || '')
        setInstitution(courseData.institution || '')
      } catch (err) {
        console.error('Error loading course data:', err)
        toast.error('Error loading course data')
      }
    }

    // Show the modal
    if (dialogRef.current) {
      dialogRef.current.showModal()
    }
  }, [path, courseTitle, programsList])

  const handleClose = () => {
    if (dialogRef.current) {
      dialogRef.current.close()
    }
    if (onClose) {
      onClose()
    }
  }

  const updateCourseProperty = async (property, value) => {
    try {
      if (!window.electron || !window.electron.ipcRenderer) {
        throw new Error('IPC not available')
      }

      const result = await window.electron.ipcRenderer.invoke('write-course-property', {
        coursePath: path,
        property,
        value
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update property')
      }

      return true
    } catch (err) {
      console.error(`Error updating ${property}:`, err)
      throw err
    }
  }

  const handleSaveAll = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      // Prepare programs array
      const programsArray =
        typeof localProgramsList === 'string'
          ? localProgramsList
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p)
          : localProgramsList

      // Update all properties
      await updateCourseProperty('title', localCourseTitle)
      await updateCourseProperty('programs', programsArray)
      await updateCourseProperty('instructor', instructor)
      await updateCourseProperty('institution', institution)

      // Show success toast
      toast.success('Course details updated successfully!')

      // Notify parent component that course was updated
      if (onCourseUpdated) {
        onCourseUpdated(path, {
          title: localCourseTitle,
          programs: programsArray,
          instructor,
          institution
        })
      }

      // Close the modal
      handleClose()
    } catch (err) {
      console.error('Error saving course details:', err)
      toast.error('Failed to update course details')
    } finally {
      setIsSaving(false)
    }
  }


  return (
    <dialog ref={dialogRef} className="dialog bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
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
            onClick={handleClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
          >
            Cancelar
          </button>
          <button
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
