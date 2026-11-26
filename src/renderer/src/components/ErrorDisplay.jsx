export default function ErrorDisplay({ error }) {
  if (!error) return null

  return (
    <div className="m-8 rounded-md border-[3px] border-danger/40 bg-danger-soft p-8">
      <h3>An error occurred:</h3>
      <p>{error.message}</p>
      <pre className="whitespace-pre-wrap rounded-sm bg-black/[0.08] p-4">{error.stack}</pre>
    </div>
  )
}
