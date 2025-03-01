import { useState, useEffect } from 'react';
import FileBrowser from './FileBrowser';
import { toast } from 'react-hot-toast';

function CourseDetail({ coursePath, courseData, onBack }) {
  const [loading, setLoading] = useState(true);
  const [fullPath, setFullPath] = useState('');
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  useEffect(() => {
    const getFullPath = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Collect debug info
        const debug = {
          coursePath,
          courseData: JSON.stringify(courseData, null, 2),
          timestamp: new Date().toISOString(),
          windowFileSystem: window.fileSystem ? 'Available' : 'Not Available',
          windowPathUtils: window.pathUtils ? 'Available' : 'Not Available'
        };
        
        if (window.fileSystem) {
          debug.basePath = window.fileSystem.basePath;
        }
        
        setDebugInfo(debug);
        console.log('Debug info:', debug);
        
        // Use the IPC method to get the full path
        console.log('Requesting full course path for:', coursePath);
        const result = await window.ipcRenderer.invoke('getFullCoursePath', coursePath);
        
        debug.fullPathResult = JSON.stringify(result, null, 2);
        setDebugInfo(prev => ({...prev, ...debug}));
        
        if (!result.exists) {
          throw new Error(`Course directory not found: ${result.fullPath}`);
        }
        
        console.log('Full course path:', result.fullPath);
        setFullPath(result.fullPath);
      } catch (error) {
        console.error('Error getting full path:', error);
        setError(`Failed to load course directory: ${error.message}`);
        toast.error('Failed to load course directory');
        
        // Add error to debug info
        setDebugInfo(prev => ({
          ...prev, 
          error: error.message,
          stack: error.stack
        }));
      } finally {
        setLoading(false);
      }
    };
    
    getFullPath();
  }, [coursePath, courseData]);
  
  const toggleDebugPanel = () => {
    setShowDebugPanel(prev => !prev);
  };
  
  const tryAlternativePathMethods = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Method 1: Try using window.fileSystem.joinPath
      if (window.fileSystem && window.fileSystem.joinPath && window.fileSystem.basePath) {
        const path1 = window.fileSystem.joinPath(window.fileSystem.basePath, coursePath);
        console.log('Alternative path 1:', path1);
        
        // Check if this path exists via IPC
        try {
          const items = await window.ipcRenderer.invoke('readDirectory', path1);
          if (items && items.length > 0) {
            console.log('Path 1 exists and contains items:', items.length);
            setFullPath(path1);
            return true;
          }
        } catch (err) {
          console.log('Path 1 does not exist or is not accessible');
        }
      }
      
      // Method 2: Try using window.pathUtils.join
      if (window.pathUtils && window.pathUtils.join) {
        const path2 = window.pathUtils.join(window.fileSystem?.basePath || '', coursePath);
        console.log('Alternative path 2:', path2);
        
        try {
          const items = await window.ipcRenderer.invoke('readDirectory', path2);
          if (items && items.length > 0) {
            console.log('Path 2 exists and contains items:', items.length);
            setFullPath(path2);
            return true;
          }
        } catch (err) {
          console.log('Path 2 does not exist or is not accessible');
        }
      }
      
      // Method 3: Try simple string concatenation
      const separator = window.fileSystem?.basePath?.includes('\\') ? '\\' : '/';
      const path3 = `${window.fileSystem?.basePath || ''}${separator}${coursePath}`;
      console.log('Alternative path 3:', path3);
      
      try {
        const items = await window.ipcRenderer.invoke('readDirectory', path3);
        if (items && items.length > 0) {
          console.log('Path 3 exists and contains items:', items.length);
          setFullPath(path3);
          return true;
        }
      } catch (err) {
        console.log('Path 3 does not exist or is not accessible');
      }
      
      // Method 4: Try using the coursePath directly
      console.log('Alternative path 4 (direct):', coursePath);
      
      try {
        const items = await window.ipcRenderer.invoke('readDirectory', coursePath);
        if (items && items.length > 0) {
          console.log('Path 4 exists and contains items:', items.length);
          setFullPath(coursePath);
          return true;
        }
      } catch (err) {
        console.log('Path 4 does not exist or is not accessible');
      }
      
      return false;
    } catch (error) {
      console.error('Error in alternative path methods:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  const useMockCourse = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the user data path and construct the mock course path
      const userDataPath = await window.ipcRenderer.invoke('getUserDataPath');
      
      // Use the correct path separator based on the platform
      const separator = userDataPath.includes('\\') ? '\\' : '/';
      const mockCoursePath = `${userDataPath}${separator}courses${separator}Mock Course`;
      
      console.log('Using mock course path:', mockCoursePath);
      
      // Check if the mock course directory exists
      try {
        const items = await window.ipcRenderer.invoke('readDirectory', mockCoursePath);
        console.log('Mock course directory contains:', items.length, 'items');
        
        if (items && items.length > 0) {
          setFullPath(mockCoursePath);
          return true;
        } else {
          // If directory exists but is empty, still use it
          setFullPath(mockCoursePath);
          return true;
        }
      } catch (err) {
        console.error('Error checking mock course directory:', err);
        
        // Try to create the mock course directory if it doesn't exist
        const created = await window.ipcRenderer.invoke('createMockCourseDirectory');
        if (created) {
          console.log('Created mock course directory:', created);
          setFullPath(created);
          return true;
        } else {
          throw new Error('Failed to create mock course directory');
        }
      }
    } catch (error) {
      console.error('Error using mock course:', error);
      setError(`Failed to use mock course: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  const useMockCourseInCurrentDir = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Trying to create mock course in current directory...');
      const mockCoursePath = await window.ipcRenderer.invoke('createMockCourseInCurrentDir');
      
      if (mockCoursePath) {
        console.log('Using mock course in current directory:', mockCoursePath);
        setFullPath(mockCoursePath);
        return true;
      } else {
        throw new Error('Failed to create mock course in current directory');
      }
    } catch (error) {
      console.error('Error using mock course in current directory:', error);
      setError(`Failed to use mock course in current directory: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  const testFileSystem = async () => {
    try {
      setLoading(true);
      
      // Get the temp directory
      const tempDir = await window.ipcRenderer.invoke('getTempDirectory');
      console.log('Temp directory:', tempDir);
      
      // Create a test file in the temp directory
      const testFilePath = await window.ipcRenderer.invoke('createTestFile', tempDir);
      console.log('Test file created at:', testFilePath);
      
      // Try to read the test file
      const fileContent = await window.ipcRenderer.invoke('readFile', testFilePath);
      console.log('Test file content:', fileContent);
      
      // Set the temp directory as the full path
      setFullPath(tempDir);
      setError(null);
      
      toast.success('File system test successful! Using temp directory.');
      return true;
    } catch (error) {
      console.error('File system test failed:', error);
      setError(`File system test failed: ${error.message}`);
      toast.error('File system test failed');
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  const listAvailableCourses = async () => {
    try {
      setLoading(true);
      
      // Get the user data path
      const userDataPath = await window.ipcRenderer.invoke('getUserDataPath');
      console.log('User data path:', userDataPath);
      
      // List all directories in the user data path
      const items = await window.ipcRenderer.invoke('readDirectory', userDataPath);
      const directories = items.filter(item => item.isDirectory);
      
      console.log('Available directories:', directories.map(d => d.name));
      
      // Show the list in the debug panel
      setDebugInfo(prev => ({
        ...prev,
        availableDirectories: directories.map(d => d.name).join('\n')
      }));
      
      setShowDebugPanel(true);
      toast.success(`Found ${directories.length} directories in user data path`);
      
      return true;
    } catch (error) {
      console.error('Error listing available courses:', error);
      setError(`Failed to list available courses: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  const createCourseDirectory = async () => {
    try {
      setLoading(true);
      
      // Get the user data path
      const userDataPath = await window.ipcRenderer.invoke('getUserDataPath');
      
      // Create the course directory path
      const courseDirectoryPath = `${userDataPath}\\${coursePath}`;
      console.log('Creating course directory at:', courseDirectoryPath);
      
      // Create the directory
      const created = await window.ipcRenderer.invoke('createDirectory', courseDirectoryPath);
      
      if (created) {
        console.log('Course directory created successfully');
        setFullPath(courseDirectoryPath);
        setError(null);
        toast.success('Course directory created successfully');
        return true;
      } else {
        throw new Error('Failed to create course directory');
      }
    } catch (error) {
      console.error('Error creating course directory:', error);
      setError(`Failed to create course directory: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="course-detail h-full flex flex-col">
      <div className="course-header bg-white p-4 mb-4 rounded shadow flex justify-between items-center">
        <div>
          <button 
            onClick={onBack}
            className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded mr-4"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold inline-block">{courseData?.title || 'Course Details'}</h2>
        </div>
        
        <div className="flex items-center space-x-4">
          {courseData?.institution && (
            <span className="badge badge--institution">{courseData.institution}</span>
          )}
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={courseData?.isInProcess}
              onChange={() => {
                if (fullPath) {
                  // Use a simple string concatenation for the path
                  const separator = fullPath.includes('\\') ? '\\' : '/';
                  window.updateInProcessState(`${fullPath}${separator}courseProps.json`);
                }
              }}
              className="mr-2"
            />
            En curso
          </label>
          <button 
            onClick={toggleDebugPanel}
            className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-xs"
            title="Toggle debug information"
          >
            🐞 Debug
          </button>
        </div>
      </div>
      
      {showDebugPanel && (
        <div className="debug-panel bg-gray-100 p-4 mb-4 rounded border border-gray-300 text-xs overflow-auto max-h-60">
          <h3 className="font-bold mb-2">Debug Information</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong>Course Path:</strong> {debugInfo.coursePath || 'N/A'}
            </div>
            <div>
              <strong>Base Path:</strong> {debugInfo.basePath || 'N/A'}
            </div>
            <div>
              <strong>Window FileSystem:</strong> {debugInfo.windowFileSystem || 'N/A'}
            </div>
            <div>
              <strong>Window PathUtils:</strong> {debugInfo.windowPathUtils || 'N/A'}
            </div>
          </div>
          
          <div className="mt-2">
            <strong>Course Data:</strong>
            <pre className="bg-white p-2 rounded mt-1 overflow-auto max-h-20">
              {debugInfo.courseData || 'N/A'}
            </pre>
          </div>
          
          <div className="mt-2">
            <strong>Full Path Result:</strong>
            <pre className="bg-white p-2 rounded mt-1 overflow-auto max-h-20">
              {debugInfo.fullPathResult || 'N/A'}
            </pre>
          </div>
          
          {debugInfo.error && (
            <div className="mt-2">
              <strong>Error:</strong>
              <pre className="bg-red-100 text-red-700 p-2 rounded mt-1 overflow-auto max-h-20">
                {debugInfo.error}
                {debugInfo.stack && `\n\n${debugInfo.stack}`}
              </pre>
            </div>
          )}
          
          {debugInfo.availableDirectories && (
            <div className="mt-2">
              <strong>Available Directories:</strong>
              <pre className="bg-white p-2 rounded mt-1 overflow-auto max-h-20">
                {debugInfo.availableDirectories}
              </pre>
            </div>
          )}
        </div>
      )}
      
      {error && (
        <div className="error-message bg-red-100 text-red-700 p-4 rounded mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold mb-2">Error</h3>
              <p>{error}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button 
                onClick={toggleDebugPanel}
                className="bg-red-200 hover:bg-red-300 px-2 py-1 rounded text-xs"
              >
                Show Debug Info
              </button>
              <button 
                onClick={tryAlternativePathMethods}
                className="bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded text-xs text-white"
              >
                Try Alternative Methods
              </button>
              <button 
                onClick={useMockCourse}
                className="bg-green-500 hover:bg-green-600 px-2 py-1 rounded text-xs text-white"
              >
                Use Mock Course
              </button>
              <button 
                onClick={useMockCourseInCurrentDir}
                className="bg-purple-500 hover:bg-purple-600 px-2 py-1 rounded text-xs text-white"
              >
                Use Current Dir
              </button>
              <button 
                onClick={testFileSystem}
                className="bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-xs text-white"
              >
                Test File System
              </button>
              <button 
                onClick={listAvailableCourses}
                className="bg-indigo-500 hover:bg-indigo-600 px-2 py-1 rounded text-xs text-white"
              >
                List Available Courses
              </button>
              <button 
                onClick={createCourseDirectory}
                className="bg-pink-500 hover:bg-pink-600 px-2 py-1 rounded text-xs text-white"
              >
                Create Course Directory
              </button>
            </div>
          </div>
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p>Loading course content...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {fullPath ? (
            <FileBrowser initialPath={fullPath} />
          ) : (
            <div className="p-4 bg-white rounded shadow text-center text-gray-500">
              Could not load course directory
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CourseDetail; 