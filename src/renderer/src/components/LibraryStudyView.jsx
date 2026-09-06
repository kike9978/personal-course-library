import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { formatTime } from './StudySidePanel'

function LibraryStudyView({ courses, onBack, onOpenCourse }) {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const titleByPath = useMemo(() => {
    const map = {}
    courses.forEach((c) => {
      map[c.path] = c.title || c.path
    })
    return map
  }, [courses])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api
      .listAllNotes()
      .then((list) => {
        if (!cancelled) setItems(list || [])
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'No se pudo cargar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const courseTitle = (titleByPath[item.coursePath] || item.coursePath || '').toLowerCase()
      const hay = [item.body, item.lessonTitle, item.coursePath, courseTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, query, titleByPath])

  const handleOpen = (item) => {
    const course = courses.find((c) => c.path === item.coursePath)
    if (!course) {
      toast.error('Curso no encontrado en la biblioteca')
      return
    }
    onOpenCourse(course, {
      lessonRelativePath: item.lessonRelativePath || null,
      timeSec: item.timeSec ?? null
    })
  }

  return (
    <div className="library-study">
      <header className="library-study__header">
        <button type="button" className="icon-btn icon-btn--ghost" onClick={onBack}>
          ← Biblioteca
        </button>
        <h1>Anotaciones</h1>
        <div className="search-field library-study__search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar"
          />
        </div>
      </header>

      <div className="library-study__content">
        {loading ? (
          <p className="library-study__empty">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="library-study__empty">
            {items.length === 0
              ? 'Aún no hay anotaciones. Abre un curso y pulsa N o B.'
              : 'Ningún resultado.'}
          </p>
        ) : (
          <ul className="library-study__list">
            {filtered.map((item) => (
              <li key={`${item.coursePath}-${item.id}`} className="library-study__card">
                <div className="library-study__meta">
                  <strong>{titleByPath[item.coursePath] || item.coursePath}</strong>
                  {typeof item.timeSec === 'number' ? (
                    <span className="study-panel__time">{formatTime(item.timeSec)}</span>
                  ) : (
                    <span className="study-panel__tag">Curso</span>
                  )}
                </div>
                {item.lessonTitle ? (
                  <div className="library-study__lesson">{item.lessonTitle}</div>
                ) : null}
                <p>{item.body || 'Sin texto'}</p>
                <button type="button" className="icon-btn" onClick={() => handleOpen(item)}>
                  Abrir en curso
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default LibraryStudyView
