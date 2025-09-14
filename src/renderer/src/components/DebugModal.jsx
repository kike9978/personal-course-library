import { useEffect, useState } from 'react'

export default function DebugModal({ onClose }) {
  const [logs, setLogs] = useState([])
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Safer approach that doesn't rely on ipcRenderer.on directly
    const handleConsoleMessage = (event, data) => {
      if (data && data.type && data.args) {
        setLogs((prevLogs) => [
          ...prevLogs,
          {
            type: data.type,
            content: Array.isArray(data.args) ? data.args.join(' ') : String(data.args),
            timestamp: new Date()
          }
        ])
      }
    }

    // Check if ipcRenderer is available and has the expected methods
    if (window.ipcRenderer && typeof window.ipcRenderer.on === 'function') {
      window.ipcRenderer.on('console-message', handleConsoleMessage)
    } else {
      console.error('ipcRenderer.on is not available')
      // Add a fallback log entry
      setLogs((prevLogs) => [
        ...prevLogs,
        {
          type: 'error',
          content: 'IPC communication is not available. Debug functionality limited.',
          timestamp: new Date()
        }
      ])
    }

    // Add a test log that doesn't depend on IPC
    setLogs((prevLogs) => [
      ...prevLogs,
      {
        type: 'info',
        content: 'Debug console initialized (local)',
        timestamp: new Date()
      }
    ])

    return () => {
      if (window.ipcRenderer && typeof window.ipcRenderer.removeListener === 'function') {
        window.ipcRenderer.removeListener('console-message', handleConsoleMessage)
      }
    }
  }, [])

  // Simple log function that doesn't depend on overriding console
  const addLog = (type, message) => {
    setLogs((prevLogs) => [
      ...prevLogs,
      {
        type,
        content: message,
        timestamp: new Date()
      }
    ])

    // Try to send to main process if possible
    if (window.ipcRenderer && typeof window.ipcRenderer.send === 'function') {
      try {
        window.ipcRenderer.send('renderer-log', { type, args: [message] })
      } catch (err) {
        // Silently fail if IPC isn't working
      }
    }
  }

  if (!isVisible) return null

  return (
    <div className="debug-modal">
      <div className="debug-header">
        <h2>Debug Console</h2>
        <button
          onClick={() => {
            setIsVisible(false)
            if (onClose) onClose()
          }}
        >
          Close
        </button>
      </div>
      <div className="debug-content">
        <pre>
          {logs.map((log, index) => (
            <div key={index} className={`log-entry log-${log.type}`}>
              [{log.timestamp.toLocaleTimeString()}] {log.type.toUpperCase()}: {log.content}
            </div>
          ))}
        </pre>
      </div>
      <div className="debug-footer">
        <button onClick={() => setLogs([])}>Clear</button>
        <button onClick={() => addLog('log', 'Test log from debug console')}>Test Log</button>
        <button
          onClick={() => {
            try {
              throw new Error('Test error')
            } catch (err) {
              addLog('error', `Test error: ${err.message}`)
            }
          }}
        >
          Test Error
        </button>
      </div>
    </div>
  )
}
