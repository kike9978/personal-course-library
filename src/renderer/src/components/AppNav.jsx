/**
 * Top-level destinations (not library filters).
 */
function AppNav({ active = 'library', onSelect }) {
  const items = [
    { id: 'library', label: 'Biblioteca' },
    { id: 'paths', label: 'Rutas' },
    { id: 'guide', label: 'Guía' },
    { id: 'annotations', label: 'Anotaciones' },
    { id: 'projects', label: 'Proyectos' }
  ]

  return (
    <nav className="app-nav" aria-label="Principal">
      {items.map((item) => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={`app-nav__link${isActive ? ' is-active' : ''}`}
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
