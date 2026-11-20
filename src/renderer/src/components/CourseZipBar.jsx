import { cn } from '../ui/cn'
import { btnGhost, btnPrimary } from '../ui/classes'

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

const barBtn = 'px-[0.85rem] py-[0.4rem] shadow-none'

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
    <div
      className="fixed bottom-4 left-1/2 z-[70] flex w-[min(36rem,calc(100vw-8rem))] -translate-x-1/2 flex-col items-stretch gap-[0.55rem] rounded-lg border border-ink/10 bg-surface px-[0.85rem] py-[0.7rem] shadow-lift"
      role="region"
      aria-label="Exportar cursos"
    >
      <div className="flex items-center gap-[0.65rem]">
        <p className="m-0 min-w-0 flex-1 font-extrabold">
          {courseLabel}
          {listLabel}
          {detail ? (
            <span className="mt-[0.1rem] block text-[0.8rem] font-semibold text-ink-soft">
              {detail}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          className={cn(btnGhost, barBtn)}
          onClick={onClear}
          disabled={exporting}
        >
          Limpiar
        </button>
        {exporting ? (
          <button type="button" className={cn(btnGhost, barBtn)} onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          className={cn(btnPrimary, barBtn)}
          onClick={onExport}
          disabled={exporting || count === 0}
        >
          {exporting ? 'Exportando…' : 'Exportar ZIP'}
        </button>
      </div>
      {exporting ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"
          role="progressbar"
          aria-label="Progreso de la exportación"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
        >
          <div
            className={cn(
              'h-full w-0 rounded-[inherit] bg-coral transition-[width] duration-150 ease-linear',
              percent == null && 'w-[35%] animate-zip-indeterminate motion-reduce:animate-none'
            )}
            style={percent == null ? undefined : { width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default CourseZipBar
