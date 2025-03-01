import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';

function CourseEditModal({
  path,
  courseTitle,
  onCourseTitleChange,
  programsList,
  onProgramsListChange,
  onCourseUpdated,
  onClose
}) {
  const dialogRef = useRef(null);
  const [instructor, setInstructor] = useState('');
  const [institution, setInstitution] = useState('');
  const [localCourseTitle, setLocalCourseTitle] = useState('');
  const [localProgramsList, setLocalProgramsList] = useState([]);
  
  useEffect(() => {
    // Log when the component receives new props
    console.log("CourseEditModal received props:", { path, courseTitle, programsList });
    
    // Set local state from props
    setLocalCourseTitle(courseTitle || '');
    setLocalProgramsList(programsList || []);
    
    // Load additional data if path exists
    if (path) {
      try {
        const courseData = window.readJSON(path);
        setInstructor(courseData.instructor || '');
        setInstitution(courseData.institution || '');
      } catch (err) {
        console.error("Failed to load course data:", err);
      }
    }
    
    // Ensure the dialog is properly initialized
    if (dialogRef.current && path) {
      try {
        console.log("Attempting to show modal dialog");
        dialogRef.current.showModal();
        console.log("Modal dialog shown successfully");
      } catch (err) {
        console.error("Failed to show modal:", err);
      }
    }
  }, [path, courseTitle, programsList]);
  
  const handleClose = () => {
    if (dialogRef.current) {
      dialogRef.current.close();
    }
    if (onClose) {
      onClose();
    }
  };
  
  const updateCourseProperty = (property, value) => {
    try {
      if (!path) {
        console.error('Missing path');
        return false;
      }
      
      // Read current data
      const courseData = window.readJSON(path);
      
      // Update the property
      courseData[property] = value;
      
      // Write back to file
      const filePath = `${path}/courseProps.json`;
      const jsonString = JSON.stringify(courseData, null, 2);
      const success = window.fileSystem.writeFile(filePath, jsonString);
      
      if (!success) {
        console.error(`Failed to write to file: ${filePath}`);
        return false;
      }
      
      console.log(`Successfully updated ${property} to:`, value);
      return true;
    } catch (err) {
      console.error(`Failed to update ${property}:`, err);
      return false;
    }
  };
  
  const handleSaveAll = () => {
    try {
      // Prepare programs array
      const programsArray = typeof localProgramsList === 'string' 
        ? localProgramsList.split(',').map(p => p.trim()).filter(p => p) 
        : localProgramsList;
      
      // Update all properties
      const titleUpdated = updateCourseProperty('title', localCourseTitle);
      const programsUpdated = updateCourseProperty('programs', programsArray);
      const instructorUpdated = updateCourseProperty('instructor', instructor);
      const institutionUpdated = updateCourseProperty('institution', institution);
      
      if (titleUpdated || programsUpdated || instructorUpdated || institutionUpdated) {
        // Show success toast
        toast.success('Course details updated successfully!');
        
        // Notify parent component that course was updated
        if (onCourseUpdated) {
          onCourseUpdated(path, {
            title: localCourseTitle,
            programs: programsArray,
            instructor,
            institution
          });
        }
        
        // Close the modal
        handleClose();
        return true;
      } else {
        toast.error('Failed to update course details');
        return false;
      }
    } catch (err) {
      console.error('Error saving course details:', err);
      toast.error(`Error: ${err.message}`);
      return false;
    }
  };
  
  return (
    <dialog ref={dialogRef} className="dialog bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Editar propiedades de curso</h3>
      
      <div className="space-y-4">
        <label className="block">
          <span className="text-gray-700">Nombre de curso:</span>
          <textarea
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={localCourseTitle}
            onChange={(e) => setLocalCourseTitle(e.target.value)}
          />
        </label>
        
        <label className="block">
          <span className="text-gray-700">Programas:</span>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={Array.isArray(localProgramsList) ? localProgramsList.join(', ') : localProgramsList}
            onChange={(e) => setLocalProgramsList(e.target.value)}
          />
        </label>
        
        <label className="block">
          <span className="text-gray-700">Instructor:</span>
          <input 
            type="text" 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={instructor} 
            onChange={(e) => setInstructor(e.target.value)}
          />
        </label>
        
        <label className="block">
          <span className="text-gray-700">Academia:</span>
          <input 
            type="text" 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={institution} 
            onChange={(e) => setInstitution(e.target.value)}
          />
        </label>
        
        <div className="flex justify-between pt-4">
          <button 
            onClick={handleSaveAll}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
          >
            Guardar Todo
          </button>
          <button 
            onClick={handleClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default CourseEditModal;
