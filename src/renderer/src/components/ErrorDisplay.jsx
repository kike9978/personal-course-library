export default function ErrorDisplay({ error }) {
  if (!error) return null

  return (
    <div className="m-8 rounded-md border-[3px] border-[#ff4444] bg-[#ffe6e6] p-8">
      <h3>An error occurred:</h3>
      <p>{error.message}</p>
      <pre className="whitespace-pre-wrap rounded-[8px] bg-black/[0.08] p-4">{error.stack}</pre>
    </div>
  )
}
