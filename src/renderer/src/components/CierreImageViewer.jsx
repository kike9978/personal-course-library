import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '../ui/cn'

const control =
  'grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-30'

/** Full-screen look at a cierre's pictures. Arrows move, Escape closes. */
function CierreImageViewer({ images, index, title, onIndex, onClose }) {
  const closeRef = useRef(null)
  const count = images.length
  const current = images[index] || images[0]

  useEffect(() => {
    const back = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (back?.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowRight' && index < count - 1) {
        onIndex(index + 1)
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onIndex(index - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, count, onIndex, onClose])

  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Imágenes de «${title}»` : 'Imágenes'}
      className="fixed inset-0 z-50 flex flex-col bg-[rgba(14,12,18,0.96)] backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-white/80">
        <span className="min-w-0 flex-1 truncate font-medium text-white">{title}</span>
        {count > 1 ? (
          <span className="tabular-nums">
            {index + 1} / {count}
          </span>
        ) : null}
        <button
          ref={closeRef}
          type="button"
          className={control}
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <img
          key={current}
          src={current}
          alt=""
          className="max-h-full max-w-full rounded-md object-contain shadow-panel"
        />
        {count > 1 ? (
          <>
            <button
              type="button"
              className={cn(control, 'absolute top-1/2 left-4 -translate-y-1/2')}
              aria-label="Imagen anterior"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={cn(control, 'absolute top-1/2 right-4 -translate-y-1/2')}
              aria-label="Imagen siguiente"
              disabled={index === count - 1}
              onClick={() => onIndex(index + 1)}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-4">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              className={cn(
                'h-14 w-20 shrink-0 cursor-pointer overflow-hidden rounded-sm border-2 bg-transparent p-0 opacity-60 transition-opacity hover:opacity-100',
                i === index ? 'border-white opacity-100' : 'border-transparent'
              )}
              aria-label={`Imagen ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => onIndex(i)}
            >
              <img src={url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default CierreImageViewer
