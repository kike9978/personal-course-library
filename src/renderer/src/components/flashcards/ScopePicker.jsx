import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../ui/cn'
import { lessonsInOrder, subtitleLanguages, subtitlesOf } from './scopeSources'

const small = 'text-[0.72rem] font-bold text-ink-soft'

function TriCheck({ checked, partial, label, onChange, disabled }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(partial) && !checked
  }, [checked, partial])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="shrink-0 accent-coral"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
    />
  )
}

function lessonPathsIn(section) {
  const out = (section.lessons || []).map((lesson) => lesson.relativePath)
  for (const child of section.sections || []) out.push(...lessonPathsIn(child))
  return out
}

function SectionRows({ section, depth, picked, toggle, disabled }) {
  const paths = lessonPathsIn(section)
  if (!paths.length) return null
  const count = paths.filter((path) => picked.has(path)).length
  return (
    <li>
      <label
        className="flex items-center gap-2 py-[0.2rem] text-[0.82rem] font-extrabold"
        style={{ paddingLeft: `${depth * 0.9}rem` }}
      >
        <TriCheck
          checked={count === paths.length}
          partial={count > 0}
          disabled={disabled}
          label={`Elegir ${section.title || 'sección'}`}
          onChange={() => toggle(paths, count !== paths.length)}
        />
        <span className="truncate">{section.title || 'Lecciones'}</span>
        <span className="text-[0.7rem] font-bold text-ink-soft">
          {count}/{paths.length}
        </span>
      </label>
      <ul className="m-0 list-none p-0">
        {(section.lessons || []).map((lesson) => (
          <li key={lesson.relativePath}>
            <label
              className="flex items-center gap-2 py-[0.1rem] text-[0.8rem]"
              style={{ paddingLeft: `${depth * 0.9 + 1.2}rem` }}
            >
              <input
                type="checkbox"
                className="shrink-0 accent-coral"
                checked={picked.has(lesson.relativePath)}
                disabled={disabled}
                onChange={() => toggle([lesson.relativePath], !picked.has(lesson.relativePath))}
              />
              <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
              {subtitlesOf(lesson).length ? (
                <span
                  className="rounded border border-ink/15 px-1 text-[0.62rem] font-extrabold text-ink-soft"
                  title="Tiene subtítulos"
                >
                  CC
                </span>
              ) : null}
            </label>
          </li>
        ))}
        {(section.sections || []).map((child) => (
          <SectionRows
            key={child.id || child.relativePath || child.title}
            section={child}
            depth={depth + 1}
            picked={picked}
            toggle={toggle}
            disabled={disabled}
          />
        ))}
      </ul>
    </li>
  )
}

/**
 * Choose what a deck is made from: a course, its sections or lessons,
 * and whether to use the notes, the subtitles, or both.
 */
function ScopePicker({ courses, value, onChange, disabled }) {
  const [tree, setTree] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const coursePath = value.coursePath

  useEffect(() => {
    if (!coursePath) {
      setTree(null)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError('')
    window.api
      .scanCourse(coursePath)
      .then((scanned) => {
        if (cancelled) return
        setTree(scanned)
        const lessons = lessonsInOrder(scanned)
        const langs = subtitleLanguages(lessons)
        onChange({
          tree: scanned,
          lessonPaths: new Set(lessons.map((lesson) => lesson.relativePath)),
          lang: langs[0]?.lang ?? '',
          useSubtitles: langs.length > 0
        })
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'No se pudo leer el curso')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // onChange is a fresh function each render; only a new course reloads the tree.
  }, [coursePath])

  const lessons = useMemo(() => lessonsInOrder(tree), [tree])
  const langs = useMemo(() => subtitleLanguages(lessons), [lessons])
  const picked = value.lessonPaths || new Set()
  const withSubs = lessons.filter(
    (lesson) => picked.has(lesson.relativePath) && subtitlesOf(lesson).length
  ).length

  const toggle = (paths, on) => {
    const next = new Set(picked)
    for (const path of paths) {
      if (on) next.add(path)
      else next.delete(path)
    }
    onChange({ lessonPaths: next })
  }

  const sortedCourses = useMemo(
    () =>
      [...(courses || [])].sort((a, b) =>
        String(a.title || a.path).localeCompare(String(b.title || b.path), 'es')
      ),
    [courses]
  )

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className={small}>Curso</span>
        <select
          className="rounded-md border border-ink/10 bg-surface px-3 py-[0.5rem] text-[0.88rem]"
          value={coursePath || ''}
          disabled={disabled}
          onChange={(event) => {
            const course = sortedCourses.find((item) => item.path === event.target.value)
            onChange({
              coursePath: event.target.value,
              courseTitle: course?.title || event.target.value,
              tree: null,
              lessonPaths: new Set()
            })
          }}
        >
          <option value="">Elige un curso…</option>
          {sortedCourses.map((course) => (
            <option key={course.path} value={course.path}>
              {course.title || course.path}
            </option>
          ))}
        </select>
      </label>

      {loading ? <p className="m-0 text-[0.82rem] text-ink-soft">Leyendo el curso…</p> : null}
      {error ? <p className="m-0 text-[0.82rem] font-bold text-coral-deep">{error}</p> : null}

      {tree && !loading ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.84rem]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-coral"
                checked={value.useNotes}
                disabled={disabled}
                onChange={(event) => onChange({ useNotes: event.target.checked })}
              />
              Mis notas
            </label>
            <label className={cn('flex items-center gap-2', !langs.length && 'opacity-50')}>
              <input
                type="checkbox"
                className="accent-coral"
                checked={value.useSubtitles && langs.length > 0}
                disabled={disabled || !langs.length}
                onChange={(event) => onChange({ useSubtitles: event.target.checked })}
              />
              Subtítulos
              {!langs.length ? ' (este curso no tiene)' : ` (${withSubs} lecciones)`}
            </label>
            {value.useSubtitles && langs.length > 1 ? (
              <select
                className="rounded-md border border-ink/10 bg-surface px-2 py-1 text-[0.8rem]"
                value={value.lang}
                disabled={disabled}
                onChange={(event) => onChange({ lang: event.target.value })}
                aria-label="Idioma de los subtítulos"
              >
                {langs.map((item) => (
                  <option key={item.lang} value={item.lang}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <span className={small}>
              {picked.size} de {lessons.length} lecciones
            </span>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-[0.78rem] font-bold text-coral-deep"
              disabled={disabled}
              onClick={() =>
                onChange({
                  lessonPaths:
                    picked.size === lessons.length
                      ? new Set()
                      : new Set(lessons.map((lesson) => lesson.relativePath))
                })
              }
            >
              {picked.size === lessons.length ? 'Quitar todas' : 'Elegir todas'}
            </button>
          </div>
          <ul className="m-0 max-h-[16rem] list-none overflow-auto rounded-md border border-ink/10 bg-surface p-2">
            {(tree.sections || []).map((section) => (
              <SectionRows
                key={section.id || section.relativePath || section.title}
                section={section}
                depth={0}
                picked={picked}
                toggle={toggle}
                disabled={disabled}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

export default ScopePicker
