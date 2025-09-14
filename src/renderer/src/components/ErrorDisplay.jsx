export default function ErrorDisplay({ error }) {
  if (!error) return null

  return (
    <div className="error-message">
      <h3>An error occurred:</h3>
      <p>{error.message}</p>
      <pre>{error.stack}</pre>
    </div>
  )
}
