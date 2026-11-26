import { useState } from 'react'
import { ImagePlus, Star, X } from 'lucide-react'
import { MAX_CIERRE_IMAGES } from '../../../shared/cierres.js'
import { fieldLabel } from '../ui/classes'
import { cn } from '../ui/cn'

const DRAG_TYPE = 'application/x-cierre-image'

const tileAction =
  'grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(23,21,28,0.62)] text-white backdrop-blur-sm hover:bg-[rgba(23,21,28,0.8)] focus-visible:opacity-100'

/**
 * The pictures of one cierre. The main image sits big on the left; the rest follow in order.
 * Drag a thumbnail onto another to reorder, or onto the main one to make it the main.
 */
function CierreImagesField({ images, coverUrl, busy = false, onAdd, onChange }) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const main = coverUrl || images[0] || null
  const rest = images.filter((url) => url !== main)
  const full = images.length >= MAX_CIERRE_IMAGES

  // The old main takes the new one's place, so nothing else jumps around.
  const setMain = (url) => {
    if (!main || url === main) return onChange({ images, coverUrl: url })
    const next = images.map((item) => (item === url ? main : item === main ? url : item))
    onChange({ images: next, coverUrl: url })
  }
  const remove = (url) => {
    const next = images.filter((item) => item !== url)
    onChange({ images: next, coverUrl: url === main ? next[0] || null : main })
  }
  const moveBefore = (url, target) => {
    if (url === target) return
    const next = images.filter((item) => item !== url)
    next.splice(next.indexOf(target), 0, url)
    onChange({ images: next, coverUrl: main })
  }

  const dragProps = (url) => ({
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.setData(DRAG_TYPE, url)
      event.dataTransfer.effectAllowed = 'move'
      setDragging(url)
    },
    onDragEnd: () => {
      setDragging(null)
      setOver(null)
    },
    onDragOver: (event) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
      event.preventDefault()
      event.stopPropagation()
      setOver(url)
    },
    onDragLeave: () => setOver((value) => (value === url ? null : value)),
    onDrop: (event) => {
      const from = event.dataTransfer.getData(DRAG_TYPE)
      if (!from) return
      event.preventDefault()
      event.stopPropagation()
      setOver(null)
      if (url === main) setMain(from)
      else moveBefore(from, url)
    }
  })

  const hint = images.length
    ? `${images.length}/${MAX_CIERRE_IMAGES} · arrastra para ordenar`
    : 'Pega o arrastra imágenes aquí'

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn(fieldLabel, 'mb-0')}>
          Imágenes <span className="font-normal text-ink-faint">(opcional)</span>
        </span>
        <span className="text-xs text-ink-faint">{busy ? 'Guardando imágenes…' : hint}</span>
      </div>

      {!main ? (
        <button
          type="button"
          className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink/20 bg-surface text-sm font-medium text-ink-soft transition-colors hover:border-coral/50 hover:text-coral-deep"
          onClick={onAdd}
          disabled={busy}
        >
          <ImagePlus size={20} aria-hidden="true" />
          Añadir imágenes
        </button>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          <figure
            {...dragProps(main)}
            className={cn(
              'group/tile relative col-span-2 row-span-2 m-0 aspect-[4/3] overflow-hidden rounded-md border border-ink/10 bg-ink/5 ring-2 ring-coral',
              over === main && dragging !== main && 'ring-4 ring-coral/70',
              dragging === main && 'opacity-50'
            )}
          >
            <img src={main} alt="" className="size-full object-cover" draggable={false} />
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-coral px-2 py-0.5 text-[0.7rem] font-semibold text-white shadow-card">
              <Star size={11} className="fill-current" aria-hidden="true" />
              Principal
            </span>
            <button
              type="button"
              className={cn(
                tileAction,
                'absolute top-1.5 right-1.5 opacity-0 group-hover/tile:opacity-100'
              )}
              title="Quitar imagen"
              aria-label="Quitar imagen principal"
              onClick={() => remove(main)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </figure>

          {rest.map((url, index) => (
            <figure
              key={url}
              {...dragProps(url)}
              className={cn(
                'group/tile relative m-0 aspect-[4/3] cursor-grab overflow-hidden rounded-md border border-ink/10 bg-ink/5',
                over === url && dragging !== url && 'ring-2 ring-coral/60',
                dragging === url && 'opacity-50'
              )}
            >
              <img src={url} alt="" className="size-full object-cover" draggable={false} />
              <div className="absolute inset-x-1 top-1 flex justify-between">
                <button
                  type="button"
                  className={cn(tileAction, 'opacity-0 group-hover/tile:opacity-100')}
                  title="Hacer principal"
                  aria-label={`Hacer principal la imagen ${index + 2}`}
                  onClick={() => setMain(url)}
                >
                  <Star size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={cn(tileAction, 'opacity-0 group-hover/tile:opacity-100')}
                  title="Quitar imagen"
                  aria-label={`Quitar la imagen ${index + 2}`}
                  onClick={() => remove(url)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </figure>
          ))}

          {!full ? (
            <button
              type="button"
              className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-ink/20 bg-surface text-xs font-medium text-ink-soft transition-colors hover:border-coral/50 hover:text-coral-deep disabled:opacity-60"
              onClick={onAdd}
              disabled={busy}
              aria-label="Añadir más imágenes"
            >
              <ImagePlus size={18} aria-hidden="true" />
              Añadir
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default CierreImagesField
