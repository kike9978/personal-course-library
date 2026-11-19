import { useCallback, useEffect, useState } from 'react'
import AppNav from './AppNav'

function Figure({ label, value, unit, detail, children }) {
  return (
    <article className="progress-figure">
      <h3>{label}</h3>
      <p className="progress-figure__value">
        <strong>{value}</strong>
        {unit ? <span>{unit}</span> : null}
      </p>
      {children || (detail ? <p className="progress-figure__detail">{detail}</p> : null)}
    </article>
  )
}

function WeekStrip({ days }) {
  const today = new Date()
  return (
    <div className="progress-week" aria-hidden="true">
      {days.map((active, index) => {
        const date = new Date(today)
        date.setDate(today.getDate() - (days.length - 1 - index))
        return <span key={date.toDateString()} className={active ? 'is-on' : ''} />
      })}
    </div>
  )
}

function BarList({ rows, empty, onOpen }) {
  if (!rows.length) return <p className="progress-empty">{empty}</p>
  return (
    <ul className="progress-bars">
      {rows.map((row) => {
        const key = row.path || row.theme
        const meta = row.path
          ? `${row.completedLessons} de ${row.totalLessons} lecciones`
          : `${row.courses} ${row.courses === 1 ? 'curso' : 'cursos'} · ${row.completedLessons} de ${row.totalLessons} lecciones`
        const body = (
          <>
            <div className="progress-bars__label">
              <strong>{row.title || row.theme}</strong>
              {row.instructor ? <span>{row.instructor}</span> : null}
              <small>{meta}</small>
            </div>
            <div className="progress-bars__meter">
              <span style={{ width: `${row.percent}%` }} />
            </div>
            <em>{row.percent}%</em>
          </>
        )
        return (
          <li key={key}>
            {row.path ? (
              <button type="button" className="progress-bars__row" onClick={() => onOpen?.(row)}>
                {body}
              </button>
            ) : (
              <div className="progress-bars__row">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ProgressPage({ onNavigate, onOpenCourse }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const reload = useCallback(() => {
    window.api
      .getProgressPage()
      .then((page) => {
        setData(page)
        setError(false)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    return window.api.onProgressChanged?.(() => reload())
  }, [reload])

  const level = data?.level
  const stats = data?.stats
  const longestDetail =
    stats && stats.longestStreak > 0 && stats.currentStreak >= stats.longestStreak
      ? 'La llevas ahora'
      : 'Tu mejor racha'

  return (
    <div className="progress-page">
      <header className="progress-page__header">
        <div className="progress-page__brand">
          <h1>Progreso</h1>
          <AppNav active="progress" onSelect={onNavigate} />
        </div>
      </header>
      <main className="progress-page__main">
        {loading ? <p className="progress-empty">Cargando…</p> : null}
        {error ? (
          <div className="progress-empty">
            <p>No se pudo cargar el progreso.</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setLoading(true)
                reload()
              }}
            >
              Reintentar
            </button>
          </div>
        ) : null}
        {data && !error ? (
          <>
            <p className="progress-page__summary">{data.summary}</p>
            <section className="progress-level" aria-label="Nivel">
              <div className="progress-level__mark" aria-hidden="true">
                <span>Nivel</span>
                <strong>{level.level}</strong>
              </div>
              <div className="progress-level__name">
                <h2>{level.name}</h2>
                <p>
                  {level.lessonsToNext > 0
                    ? `${level.lessonsToNext} ${level.lessonsToNext === 1 ? 'lección' : 'lecciones'} para ${level.nextName}`
                    : 'Nivel máximo'}
                </p>
              </div>
              <ol className="progress-level__path">
                {level.steps.map((step) => (
                  <li
                    key={step.name}
                    className={step.current ? 'is-current' : step.reached ? 'is-reached' : ''}
                  >
                    <span className="progress-level__dot" />
                    <strong>{step.name}</strong>
                    <small>{step.threshold === 0 ? 'Inicio' : `${step.threshold} lecciones`}</small>
                  </li>
                ))}
              </ol>
            </section>

            <section className="progress-figures" aria-label="Resumen">
              <Figure
                label="Racha actual"
                value={stats.currentStreak}
                unit={stats.currentStreak === 1 ? 'día' : 'días'}
              >
                <WeekStrip days={stats.weekActivity} />
              </Figure>
              <Figure
                label="Racha más larga"
                value={stats.longestStreak}
                unit={stats.longestStreak === 1 ? 'día' : 'días'}
                detail={longestDetail}
              />
              <Figure
                label="Tiempo estudiando"
                value={stats.watch.value}
                unit={stats.watch.unit}
                detail={stats.watchDetail}
              />
              <Figure label="Lecciones hechas" value={stats.completedLessons} unit={`de ${stats.totalLessons}`}>
                <div className="progress-figure__meter" aria-hidden="true">
                  <span style={{ width: `${stats.percent}%` }} />
                </div>
                <p className="progress-figure__detail">{stats.percent}%</p>
              </Figure>
            </section>

            <section className="progress-activity" aria-labelledby="progress-activity-title">
              <div className="section-heading">
                <h2 id="progress-activity-title">Actividad</h2>
                <span className="progress-legend">
                  <i /> Sin lecciones <b /> Aprendidas
                </span>
              </div>
              <div className="progress-heat">
                <div
                  className="progress-heat__months"
                  style={{ gridTemplateColumns: `repeat(${data.heatmap.months.length}, minmax(0, 1fr))` }}
                >
                  {data.heatmap.months.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
                <div className="progress-heat__body">
                  <div className="progress-heat__days" aria-hidden="true">
                    <span>Lun</span>
                    <span />
                    <span>Mié</span>
                    <span />
                    <span>Vie</span>
                    <span />
                    <span />
                  </div>
                  <div
                    className="progress-heat__weeks"
                    style={{ gridTemplateColumns: `repeat(${data.heatmap.weeks.length}, minmax(11px, 1fr))` }}
                  >
                    {data.heatmap.weeks.map((week) => (
                      <div className="progress-heat__week" key={week[0].date}>
                        {week.map((day) => (
                          <span
                            key={day.date}
                            className={`progress-heat__cell${day.active ? ' is-on' : ''}${day.future ? ' is-future' : ''}`}
                            title={day.future ? undefined : day.date}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div className="progress-split">
              <section aria-labelledby="progress-courses-title">
                <div className="section-heading">
                  <h2 id="progress-courses-title">Cursos</h2>
                  <span>
                    {stats.inProgressCourses} en curso · {stats.completedCourses} completados
                  </span>
                </div>
                <BarList
                  rows={data.courses}
                  empty="Ningún curso con lecciones todavía."
                  onOpen={(row) => onOpenCourse?.({ path: row.path, title: row.title })}
                />
              </section>
              <section aria-labelledby="progress-themes-title">
                <div className="section-heading">
                  <h2 id="progress-themes-title">Temas</h2>
                </div>
                <BarList rows={data.themes} empty="Los temas aparecen cuando un curso los tiene." />
              </section>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default ProgressPage
