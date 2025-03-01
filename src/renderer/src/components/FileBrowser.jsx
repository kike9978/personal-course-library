import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

// Helper function to join paths safely
const joinPaths = (basePath, ...parts) => {
  const separator = basePath.includes('\\') ? '\\' : '/';
  return [basePath, ...parts].join(separator);
};

// Helper function to get parent directory
const getParentPath = (filePath) => {
  const separator = filePath.includes('\\') ? '\\' : '/';
  const parts = filePath.split(separator);
  return parts.slice(0, -1).join(separator);
};

// Icons for different file types
const FileIcon = ({ type }) => {
  switch (type) {
    case 'directory':
      return <span className="text-blue-500">📁</span>;
    case 'pdf':
      return <span className="text-red-500">📄</span>;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
      return <span className="text-green-500">🖼️</span>;
    case 'md':
      return <span className="text-purple-500">📝</span>;
    case 'txt':
      return <span className="text-gray-500">📄</span>;
    default:
      return <span className="text-gray-400">📄</span>;
  }
};

// Component to display file content
const FileViewer = ({ file }) => {
  if (!file) return null;
  
  const { content, extension, path, isBinary, isTooLarge } = file;
  
  console.log('Rendering file:', { extension, path, isBinary, isTooLarge });
  
  // Handle special cases
  if (isTooLarge) {
    return (
      <div className="p-4 bg-white rounded shadow">
        <h3 className="font-bold text-lg mb-2">File is too large to display</h3>
        <p>{content}</p>
        <button 
          onClick={() => window.fileSystem?.openFolder(path)}
          className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
        >
          Open in Default Application
        </button>
      </div>
    );
  }
  
  if (isBinary) {
    return (
      <div className="p-4 bg-white rounded shadow">
        <h3 className="font-bold text-lg mb-2">Binary File</h3>
        <p>{content}</p>
        <button 
          onClick={() => window.fileSystem?.openFolder(path)}
          className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
        >
          Open in Default Application
        </button>
      </div>
    );
  }
  
  // Handle different file types
  switch (extension) {
    case 'md':
      return (
        <div className="markdown-content p-4 bg-white rounded shadow">
          <h3 className="font-bold text-lg mb-2">{path.split('/').pop()}</h3>
          <div className="prose">
            {content.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      );
    
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
      return (
        <div className="image-content p-4 bg-white rounded shadow text-center">
          <h3 className="font-bold text-lg mb-2">{path.split('/').pop()}</h3>
          <img 
            src={`file://${path}`} 
            alt="Preview" 
            className="max-w-full max-h-[500px] mx-auto"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItaW1hZ2UiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiPjwvcG9seWxpbmU+PC9zdmc+';
              e.target.style.padding = '2rem';
              e.target.style.opacity = '0.5';
            }}
          />
          <button 
            onClick={() => window.fileSystem?.openFolder(path)}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Open in Default Application
          </button>
        </div>
      );
    
    case 'txt':
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'css':
    case 'html':
    case 'json':
    case 'xml':
    case 'yml':
    case 'yaml':
      return (
        <div className="text-content p-4 bg-white rounded shadow">
          <h3 className="font-bold text-lg mb-2">{path.split('/').pop()}</h3>
          <pre className="bg-gray-100 p-4 rounded overflow-auto whitespace-pre-wrap">
            {content}
          </pre>
          <button 
            onClick={() => window.fileSystem?.openFolder(path)}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Open in Default Application
          </button>
        </div>
      );
    
    default:
      return (
        <div className="generic-content p-4 bg-white rounded shadow">
          <h3 className="font-bold text-lg mb-2">{path.split('/').pop()}</h3>
          <p className="mb-4">File type: {extension || 'Unknown'}</p>
          <pre className="bg-gray-100 p-4 rounded overflow-auto whitespace-pre-wrap">
            {content}
          </pre>
          <button 
            onClick={() => window.fileSystem?.openFolder(path)}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Open in Default Application
          </button>
        </div>
      );
  }
};

function FileBrowser({ initialPath }) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Load directory contents
  const loadDirectory = async (dirPath) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedFile(null);
      
      console.log('Loading directory:', dirPath);
      const items = await window.ipcRenderer.invoke('readDirectory', dirPath);
      setItems(items);
      
      // Update breadcrumbs
      const separator = dirPath.includes('\\') ? '\\' : '/';
      const pathParts = dirPath.split(separator);
      const newBreadcrumbs = [];
      
      let currentBuildPath = '';
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (part) {
          // For Windows paths with drive letter
          if (i === 0 && part.endsWith(':')) {
            currentBuildPath = part + separator;
          } else {
            currentBuildPath = currentBuildPath ? joinPaths(currentBuildPath, part) : part;
          }
          
          newBreadcrumbs.push({
            name: part,
            path: currentBuildPath
          });
        }
      }
      
      setBreadcrumbs(newBreadcrumbs);
      setCurrentPath(dirPath);
    } catch (err) {
      console.error('Error loading directory:', err);
      setError(`Failed to load directory: ${err.message}`);
      toast.error(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Load file content
  const loadFile = async (filePath) => {
    try {
      setLoading(true);
      
      console.log('Loading file:', filePath);
      const fileData = await window.ipcRenderer.invoke('readFile', filePath);
      setSelectedFile(fileData);
    } catch (err) {
      console.error('Error loading file:', err);
      toast.error(`Error loading file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle item click
  const handleItemClick = async (item) => {
    try {
      if (item.isDirectory) {
        loadDirectory(item.path);
      } else {
        setLoading(true);
        
        console.log('Loading file:', item.path);
        const fileData = await window.ipcRenderer.invoke('readFile', item.path);
        setSelectedFile(fileData);
        
        // Log the file data for debugging
        console.log('File data:', fileData);
      }
    } catch (error) {
      console.error('Error handling item click:', error);
      setError(`Failed to load item: ${error.message}`);
      toast.error('Failed to load item');
    } finally {
      setLoading(false);
    }
  };
  
  // Navigate to parent directory
  const navigateUp = () => {
    const parentPath = getParentPath(currentPath);
    if (parentPath !== currentPath) {
      loadDirectory(parentPath);
    }
  };
  
  // Initial load
  useEffect(() => {
    if (initialPath) {
      loadDirectory(initialPath);
    }
  }, [initialPath]);
  
  return (
    <div className="file-browser flex flex-col h-full">
      {/* Breadcrumb navigation */}
      <div className="breadcrumbs flex items-center p-2 bg-gray-100 rounded mb-4 overflow-x-auto">
        <button 
          onClick={navigateUp}
          className="p-1 mr-2 bg-gray-200 rounded hover:bg-gray-300 flex-shrink-0"
          title="Go up one level"
        >
          ⬆️
        </button>
        
        <div className="flex items-center overflow-x-auto">
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center flex-shrink-0">
              {index > 0 && <span className="mx-1 text-gray-500">/</span>}
              <button
                onClick={() => loadDirectory(crumb.path)}
                className="text-blue-500 hover:underline whitespace-nowrap"
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex flex-1 gap-4">
        {/* File list */}
        <div className="file-list w-1/3 bg-white rounded shadow p-4 overflow-auto">
          {loading && <p className="text-gray-500">Loading...</p>}
          
          {error && (
            <div className="error-message bg-red-100 text-red-700 p-2 rounded">
              {error}
            </div>
          )}
          
          {!loading && !error && items.length === 0 && (
            <p className="text-gray-500">This folder is empty.</p>
          )}
          
          <ul className="space-y-1">
            {items.map((item, index) => (
              <li key={index}>
                <button
                  onClick={() => handleItemClick(item)}
                  className="w-full text-left p-2 hover:bg-gray-100 rounded flex items-center"
                >
                  <FileIcon type={item.type} />
                  <span className="ml-2 truncate">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        
        {/* File preview */}
        <div className="file-preview flex-1 overflow-auto">
          {selectedFile ? (
            <FileViewer file={selectedFile} />
          ) : (
            <div className="p-4 bg-white rounded shadow text-center text-gray-500">
              Select a file to preview its contents
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileBrowser; 