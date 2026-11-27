import { Camera, FileText, Globe, SquarePlay } from 'lucide-react'
import { cn } from '../ui/cn'

/** Small pieces shared by the Fuentes grid, the link panel and collections. */

const KIND_ICON = {
  youtube: SquarePlay,
  instagram: Camera,
  article: FileText,
  other: Globe
}

export function thumbUrl(source) {
  return source?.thumbnailFile
    ? `course-media://source-thumb/?file=${encodeURIComponent(source.thumbnailFile)}`
    : null
}

export function KindIcon({ kind, className }) {
  const Icon = KIND_ICON[kind] || Globe
  return <Icon aria-hidden="true" className={className} />
}

/** Thumbnail, or the kind's icon on a plain fill. `natural` keeps the image's own shape. */
export function Thumb({ source, className, natural = false }) {
  const src = thumbUrl(source)
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cn(natural ? 'block h-auto w-full' : 'object-cover', className)}
      />
    )
  }
  return (
    <div
      className={cn(
        'grid place-items-center bg-cream text-ink-faint',
        natural && 'aspect-video w-full',
        className
      )}
    >
      <KindIcon kind={source?.kind} className="size-8" />
    </div>
  )
}

export function formatDuration(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m >= 10) return `${m} min`
  return `${m}:${String(s).padStart(2, '0')}`
}
