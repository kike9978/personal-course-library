export default function ErrorDisplay({ error }) {
  if (!error) return null

  return (
    <div className="error-message">
      <h3>⚠️ Application Error</h3>
      <p>{error.message}</p>
      <details>
        <summary>Technical details</summary>
        <pre>{error.stack}</pre>
      </details>
    </div>
  )
} 