import { useEffect, useState } from 'react'

export default function DebugModal({ onClose }) {
  const [debugInfo, setDebugInfo] = useState({})
  const [pathInfo, setPathInfo] = useState(null)

  useEffect(() => {
    const fetchInfo = async () => {
      const info = await window.debug.getDebugInfo()
      setDebugInfo(info)
    }
    fetchInfo()
  }, [])

  useEffect(() => {
    const fetchPathInfo = async () => {
      const info = await window.fileSystem.verifyPath()
      setPathInfo(info)
    }
    fetchPathInfo()
  }, [])

  return (
    <dialog open className="debug-modal">
      <div className="debug-content">
        <h2>Debug Information</h2>
        <button onClick={onClose}>Close</button>
        
        <h3>File System</h3>
        <pre>Base Path: {debugInfo.basePath}</pre>
        <pre>Courses Found: {debugInfo.courseCount}</pre>
        
        <h3>Recent Errors</h3>
        <pre>{debugInfo.lastError || 'No errors recorded'}</pre>
        
        <h3>File Checks</h3>
        <ul>
          {debugInfo.fileChecks?.map((check, i) => (
            <li key={i}>{check}</li>
          ))}
        </ul>
      </div>
    </dialog>
  )
} 