import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import path from 'path';

function CourseEditModal({
  path,
  courseTitle,
  programsList,
  onCourseUpdated,
  onClose
}) {
  const dialogRef = useRef(null);
  const [instructor, setInstructor] = useState('');
  const [institution, setInstitution] = useState('');
  const [localCourseTitle, setLocalCourseTitle] = useState('');
  const [localProgramsList, setLocalProgramsList] = useState([]);
  const [debug, setDebug] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  
  useEffect(() => {
    // Log when the component receives new props
    setDebug(prev => prev + `\nReceived props: path=${path}, title=${courseTitle}`);
    
    // Set local state from props
    setLocalCourseTitle(courseTitle || '');
    setLocalProgramsList(programsList || []);
    
    // Load additional data if path exists
    if (path) {
      try {
        const courseData = window.readJSON(path);
        setInstructor(courseData.instructor || '');
        setInstitution(courseData.institution || '');
        
        // Debug info
        setDebug(prev => prev + `\nLoaded data: ${JSON.stringify(courseData, null, 2)}`);
      } catch (err) {
        setDebug(prev => prev + `\nError loading data: ${err.message}`);
      }
    }
    
    // Ensure the dialog is properly initialized
    if (dialogRef.current && path) {
      try {
        dialogRef.current.showModal();
        setDebug(prev => prev + `\nDialog opened successfully`);
      } catch (err) {
        setDebug(prev => prev + `\nFailed to show dialog: ${err.message}`);
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
  
  const updatePropertyViaIPC = async (property, value) => {
    try {
      setSaveStatus(prev => prev + `\nTrying IPC approach for ${property}...`);
      
      if (!window.electron || !window.electron.ipcRenderer) {
        setSaveStatus(prev => prev + `\nIPC renderer not available`);
        return false;
      }
      
      // Check if path is absolute or relative
      const isAbsolute = path.startsWith('/') || /^[A-Z]:\\/.test(path);
      setSaveStatus(prev => prev + `\nPath is ${isAbsolute ? 'absolute' : 'relative'}: ${path}`);
      
      // Get the base path if available
      let basePath = '';
      if (window.fileSystem && window.fileSystem.basePath) {
        basePath = window.fileSystem.basePath;
        setSaveStatus(prev => prev + `\nBase path: ${basePath}`);
      }
      
      // Try to construct a full path for debugging
      let fullPath = path;
      if (!isAbsolute && window.fileSystem && window.fileSystem.joinPath) {
        fullPath = window.fileSystem.joinPath(basePath, path);
        setSaveStatus(prev => prev + `\nConstructed full path: ${fullPath}`);
      }
      
      const result = await window.electron.ipcRenderer.invoke('write-course-property', {
        coursePath: path,
        property,
        value
      });
      
      setSaveStatus(prev => prev + `\nIPC result: ${JSON.stringify(result)}`);
      return result.success;
    } catch (err) {
      setSaveStatus(prev => prev + `\nError with IPC approach: ${err.message}`);
      return false;
    }
  };
  
  const updatePropertyDirectly = (property, value) => {
    try {
      setSaveStatus(prev => prev + `\nTrying direct file system approach for ${property}...`);
      
      if (!window.fileSystem) {
        setSaveStatus(prev => prev + `\nFile system not available`);
        return false;
      }
      
      // Try to get the full path to the courseProps.json file
      let propsFilePath;
      if (path.endsWith('courseProps.json')) {
        propsFilePath = path;
      } else {
        propsFilePath = `${path}/courseProps.json`;
      }
      
      setSaveStatus(prev => prev + `\nProps file path: ${propsFilePath}`);
      
      // Try to read the file directly
      let data;
      try {
        const fileContent = window.fileSystem.readJSON(path);
        setSaveStatus(prev => prev + `\nSuccessfully read file content`);
        data = fileContent;
      } catch (readErr) {
        setSaveStatus(prev => prev + `\nError reading file: ${readErr.message}`);
        return false;
      }
      
      // Update the property
      data[property] = value;
      
      // Write back to the file
      const jsonString = JSON.stringify(data, null, 2);
      const success = window.fileSystem.writeFile(propsFilePath, jsonString);
      
      setSaveStatus(prev => prev + `\nDirect file system write result: ${success}`);
      return success;
    } catch (err) {
      setSaveStatus(prev => prev + `\nError with direct file system approach: ${err.message}`);
      return false;
    }
  };
  
  const writeDirectlyToCourseProps = (property, value) => {
    try {
      setSaveStatus(prev => prev + `\nTrying direct write to course props...`);
      
      // First, get the base path
      const basePath = window.fileSystem?.basePath || '';
      setSaveStatus(prev => prev + `\nBase path: ${basePath}`);
      
      // Construct the full path to the course directory
      const fullCoursePath = `${basePath}/${path}`;
      setSaveStatus(prev => prev + `\nFull course path: ${fullCoursePath}`);
      
      // Construct the path to the courseProps.json file
      const propsFilePath = `${fullCoursePath}/courseProps.json`;
      setSaveStatus(prev => prev + `\nProps file path: ${propsFilePath}`);
      
      // Check if we can read the file
      try {
        // Read the current data using the full path
        const courseData = window.readJSON(path);
        setSaveStatus(prev => prev + `\nSuccessfully read course data`);
        
        // Update the property
        courseData[property] = value;
        
        // Try to write the file using the full path
        const jsonString = JSON.stringify(courseData, null, 2);
        
        // Try using the window.fileSystem.writeFile method
        if (window.fileSystem && typeof window.fileSystem.writeFile === 'function') {
          const success = window.fileSystem.writeFile(propsFilePath, jsonString);
          setSaveStatus(prev => prev + `\nDirect write result: ${success}`);
          
          if (success) {
            return true;
          }
        }
        
        // Try using the window.updateCourseProgramsList method as a fallback
        if (window.updateCourseProgramsList && property === 'programs') {
          try {
            window.updateCourseProgramsList(propsFilePath, value);
            setSaveStatus(prev => prev + `\nUsed updateCourseProgramsList as fallback`);
            return true;
          } catch (updateErr) {
            setSaveStatus(prev => prev + `\nError with updateCourseProgramsList: ${updateErr.message}`);
          }
        }
        
        return false;
      } catch (readErr) {
        setSaveStatus(prev => prev + `\nError reading course data: ${readErr.message}`);
        return false;
      }
    } catch (err) {
      setSaveStatus(prev => prev + `\nError in direct write: ${err.message}`);
      return false;
    }
  };
  
  const updateCourseProperty = async (property, value) => {
    // Try the direct write method first
    const directWriteResult = writeDirectlyToCourseProps(property, value);
    if (directWriteResult) {
      return true;
    }
    
    // Try the IPC approach
    const ipcResult = await updatePropertyViaIPC(property, value);
    if (ipcResult) {
      return true;
    }
    
    // Try the direct file system approach
    const directResult = updatePropertyDirectly(property, value);
    if (directResult) {
      return true;
    }
    
    // Fall back to the existing methods if all approaches fail
    try {
      setSaveStatus(prev => prev + `\nUpdating ${property}...`);
      
      if (!path) {
        setSaveStatus(prev => prev + `\nError: Missing path`);
        return false;
      }
      
      // Try the direct updateCourseProperty method first if available
      if (window.fileSystem && typeof window.fileSystem.updateCourseProperty === 'function') {
        try {
          const success = window.fileSystem.updateCourseProperty(path, property, value);
          setSaveStatus(prev => prev + `\nDirect updateCourseProperty result: ${success}`);
          return success;
        } catch (directUpdateErr) {
          setSaveStatus(prev => prev + `\nError with direct updateCourseProperty: ${directUpdateErr.message}`);
        }
      }
      
      // Read current data directly from the file
      let courseData;
      try {
        courseData = window.readJSON(path);
        setSaveStatus(prev => prev + `\nRead course data: ${JSON.stringify(courseData, null, 2).substring(0, 100)}...`);
      } catch (readErr) {
        setSaveStatus(prev => prev + `\nError reading course data: ${readErr.message}`);
        return false;
      }
      
      // Update the property
      courseData[property] = value;
      setSaveStatus(prev => prev + `\nUpdated ${property} in memory`);
      
      // Write back to file - IMPORTANT: Make sure the path is correct
      try {
        // Try to determine the correct file path
        let filePath;
        
        // Check if path already includes courseProps.json
        if (path.endsWith('courseProps.json')) {
          filePath = path;
        } else {
          // Otherwise, append it
          filePath = `${path}/courseProps.json`;
        }
        
        setSaveStatus(prev => prev + `\nWriting to file: ${filePath}`);
        
        const jsonString = JSON.stringify(courseData, null, 2);
        
        // Try different methods to write the file
        let success = false;
        
        // Method 1: Try using fs directly if available
        if (window.fs && typeof window.fs.writeFileSync === 'function') {
          try {
            window.fs.writeFileSync(filePath, jsonString, 'utf8');
            setSaveStatus(prev => prev + `\nFile written successfully using fs.writeFileSync`);
            success = true;
          } catch (fsErr) {
            setSaveStatus(prev => prev + `\nError with fs.writeFileSync: ${fsErr.message}`);
          }
        }
        
        // Method 2: Fall back to window.fileSystem.writeFile
        if (!success && window.fileSystem && typeof window.fileSystem.writeFile === 'function') {
          try {
            success = window.fileSystem.writeFile(filePath, jsonString);
            setSaveStatus(prev => prev + `\nfileSystem.writeFile result: ${success}`);
          } catch (writeErr) {
            setSaveStatus(prev => prev + `\nError with fileSystem.writeFile: ${writeErr.message}`);
          }
        }
        
        // Method 3: Try window.writeFile directly
        if (!success && window.writeFile && typeof window.writeFile === 'function') {
          try {
            success = window.writeFile(filePath, jsonString);
            setSaveStatus(prev => prev + `\nwindow.writeFile result: ${success}`);
          } catch (directWriteErr) {
            setSaveStatus(prev => prev + `\nError with window.writeFile: ${directWriteErr.message}`);
          }
        }
        
        if (!success) {
          setSaveStatus(prev => prev + `\nFAILED: No suitable file writing method found or all methods failed`);
          return false;
        }
        
        setSaveStatus(prev => prev + `\nSUCCESS: ${property} updated successfully`);
        return true;
      } catch (writeErr) {
        setSaveStatus(prev => prev + `\nError writing file: ${writeErr.message}`);
        return false;
      }
    } catch (err) {
      setSaveStatus(prev => prev + `\nUnexpected error: ${err.message}`);
      return false;
    }
  };
  
  const tryAlternativeFileWrite = (filePath, jsonString) => {
    try {
      setSaveStatus(prev => prev + `\nTrying alternative file write approach...`);
      
      // Try using the window.writeFile function from preload
      if (window.writeFile) {
        const success = window.writeFile(filePath, jsonString);
        setSaveStatus(prev => prev + `\nAlternative writeFile result: ${success}`);
        return success;
      }
      
      // Try using the electron API directly if available
      if (window.electron && window.electron.ipcRenderer) {
        setSaveStatus(prev => prev + `\nTrying IPC renderer...`);
        // Send a message to the main process to write the file
        const success = window.electron.ipcRenderer.sendSync('write-file', {
          path: filePath,
          content: jsonString
        });
        setSaveStatus(prev => prev + `\nIPC renderer result: ${success}`);
        return success;
      }
      
      return false;
    } catch (err) {
      setSaveStatus(prev => prev + `\nError in alternative file write: ${err.message}`);
      return false;
    }
  };
  
  const handleSaveAll = async () => {
    try {
      // Clear previous status
      setSaveStatus('Starting save operation...');
      
      // Prepare programs array
      const programsArray = typeof localProgramsList === 'string' 
        ? localProgramsList.split(',').map(p => p.trim()).filter(p => p) 
        : localProgramsList;
      
      setSaveStatus(prev => prev + `\nPrepared programs array: ${JSON.stringify(programsArray)}`);
      
      // Update all properties
      const titleUpdated = await updateCourseProperty('title', localCourseTitle);
      const programsUpdated = await updateCourseProperty('programs', programsArray);
      const instructorUpdated = await updateCourseProperty('instructor', instructor);
      const institutionUpdated = await updateCourseProperty('institution', institution);
      
      setSaveStatus(prev => prev + `\nUpdate results: title=${titleUpdated}, programs=${programsUpdated}, instructor=${instructorUpdated}, institution=${institutionUpdated}`);
      
      if (titleUpdated || programsUpdated || instructorUpdated || institutionUpdated) {
        // Show success toast
        toast.success('Course details updated successfully!');
        setSaveStatus(prev => prev + `\nSuccess toast shown`);
        
        // Notify parent component that course was updated
        if (onCourseUpdated) {
          onCourseUpdated(path, {
            title: localCourseTitle,
            programs: programsArray,
            instructor,
            institution
          });
          setSaveStatus(prev => prev + `\nParent component notified of update`);
        }
        
        // Close the modal
        setSaveStatus(prev => prev + `\nClosing modal...`);
        handleClose();
        return true;
      } else {
        setSaveStatus(prev => prev + `\nNo properties were successfully updated`);
        toast.error('Failed to update course details');
        return false;
      }
    } catch (err) {
      setSaveStatus(prev => prev + `\nError in handleSaveAll: ${err.message}`);
      toast.error(`Error: ${err.message}`);
      return false;
    }
  };
  
  const checkPath = () => {
    try {
      setSaveStatus(prev => prev + `\nChecking path: ${path}`);
      
      // Check if the path is absolute or relative
      const isAbsolute = path.startsWith('/') || /^[A-Z]:\\/.test(path);
      setSaveStatus(prev => prev + `\nPath is ${isAbsolute ? 'absolute' : 'relative'}`);
      
      // Try to resolve the full path
      if (window.fileSystem && window.fileSystem.joinPath) {
        const basePath = window.fileSystem.basePath || '';
        const fullPath = isAbsolute ? path : window.fileSystem.joinPath(basePath, path);
        setSaveStatus(prev => prev + `\nFull path: ${fullPath}`);
        
        // Check if courseProps.json exists
        const propsPath = window.fileSystem.joinPath(fullPath, 'courseProps.json');
        setSaveStatus(prev => prev + `\nProps file path: ${propsPath}`);
      }
      
      return true;
    } catch (err) {
      setSaveStatus(prev => prev + `\nError checking path: ${err.message}`);
      return false;
    }
  };
  
  // Add this function to test basic file writing
  const testFileWrite = () => {
    try {
      setSaveStatus(prev => prev + `\nTesting basic file write...`);
      
      // Get the base path
      const basePath = window.fileSystem?.basePath || '';
      setSaveStatus(prev => prev + `\nBase path: ${basePath}`);
      
      // Create a test file path
      const testFilePath = `${basePath}/test-write.txt`;
      setSaveStatus(prev => prev + `\nTest file path: ${testFilePath}`);
      
      // Try to write a simple file
      const content = `Test file created at ${new Date().toISOString()}`;
      
      if (window.fileSystem && typeof window.fileSystem.writeFile === 'function') {
        const success = window.fileSystem.writeFile(testFilePath, content);
        setSaveStatus(prev => prev + `\nTest file write result: ${success}`);
        return success;
      } else {
        setSaveStatus(prev => prev + `\nNo writeFile method available`);
        return false;
      }
    } catch (err) {
      setSaveStatus(prev => prev + `\nError in test file write: ${err.message}`);
      return false;
    }
  };
  
  // Add this function to try using updateCourseProgramsList
  const tryUpdateWithExistingMethod = () => {
    try {
      setSaveStatus(prev => prev + `\nTrying to update with existing methods...`);
      
      // Get the base path
      const basePath = window.fileSystem?.basePath || '';
      setSaveStatus(prev => prev + `\nBase path: ${basePath}`);
      
      // Construct the full path to the courseProps.json file
      const propsFilePath = `${basePath}/${path}/courseProps.json`;
      setSaveStatus(prev => prev + `\nProps file path: ${propsFilePath}`);
      
      // Try to update programs using the updateCourseProgramsList method
      if (window.updateCourseProgramsList) {
        try {
          const programsArray = typeof localProgramsList === 'string' 
            ? localProgramsList.split(',').map(p => p.trim()).filter(p => p) 
            : localProgramsList;
          
          window.updateCourseProgramsList(propsFilePath, programsArray);
          setSaveStatus(prev => prev + `\nUsed updateCourseProgramsList to update programs`);
          return true;
        } catch (updateErr) {
          setSaveStatus(prev => prev + `\nError with updateCourseProgramsList: ${updateErr.message}`);
        }
      } else {
        setSaveStatus(prev => prev + `\nupdateCourseProgramsList not available`);
      }
      
      return false;
    } catch (err) {
      setSaveStatus(prev => prev + `\nError in tryUpdateWithExistingMethod: ${err.message}`);
      return false;
    }
  };
  
  return (
    <dialog ref={dialogRef} className="dialog bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Editar propiedades de curso</h3>
      
      <div className="space-y-4 flex flex-col">
        <label className="flex flex-col">
          <span className="text-gray-700">Nombre de curso:</span>
          <textarea
            className="mt-1 flex flex-col w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={localCourseTitle}
            onChange={(e) => setLocalCourseTitle(e.target.value)}
          />
        </label>
        
        <label className="flex flex-col">
          <span className="text-gray-700">Programas:</span>
          <input
            type="text"
            className="mt-1 flex flex-col w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={Array.isArray(localProgramsList) ? localProgramsList.join(', ') : localProgramsList}
            onChange={(e) => setLocalProgramsList(e.target.value)}
          />
        </label>
        
        <label className="flex flex-col">
          <span className="text-gray-700">Instructor:</span>
          <input 
            type="text" 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
            value={instructor} 
            onChange={(e) => setInstructor(e.target.value)}
          />
        </label>
        
        <label className="flex flex-col">
          <span className="text-gray-700">Academia:</span>
          <input 
            type="text" 
            className="mt-1 flex flex-col w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2"
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
          <button 
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="px-4 py-2 bg-blue-300 text-blue-800 rounded hover:bg-blue-400"
          >
            {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
          </button>
          <button 
            onClick={checkPath}
            className="px-2 py-1 bg-gray-300 text-gray-800 rounded text-xs mt-2"
          >
            Check Path
          </button>
          <button 
            onClick={testFileWrite}
            className="px-2 py-1 bg-red-300 text-red-800 rounded text-xs mt-2 ml-2"
          >
            Test Write
          </button>
          <button 
            onClick={tryUpdateWithExistingMethod}
            className="px-2 py-1 bg-purple-300 text-purple-800 rounded text-xs mt-2 ml-2"
          >
            Try Existing Method
          </button>
        </div>
        
        {/* Enhanced debug panel */}
        {showDebugPanel && (
          <div className="mt-4 border border-gray-300 rounded p-2">
            <h4 className="font-bold text-sm">Debug Information</h4>
            <div className="text-xs mt-2">
              <div className="mb-2">
                <strong>Path:</strong> {path}
              </div>
              <div className="mb-2">
                <strong>Initial Data:</strong>
                <pre className="bg-gray-100 p-1 mt-1 max-h-20 overflow-auto">{debug}</pre>
              </div>
              <div>
                <strong>Save Status:</strong>
                <pre className="bg-gray-100 p-1 mt-1 max-h-40 overflow-auto">{saveStatus}</pre>
              </div>
              <div className="mt-2">
                <strong>Available Methods:</strong>
                <ul className="list-disc pl-5 mt-1">
                  <li>window.fs: {window.fs ? 'Available' : 'Not Available'}</li>
                  <li>window.fileSystem: {window.fileSystem ? 'Available' : 'Not Available'}</li>
                  <li>window.writeFile: {window.writeFile ? 'Available' : 'Not Available'}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

export default CourseEditModal;
