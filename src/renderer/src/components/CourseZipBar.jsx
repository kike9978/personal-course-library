function formatZipBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${Math.round(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

function CourseZipBar({
  count = 0,
  listCount = 0,
  exporting = false,
  progress = null,
  onClear,
  onExport,
  onCancel
}) {
  if (!count && !listCount && !exporting) return null

  const courseLabel = `${count} ${count === 1 ? 'curso' : 'cursos'}`
  const listLabel = listCount ? ` · ${listCount} ${listCount === 1 ? 'lista' : 'listas'}` : ''
  const totalBytes = Number(progress?.totalBytes) || 0
  const processedBytes = Number(progress?.processedBytes) || 0
  const percent =
    exporting && totalBytes > 0
      ? Math.min(100, Math.round((processedBytes / totalBytes) * 100))
      : null
  let detail = ''
  if (exporting) {
    detail =
      percent == null
        ? 'Preparando…'
        : `${percent}% · ${formatZipBytes(processedBytes)} de ${formatZipBytes(totalBytes)}`
  } else if (!count && listCount) {
    detail = 'Esas listas no tienen cursos'
  }

  return (
    <div className="course-zip-bar" role="region" aria-label="Exportar cursos">
      <div className="course-zip-bar__row">
        <p>
          {courseLabel}
          {listLabel}
          {detail ? <span className="course-zip-bar__meta">{detail}</span> : null}
        </p>
        <button type="button" className="btn btn--ghost" onClick={onClear} disabled={exporting}>
          Limpiar
        </button>
        {exporting ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--primary"
          onClick={onExport}
          disabled={exporting || count === 0}
        >
          {exporting ? 'Exportando…' : 'Exportar ZIP'}
        </button>
      </div>
      {exporting ? (
        <div
          className="course-zip-bar__track"
          role="progressbar"
          aria-label="Progreso de la exportación"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
        >
          <div
            className={`course-zip-bar__fill${percent == null ? ' is-indeterminate' : ''}`}
            style={percent == null ? undefined : { width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default CourseZipBar
