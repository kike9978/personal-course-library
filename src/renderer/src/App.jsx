import CoursesGrid from './components/CoursesGrid'
import { useState, useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import DebugModal from './components/DebugModal'
import Loader from './components/Loader'
import { Toaster } from 'react-hot-toast'
import CourseDetail from './components/CourseDetail'



// function getNativeImageData(pathToImage) {
//   return ipcRenderer.invoke("getNativeImage", pathToImage);
// }

function FilterableCoursesGrid({ courses = [], isLoading, onRefresh, onCourseSelect }) {
  const [filterText, setFilterText] = useState('')
  const [isCardLayout, setIsCardLayout] = useState(true)
  const [isInProcessOnly, setisInProcessOnly] = useState(false)
  const [courseCount, setCourseCount] = useState(courses.length || 0)

  // Add useEffect to handle course list changes
  useEffect(() => {
    setCourseCount(courses.length || 0)
  }, [courses])

  return (
    <div>
      <SearchBar
        filterText={filterText}
        onFilterTextChange={setFilterText}
        onCardLayoutChange={setIsCardLayout}
        onInProcessOnlyChange={setisInProcessOnly}
        isCardLayout={isCardLayout}
        isInProcessOnly={isInProcessOnly}
        courseCount={courseCount}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />
      {isLoading ? (
        <div className="loader-container">
          <Loader />
        </div>
      ) : (
        <CoursesGrid
          courses={courses}
          filterText={filterText}
          isCardLayout={isCardLayout}
          isInProcessOnly={isInProcessOnly}
          onSortedCourses={setCourseCount}
          onCourseSelect={onCourseSelect}
        />
      )}
    </div>
  )
}

// Add prop validation
FilterableCoursesGrid.defaultProps = {
  courses: [],
  isLoading: false,
  onRefresh: () => {},
  onCourseSelect: () => {}
}

function SearchBar({
  filterText,
  onFilterTextChange,
  onCardLayoutChange,
  isCardLayout,
  isInProcessOnly,
  onInProcessOnlyChange,
  courseCount,
  onRefresh,
  isLoading
}) {
  return (
    <div className="navbar bg-white shadow-lg p-4">
      <div className="navbar-header flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Catálogo de cursos</h1>
        <button 
          onClick={onRefresh}
          disabled={isLoading}
          className="refresh-button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
          Refresh
        </button>
      </div>
      <div className="navbar-filters mt-4">
        <form className="flex items-center">
          <input
            type="text"
            value={filterText}
            placeholder="Buscar..."
            onChange={(e) => onFilterTextChange(e.target.value)}
            className="px-4 py-2 rounded border border-gray-300 text-gray-800 focus:outline-none focus:ring focus:border-blue-500"
          />
        </form>
        <p className="text-gray-600">Cursos: {courseCount}</p>
        <label className="flex items-center text-gray-600">
          <input
            type="checkbox"
            checked={isCardLayout}
            onChange={(e) => onCardLayoutChange(e.target.checked)}
            className="mr-2"
          />
          Mostrar vista de cards
        </label>
        <label className="flex items-center text-gray-600">
          <input
            type="checkbox"
            checked={isInProcessOnly}
            onChange={(e) => onInProcessOnlyChange(e.target.checked)}
            className="mr-2"
          />
          Filtrar cursos en progreso
        </label>
      </div>
    </div>
  )
}

function App() {
  const [showDebug, setShowDebug] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedCourseData, setSelectedCourseData] = useState(null);
  
  const refreshCourses = async () => {
    setIsLoading(true);
    try {
      // Use the IPC to refresh course list
      const result = await window.ipcRenderer.invoke('refreshCourseList');
      
      // Update the global coursesCoverImages
      window.coursesCoverImages = result.coursesCoverImages;
      
      // Update courses state
      setCourses(result.courses);
      
      console.log('Courses refreshed successfully');
    } catch (error) {
      console.error('Error refreshing courses:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCourseSelect = (coursePath) => {
    try {
      // Get course data
      const courseData = window.readJSON(coursePath);
      setSelectedCourseData(courseData);
      setSelectedCourse(coursePath);
    } catch (error) {
      console.error('Error selecting course:', error);
    }
  };
  
  const handleBackToGrid = () => {
    setSelectedCourse(null);
    setSelectedCourseData(null);
  };
  
  useEffect(() => {
    // Initial load
    const loadData = async () => {
      try {
        // Get courses from window.courseList
        const courseList = window.courseList || [];
        
        // Artificial delay to ensure UI components are ready
        setTimeout(() => {
          setCourses(courseList);
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error loading courses:', error);
        setIsLoading(false);
      }
    };
    
    loadData();
    
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setShowDebug(prev => !prev);
        console.log('Debug mode toggled');
      } else if (e.ctrlKey && e.key === 'r') {
        // Add keyboard shortcut for refresh
        refreshCourses();
      } else if (e.key === 'Escape' && selectedCourse) {
        // Add keyboard shortcut to go back to grid
        handleBackToGrid();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCourse]);
  
  const runDiagnostics = async () => {
    try {
      console.log('Running diagnostics...');
      
      // Check available APIs
      const apis = {
        fileSystem: !!window.fileSystem,
        pathUtils: !!window.pathUtils,
        ipcRenderer: !!window.ipcRenderer,
        courseList: !!window.courseList,
        readJSON: !!window.readJSON,
        updateInProcessState: !!window.updateInProcessState
      };
      
      console.log('Available APIs:', apis);
      
      // Check course list
      const courseListResult = typeof window.courseList === 'function' 
        ? window.courseList() 
        : window.courseList;
      
      console.log('Course list:', courseListResult);
      
      // Check file system base path
      const basePath = window.fileSystem?.basePath;
      console.log('Base path:', basePath);
      
      // Try to read a course
      if (Array.isArray(courseListResult) && courseListResult.length > 0 && window.readJSON) {
        const firstCourse = courseListResult[0];
        console.log('Reading first course:', firstCourse);
        
        try {
          const courseData = window.readJSON(firstCourse);
          console.log('Course data:', courseData);
        } catch (err) {
          console.error('Error reading course data:', err);
        }
        
        // Try to get full path
        if (window.ipcRenderer) {
          try {
            const fullPathResult = await window.ipcRenderer.invoke('getFullCoursePath', firstCourse);
            console.log('Full path result:', fullPathResult);
          } catch (err) {
            console.error('Error getting full path:', err);
          }
        }
      }
      
      // Check directory access
      if (window.ipcRenderer) {
        try {
          const currentDir = process.cwd ? process.cwd() : '.';
          const dirContents = await window.ipcRenderer.invoke('readDirectory', currentDir);
          console.log('Current directory contents:', dirContents);
        } catch (err) {
          console.error('Error reading current directory:', err);
        }
      }
      
      console.log('Diagnostics complete');
      toast.success('Diagnostics complete. Check console for results.');
    } catch (error) {
      console.error('Diagnostics error:', error);
      toast.error('Diagnostics failed. Check console for details.');
    }
  };
  
  return (
    <ErrorBoundary>
      <div className="container h-screen flex flex-col">
        <Toaster position="top-right" />
        
        {selectedCourse ? (
          <CourseDetail 
            coursePath={selectedCourse}
            courseData={selectedCourseData}
            onBack={handleBackToGrid}
          />
        ) : (
          <FilterableCoursesGrid 
            courses={courses} 
            isLoading={isLoading} 
            onRefresh={refreshCourses}
            onCourseSelect={handleCourseSelect}
          />
        )}
        
        <button 
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            zIndex: 1000,
            padding: '8px 16px',
            background: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
          onClick={() => {
            setShowDebug(true);
            console.log('Debug button clicked');
          }}
        >
          Debug
        </button>
        <button 
          style={{
            position: 'fixed',
            bottom: '10px',
            right: '80px',
            zIndex: 1000,
            padding: '8px 16px',
            background: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
          onClick={runDiagnostics}
        >
          Diagnostics
        </button>
        {showDebug && <DebugModal onClose={() => setShowDebug(false)} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
