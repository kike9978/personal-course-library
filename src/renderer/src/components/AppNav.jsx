import {
  BookOpenText,
  Flag,
  GalleryVerticalEnd,
  KanbanSquare,
  LibraryBig,
  Link2,
  ListVideo
} from 'lucide-react'
import { cn } from '../ui/cn'
import { segmented, segmentedItem } from '../ui/classes'

export const NAV_ITEMS = [
  { id: 'library', label: 'Biblioteca', icon: LibraryBig },
  { id: 'annotations', label: 'Anotaciones', icon: BookOpenText },
  { id: 'sources', label: 'Fuentes', icon: Link2 },
  { id: 'projects', label: 'Proyectos', icon: KanbanSquare },
  { id: 'cierres', label: 'Cierres', icon: Flag },
  { id: 'playlists', label: 'Listas', icon: ListVideo },
  { id: 'flashcards', label: 'Tarjetas', icon: GalleryVerticalEnd }
]

/**
 * Top-level destinations (not library filters).
 */
function AppNav({ active = 'library', onSelect, className }) {
  return (
    <nav className={cn(segmented, 'min-w-0', className)} aria-label="Principal">
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.id
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              segmentedItem,
              'px-2.5 [&_svg]:text-ink-faint aria-[current=page]:[&_svg]:text-coral'
            )}
            aria-current={isActive ? 'page' : undefined}
            title={item.label}
            onClick={() => onSelect?.(item.id)}
          >
            <Icon aria-hidden="true" />
            <span className="max-[1180px]:sr-only">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default AppNav
