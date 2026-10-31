import { useEffect, useMemo, useState, Fragment } from 'react'
import { toast } from 'react-hot-toast'
import NoteEditor from './NoteEditor'
import KnowledgeGraphView from './KnowledgeGraphView'
import { formatTime } from './StudySidePanel'
import { groupAnnotationsByTarget } from '../utils/annotationGroups'
import { buildLocalGraph, groupFindingsByTopic, relatedFindings } from '../../../shared/knowledgeGraph.js'

function noteTitleFallback(item) {
  if (!item) return 'Sin título'
  const first = String(item.body || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (first) return first.length > 72 ? `${first.slice(0, 72)}…` : first
  if (typeof item.timeSec === 'number') {
    return `${item.lessonTitle || 'Marca'} · ${formatTime(item.timeSec)}`
  }
  if (item.projectTitle) return item.projectTitle
  if (item.lessonTitle) return item.lessonTitle
  return 'Nota del curso'
}

function noteTitle(item) {
  const explicit = String(item?.title || '').trim()
  if (explicit) return explicit.length > 72 ? `${explicit.slice(0, 72)}…` : explicit
  return noteTitleFallback(item)
}

function topicTitlesOf(item, topics = []) {
  if (Array.isArray(item?.topics) && item.topics.length) {
    return item.topics.map((topic) => topic.title).filter(Boolean)
  }
  return (item?.topicIds || [])
    .map((id) => topics.find((topic) => topic.id === id)?.title)
    .filter(Boolean)
}

function sameSelection(item, selectedId) {
  if (!item || !selectedId) return false
  if (typeof selectedId === 'object') {
    return item.id === selectedId.id && (item.coursePath || null) === (selectedId.coursePath || null)
  }
  return item.id === selectedId
}

function formatDateTime(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

/**
 * Page list, note, and local graph. The graph stays beside the note.
 */
function AnnotationsWorkspace({
  title = 'Anotaciones',
  subtitle,
  annotations = [],
  selectedId,
  onSelect,
  onBack,
  onCreate,
  onSave,
  onDelete,
  onJump,
  onOpenPopOut,
  courseColumn = false,
  courseTitleByPath = {},
  preferGroupPath = null,
  preferGroupProjectId = null,
  loading = false,
  topics = [],
  corpus = null,
  onUpsertTopic
}) {
  const [query, setQuery] = useState('')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTopics, setDraftTopics] = useState([])
  const [topicQuery, setTopicQuery] = useState('')
  const [draft, setDraft] = useState({ text: '', markdown: '', json: null })
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [groupMode, setGroupMode] = useState('target')
  const [overlapOnly, setOverlapOnly] = useState(false)
  const [graphFocus, setGraphFocus] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return annotations
    return annotations.filter((item) => {
      const course = (courseTitleByPath[item.coursePath] || item.coursePath || '').toLowerCase()
      const hay = [
        item.title,
        item.body,
        item.lessonTitle,
        item.projectTitle,
        course,
        ...(item.topics || []).map((topic) => topic.title),
        noteTitle(item)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [annotations, query, courseTitleByPath])

  const libraryFindings = corpus || annotations

  const groups = useMemo(() => {
    if (groupMode === 'topic') {
      return groupFindingsByTopic(filtered, topics, {
        corpus: libraryFindings,
        overlapOnly
      })
    }
    return groupAnnotationsByTarget(filtered, {
      preferPath: preferGroupPath,
      preferProjectId: preferGroupProjectId,
      includeCourseKey: courseColumn
    })
  }, [
    filtered,
    groupMode,
    topics,
    libraryFindings,
    overlapOnly,
    preferGroupPath,
    preferGroupProjectId,
    courseColumn
  ])

  const isRowActive = (item) => sameSelection(item, selectedId)

  const selected = useMemo(() => {
    if (!selectedId) return null
    return annotations.find((item) => sameSelection(item, selectedId)) || null
  }, [annotations, selectedId])

  const mentionItems = useMemo(() => {
    const map = new Map()
    for (const topic of topics) {
      if (!topic?.id) continue
      map.set(`topic:${topic.id}`, {
        type: 'topic',
        id: topic.id,
        title: topic.title,
        subtitle: 'Tema'
      })
    }
    for (const item of annotations) {
      if (item.lessonRelativePath) {
        const key = `lesson:${item.lessonRelativePath}`
        if (!map.has(key)) {
          map.set(key, {
            type: 'lesson',
            id: item.lessonRelativePath,
            title: item.lessonTitle || item.lessonRelativePath,
            subtitle: 'Lección'
          })
        }
      }
      if (item.projectId) {
        const key = `project:${item.projectId}`
        if (!map.has(key)) {
          map.set(key, {
            type: 'project',
            id: item.projectId,
            title: item.projectTitle || item.projectId,
            subtitle: 'Proyecto'
          })
        }
      }
    }
    return [...map.values()]
  }, [annotations, topics])

  useEffect(() => {
    if (!selected) {
      setDraftTitle('')
      setDraftTopics([])
      setDraft({ text: '', markdown: '', json: null })
      setDirty(false)
      return
    }
    setDraftTitle(selected.title || '')
    setDraftTopics(topicTitlesOf(selected, topics))
    setTopicQuery('')
    setDraft({
      text: selected.body || '',
      markdown: selected.body || '',
      json: selected.bodyJson || null
    })
    setEditorKey((k) => k + 1)
    setDirty(false)
    // Only remount when switching notes — not after every save (updatedAt).
  }, [selected?.id, selected?.coursePath])

  useEffect(() => {
    setGraphFocus(null)
  }, [selected?.id, selected?.coursePath])

  const handleDraftChange = (next) => {
    setDraft({
      text: next.markdown || next.text || '',
      markdown: next.markdown || next.text || '',
      json: null
    })
    setDirty(true)
  }

  const handleTitleChange = (value) => {
    setDraftTitle(value)
    setDirty(true)
  }

  const displayName = (item) => {
    if (selected && isRowActive(item) && dirty) {
      const typed = draftTitle.trim()
      if (typed) return typed.length > 72 ? `${typed.slice(0, 72)}…` : typed
    }
    return noteTitle(item)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const topicIds = []
      const known = [...topics]
      for (const title of draftTopics) {
        const key = title.trim().toLowerCase()
        if (!key) continue
        let topic = known.find((item) => String(item.title || '').trim().toLowerCase() === key)
        if (!topic && onUpsertTopic) {
          topic = await onUpsertTopic({ title: title.trim() })
          if (topic) known.push(topic)
        }
        if (topic?.id && !topicIds.includes(topic.id)) topicIds.push(topic.id)
      }
      await onSave?.(selected, {
        title: draftTitle.trim() || null,
        body: (draft.markdown || draft.text || '').trim(),
        bodyHtml: null,
        bodyJson: null,
        topicIds
      })
      setDirty(false)
      toast.success('Guardado')
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    if (!selected) return
    try {
      const {
        buildNoteMarkdownDocument,
        noteExportBasename,
        listMarkdownNoteAssets,
        rewriteMarkdownAssetLinks
      } = await import('../utils/exportHelpers')

      const titleText = draftTitle.trim() || noteTitle(selected)
      const bodyMarkdown = draft.text || selected.body || ''
      const base = noteExportBasename(titleText)
      const assetDirName = `${base}.assets`

      const assetFiles = new Set(listMarkdownNoteAssets(bodyMarkdown).map((a) => a.file))
      const excalidrawRe = /!\[excalidraw:([^\]]*)\]/gi
      let m
      while ((m = excalidrawRe.exec(bodyMarkdown))) {
        const id = (m[1] || '').trim()
        if (id) {
          assetFiles.add(`${id}.png`)
          assetFiles.add(`${id}.excalidraw`)
        }
      }

      const portableBody = rewriteMarkdownAssetLinks(bodyMarkdown, assetDirName)
      const markdown = buildNoteMarkdownDocument({
        title: titleText,
        bodyMarkdown: portableBody,
        meta: {
          curso: courseTitleByPath[selected.coursePath] || selected.coursePath || null,
          archivo: selected.lessonTitle || selected.projectTitle || 'Del curso',
          proyecto: selected.projectTitle || null,
          tiempo:
            typeof selected.timeSec === 'number' ? formatTime(selected.timeSec) : null,
          creado: formatDateTime(selected.createdAt),
          actualizado:
            selected.updatedAt && selected.updatedAt !== selected.createdAt
              ? formatDateTime(selected.updatedAt)
              : null
        }
      })

      const result = await window.api.exportMarkdownBundle({
        defaultPath: `${base}.md`,
        markdown,
        assetFiles: [...assetFiles]
      })
      if (!result?.canceled) {
        toast.success(
          result.assetCount
            ? `Exportado (.md + ${result.assetCount} adjuntos)`
            : 'Anotación exportada (.md)'
        )
      }
    } catch (err) {
      toast.error(err.message || 'No se pudo exportar')
    }
  }

  const groupHeading = (group) => {
    if (group.topicId) {
      return group.courseCount > 1 ? `${group.title} · ${group.courseCount} cursos` : group.title
    }
    if (courseColumn && group.coursePath) {
      const courseName = courseTitleByPath[group.coursePath] || group.coursePath
      if (group.projectId) return `${courseName} · ${group.title}`
      if (!group.path) return `${courseName} · Del curso`
      return `${courseName} · ${group.title}`
    }
    return group.title
  }

  const jumpLabel = (item) => {
    if (typeof item.timeSec === 'number') {
      return `Ir al video · ${formatTime(item.timeSec)}`
    }
    if (item.projectId) return 'Abrir proyecto'
    if (item.lessonRelativePath) return 'Abrir archivo'
    return 'Abrir en curso'
  }

  const targetPropLabel = (item) => {
    if (item.projectId) return 'Proyecto'
    if (item.lessonRelativePath) return 'Archivo'
    return 'Archivo'
  }

  const targetPropValue = (item) => {
    if (item.projectId) return item.projectTitle || 'Proyecto'
    return item.lessonTitle || 'Del curso'
  }

  const related = useMemo(() => {
    if (!selected) return []
    return relatedFindings(selected, libraryFindings, topics)
  }, [selected, libraryFindings, topics])

  const graph = useMemo(() => {
    const focusType = graphFocus?.type || (selected ? 'finding' : null)
    const focusId = graphFocus?.id || selected?.id
    return buildLocalGraph({
      focusType,
      focusId,
      findings: libraryFindings,
      topics,
      courseTitles: courseTitleByPath,
      depth: 2
    })
  }, [graphFocus, selected, libraryFindings, topics, courseTitleByPath])

  const topicSuggestions = useMemo(() => {
    const q = topicQuery.trim().toLowerCase()
    const selectedKeys = new Set(draftTopics.map((title) => title.toLowerCase()))
    return topics
      .map((topic) => topic.title)
      .filter((title) => title && !selectedKeys.has(title.toLowerCase()))
      .filter((title) => !q || title.toLowerCase().includes(q))
      .slice(0, 6)
  }, [draftTopics, topicQuery, topics])

  const addTopicTitle = (title) => {
    const next = String(title || '').trim()
    if (!next) return
    setDraftTopics((current) => {
      if (current.some((item) => item.toLowerCase() === next.toLowerCase())) return current
      return [...current, next]
    })
    setTopicQuery('')
    setDirty(true)
  }

  const handleGraphNode = (node) => {
    if (node?.data?.kind === 'finding') {
      const finding = libraryFindings.find((item) => item.id === node.data.refId)
      if (finding) onSelect?.(finding)
      setGraphFocus(null)
      return
    }
    if (node?.data?.kind === 'topic') {
      setGraphFocus({ type: 'topic', id: node.data.refId })
    }
  }

  const createTopic = async (title) => {
    if (!onUpsertTopic) return null
    const topic = await onUpsertTopic({ title })
    return topic
  }

  return (
    <div className={`annotations-page${listCollapsed ? ' is-list-collapsed' : ''}`}>
      <header className="annotations-page__top">
        <div className="annotations-page__top-left">
          {onBack ? (
            <button type="button" className="icon-btn icon-btn--ghost" onClick={onBack}>
              ← Volver
            </button>
          ) : null}
          <div className="annotations-page__brand">
            <h1>{title}</h1>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className="annotations-page__top-actions">
          <div className="search-field annotations-page__search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar anotaciones"
              title="Buscar (Ctrl+F)"
            />
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            title="Mostrar learning-store.json en el explorador"
            onClick={async () => {
              try {
                await window.api.revealLearningStore()
              } catch (err) {
                toast.error(err.message || 'No se pudo abrir la ubicación')
              }
            }}
          >
            Abrir ubicación
          </button>
          {onOpenPopOut ? (
            <button
              type="button"
              className="btn btn--ghost"
              title="Abrir anotaciones en una ventana aparte"
              onClick={onOpenPopOut}
            >
              Ventana
            </button>
          ) : null}
          {onCreate ? (
            <button type="button" className="btn btn--primary" onClick={onCreate}>
              Nueva
            </button>
          ) : null}
        </div>
      </header>

      <div className="annotations-page__body">
        <aside className="annotations-page-list" aria-label="Lista de anotaciones">
          <div className="annotations-page-list__bar">
            <button
              type="button"
              className="annotations-page__icon-btn"
              onClick={() => setListCollapsed((value) => !value)}
              title={listCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
            >
              {listCollapsed ? '»' : '«'}
            </button>
            {!listCollapsed ? (
              <span className="annotations-page-list__count">{filtered.length}</span>
            ) : null}
          </div>
          {!listCollapsed ? (
            <>
              <div className="annotations-table-pane__filters">
                <label>
                  Agrupar
                  <select value={groupMode} onChange={(event) => setGroupMode(event.target.value)}>
                    <option value="target">Por archivo</option>
                    <option value="topic">Por tema</option>
                  </select>
                </label>
                <label className="annotations-table-pane__check">
                  <input
                    type="checkbox"
                    checked={overlapOnly}
                    onChange={(event) => {
                      setOverlapOnly(event.target.checked)
                      if (event.target.checked) setGroupMode('topic')
                    }}
                  />
                  Cruces
                </label>
              </div>
              <div className="annotations-page-list__items">
                {loading ? (
                  <p className="annotations-page-list__empty">Cargando…</p>
                ) : filtered.length === 0 ? (
                  <p className="annotations-page-list__empty">
                    {annotations.length === 0 ? 'Aún no hay anotaciones.' : 'Ningún resultado.'}
                  </p>
                ) : groups.length === 0 ? (
                  <p className="annotations-page-list__empty">Ningún cruce entre cursos.</p>
                ) : (
                  groups.map((group) => (
                    <Fragment key={group.key}>
                      <div className="annotations-page-list__group">{groupHeading(group)}</div>
                      {group.items.map((item) => (
                        <button
                          key={`${group.key}-${item.coursePath || 'local'}-${item.id}`}
                          type="button"
                          className={`annotations-page-list__item${isRowActive(item) ? ' is-active' : ''}`}
                          onClick={() => onSelect?.(item)}
                        >
                          <span>{displayName(item)}</span>
                          {courseColumn ? (
                            <small>
                              {item.coursePath
                                ? courseTitleByPath[item.coursePath] || item.coursePath
                                : 'Sin curso'}
                            </small>
                          ) : null}
                        </button>
                      ))}
                    </Fragment>
                  ))
                )}
              </div>
            </>
          ) : null}
        </aside>

        <main className="annotations-doc-pane">
          {!selected ? (
            <div className="annotations-doc-pane__empty">
              <h2>Selecciona una anotación</h2>
              <p>Abre una fila de la tabla o crea una nueva para editarla aquí.</p>
            </div>
          ) : (
            <div className="annotations-doc">
              <div className="annotations-doc__toolbar">
                <div className="annotations-doc__toolbar-left">
                  {onJump && selected.coursePath ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => onJump(selected)}
                    >
                      {jumpLabel(selected)}
                    </button>
                  ) : null}
                </div>
                <div className="annotations-doc__toolbar-right">
                  {dirty ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--ghost" onClick={handleExport}>
                    Exportar
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onDelete?.(selected)}
                  >
                    Borrar
                  </button>
                </div>
              </div>

              <input
                key={`title-${selected.id}`}
                className="annotations-doc__title-input"
                value={draftTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={noteTitleFallback(selected)}
                aria-label="Título de la anotación"
                autoFocus
              />

              <div className="annotations-doc__props">
                <div className="annotations-doc__prop">
                  <span className="annotations-doc__prop-label">Fecha de creación</span>
                  <span>{formatDateTime(selected.createdAt)}</span>
                </div>
                {courseColumn ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">Curso</span>
                    <span>
                      {selected.coursePath
                        ? courseTitleByPath[selected.coursePath] || selected.coursePath
                        : 'Sin curso'}
                    </span>
                  </div>
                ) : null}
                {selected.coursePath || selected.lessonRelativePath || selected.projectId ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">{targetPropLabel(selected)}</span>
                    <span>{targetPropValue(selected)}</span>
                  </div>
                ) : null}
                {typeof selected.timeSec === 'number' ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">Tiempo</span>
                    <span>{formatTime(selected.timeSec)}</span>
                  </div>
                ) : null}
                {selected.updatedAt && selected.updatedAt !== selected.createdAt ? (
                  <div className="annotations-doc__prop">
                    <span className="annotations-doc__prop-label">Actualizado</span>
                    <span>{formatDateTime(selected.updatedAt)}</span>
                  </div>
                ) : null}
                {(selected.anchors || []).length > 1 ? (
                  <div className="annotations-doc__prop annotations-doc__prop--wide">
                    <span className="annotations-doc__prop-label">También anclada en</span>
                    <span>
                      {selected.anchors
                        .filter((anchor) => anchor.coursePath && anchor.coursePath !== selected.coursePath)
                        .map((anchor) => courseTitleByPath[anchor.coursePath] || anchor.coursePath)
                        .join(' · ') || 'varios puntos'}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="annotations-topics">
                <span className="annotations-doc__prop-label">Temas</span>
                <div className="annotations-topics__chips">
                  {draftTopics.map((title) => (
                    <button
                      key={title}
                      type="button"
                      className="annotations-topics__chip"
                      onClick={() => {
                        setDraftTopics((current) => current.filter((item) => item !== title))
                        setDirty(true)
                      }}
                      title="Quitar tema"
                    >
                      {title}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  ))}
                  <input
                    className="annotations-topics__input"
                    value={topicQuery}
                    placeholder="Añadir tema"
                    aria-label="Añadir tema"
                    onChange={(event) => setTopicQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault()
                        addTopicTitle(topicQuery)
                      }
                    }}
                  />
                </div>
                {topicQuery.trim() && topicSuggestions.length ? (
                  <div className="annotations-topics__suggest">
                    {topicSuggestions.map((title) => (
                      <button key={title} type="button" onClick={() => addTopicTitle(title)}>
                        {title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="annotations-doc__editor">
                <NoteEditor
                  key={`${selected.id}-${editorKey}`}
                  editorKey={`${selected.id}-${editorKey}`}
                  variant="document"
                  bodyText={draft.text}
                  bodyJson={draft.json}
                  placeholder="Escribe tu anotación… Escribe @ para mencionar un tema."
                  onChange={handleDraftChange}
                  enableTimestamp={typeof selected.timeSec === 'number'}
                  currentTimeSec={
                    typeof selected.timeSec === 'number' ? selected.timeSec : 0
                  }
                  onSeekTimestamp={
                    onJump
                      ? (timeSec) => onJump({ ...selected, timeSec })
                      : null
                  }
                  mentionItems={mentionItems}
                  onCreateTopic={onUpsertTopic ? createTopic : null}
                />
              </div>

              {related.length ? (
                <div className="annotations-related">
                  <span className="annotations-doc__prop-label">Referencias vinculadas</span>
                  <ul>
                    {related.map(({ finding, topics: shared }) => (
                      <li key={finding.id}>
                        <button type="button" onClick={() => onSelect?.(finding)}>
                          <strong>{noteTitle(finding)}</strong>
                          <span>
                            {(finding.anchors || [])
                              .map((anchor) => courseTitleByPath[anchor.coursePath] || anchor.coursePath)
                              .filter(Boolean)
                              .filter((value, index, all) => all.indexOf(value) === index)
                              .join(' · ')}
                            {shared.length ? ` · ${shared.map((topic) => topic.title).join(', ')}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </main>

        <aside className="annotations-graph-pane" aria-label="Grafo de la anotación">
          <div className="annotations-graph-pane__bar">
            <span>Grafo</span>
            {graphFocus?.type === 'topic' ? (
              <button type="button" className="btn btn--ghost" onClick={() => setGraphFocus(null)}>
                Volver
              </button>
            ) : null}
          </div>
          <KnowledgeGraphView
            nodes={graph.nodes}
            edges={graph.edges}
            truncated={graph.truncated}
            onNodeClick={handleGraphNode}
          />
        </aside>
      </div>
    </div>
  )
}

export { noteTitle, formatDateTime }
export default AnnotationsWorkspace
