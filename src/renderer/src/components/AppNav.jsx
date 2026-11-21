import { cn } from '../ui/cn'

/**
 * Top-level destinations (not library filters).
 */
function AppNav({ active = 'library', onSelect }) {
  const items = [
    { id: 'library', label: 'Biblioteca' },
    { id: 'annotations', label: 'Anotaciones' },
    { id: 'projects', label: 'Proyectos' },
    { id: 'cierres', label: 'Cierres' },
    { id: 'playlists', label: 'Listas' }
  ]

  return (
    <nav className="flex flex-wrap items-center gap-[0.15rem]" aria-label="Principal">
      {items.map((item) => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              'm-0 cursor-pointer appearance-none rounded-[6px] border-0 bg-transparent px-[0.45rem] py-[0.15rem] font-body text-[0.78rem] font-[650] text-ink-soft transition-[color,background-color] duration-[120ms] ease-[ease] hover:bg-ink/5 hover:text-ink',
              isActive && 'font-[750] text-coral-deep hover:text-coral-deep'
            )}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect?.(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export default AppNav
