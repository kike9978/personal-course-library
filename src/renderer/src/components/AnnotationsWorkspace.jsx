import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import NoteEditor from './NoteEditor'
import { NotionSyncConflict, NotionSyncNoteButton } from './NotionSyncControl'
import { TreeSection } from './LessonTree'
import KnowledgeGraphView from './KnowledgeGraphView'
import { formatTime } from './StudySidePanel'
import { groupAnnotationsByTarget } from '../utils/annotationGroups'
import { buildAnnotationTree, openIdsForItem } from '../utils/annotationTree'
import {
  buildGlobalGraph,
  clampDepth,
  clampLabelZoom,
  clampLinkDistance,
  LABEL_ZOOM,
  LABEL_ZOOM_MAX,
  LABEL_ZOOM_MIN,
  groupFindingsByTopic,
  backlinksTo,
  hashtagTitlesFromBody,
  resolveCourseTitle,
  topicKey,
  noteDisplayTitles,
  visibleGraph
} from '../../../shared/knowledgeGraph.js'

function clipTitle(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > 72 ? `${text.slice(0, 72)}…` : text
}

function noteTitle(item, labels) {
  const explicit = String(item?.title || '').trim()
  if (explicit) return clipTitle(explicit)
  return clipTitle(labels?.get?.(item?.id) || 'new note')
}

function topicTitlesOf(item, topics = []) {
  if (Array.isArray(item?.topics) && item.topics.length) {
    return item.topics.map((topic) => topic.title).filter(Boolean)
  }
  return (item?.topicIds || [])
    .map((id) => topics.find((topic) => topic.id === id)?.title)
    .filter(Boolean)
}

function AnnotationBranch({
  node,
  nested,
  collapsedIds,
  onToggle,
  isRowActive,
  displayName,
  onOpen
}) {
  const open = !collapsedIds.has(node.id)
  return (
    <TreeSection
      id={node.id}
      idPrefix="ann-section"
      title={node.title}
      open={open}
      nested={nested}
      dense
      onToggle={() => onToggle(node.id)}
    >
      {node.children?.map((child) => (
        <AnnotationBranch
          key={child.id}
          node={child}
          nested
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          isRowActive={isRowActive}
          displayName={displayName}
          onOpen={onOpen}
        />
      ))}
      {node.items?.map((item) => (
        <button
          key={`${node.id}-${item.coursePath || 'local'}-${item.id}`}
          type="button"
          className={`annotations-page-list__item${isRowActive(item) ? ' is-active' : ''}`}
          onClick={() => onOpen(item)}
        >
          <span>{displayName(item)}</span>
          {item.notion?.conflict ? <small>Conflicto con Notion</small> : null}
        </button>
      ))}
    </TreeSection>
  )
}

function sameSelection(item, selectedId) {
  if (!item || !selectedId) return false
  if (typeof selectedId === 'object') {
    return (
      item.id === selectedId.id && (item.coursePath || null) === (selectedId.coursePath || null)
    )
  }
  return item.id === selectedId
}

function noteKey(item) {
  if (!item) return null
  return `${item.coursePath || ''}::${item.id}`
}

function snapshotMatchesCurrent(snapshot, draft, draftTitle, draftTopics) {
  const snapBody = String(snapshot?.draft?.markdown || snapshot?.draft?.text || '').trim()
  const curBody = String(draft?.markdown || draft?.text || '').trim()
  const snapTitle = String(snapshot?.title || '').trim()
  const curTitle = String(draftTitle || '').trim()
  const snapTopics = JSON.stringify(snapshot?.topics || [])
  const curTopics = JSON.stringify(draftTopics || [])
  return snapBody === curBody && snapTitle === curTitle && snapTopics === curTopics
}

function saveStatusLabel(status) {
  if (status === 'unsaved') return 'Sin guardar'
  if (status === 'saving') return 'Guardando…'
  if (status === 'saved') return 'Guardado'
  if (status === 'error') return 'No se pudo guardar'
  return ''
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
 * Page list, note, and the connections beside the note.
 */
const GRAPH_SETTINGS_KEY = 'pcl.graph.node-visibility'
const GRAPH_WIDTH_KEY = 'pcl.graph.pane-width'
const GRAPH_PANE_MIN = 280
const GRAPH_PANE_DEFAULT = 420
const NODE_SCALE_MIN = 0.6
const NODE_SCALE_MAX = 2

function clampNodeScale(scale) {
  const value = Number(scale)
  if (!Number.isFinite(value)) return 1
  const clamped = Math.min(NODE_SCALE_MAX, Math.max(NODE_SCALE_MIN, value))
  return Math.round(clamped * 10) / 10
}

function clampGraphWidth(width, maxAvailable = 1400) {
  const max = Math.max(GRAPH_PANE_MIN, maxAvailable)
  return Math.min(max, Math.max(GRAPH_PANE_MIN, Math.round(width)))
}

function readStoredGraphWidth() {
  try {
    const stored = Number(localStorage.getItem(GRAPH_WIDTH_KEY))
    if (Number.isFinite(stored) && stored >= GRAPH_PANE_MIN) return Math.round(stored)
  } catch {
    // Width is only a layout preference.
  }
  return null
}

function readGraphSettings() {
  const defaults = {
    depth: 1,
    linkDistance: 72,
    nodeScale: 1,
    showArrows: false,
    showLabels: true,
    labelZoom: LABEL_ZOOM,
    showCourses: true,
    showFiles: true,
    showOrphans: true
  }
  try {
    const stored = JSON.parse(localStorage.getItem(GRAPH_SETTINGS_KEY) || 'null')
    if (!stored || typeof stored !== 'object') return defaults
    return {
      depth: clampDepth(stored.depth),
      linkDistance: clampLinkDistance(stored.linkDistance),
      nodeScale: clampNodeScale(stored.nodeScale),
      showArrows: stored.showArrows === true,
      showLabels: stored.showLabels !== false,
      labelZoom: clampLabelZoom(stored.labelZoom),
      showCourses: stored.showCourses !== false,
      showFiles: stored.showFiles !== false,
      showOrphans: stored.showOrphans !== false
    }
  } catch {
    return defaults
  }
}

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
  programs = [],
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
  const [saveStatus, setSaveStatus] = useState('idle')
  const [groupMode, setGroupMode] = useState('target')
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const [graphPrefs] = useState(readGraphSettings)
  const [graphDepth, setGraphDepth] = useState(graphPrefs.depth)
  const [linkDistance, setLinkDistance] = useState(graphPrefs.linkDistance)
  const [nodeScale, setNodeScale] = useState(graphPrefs.nodeScale)
  const [showArrows, setShowArrows] = useState(graphPrefs.showArrows)
  const [showLabels, setShowLabels] = useState(graphPrefs.showLabels)
  const [labelZoom, setLabelZoom] = useState(graphPrefs.labelZoom)
  const [showCourses, setShowCourses] = useState(graphPrefs.showCourses)
  const [showFiles, setShowFiles] = useState(graphPrefs.showFiles)
  const [showOrphans, setShowOrphans] = useState(graphPrefs.showOrphans)
  const [graphSelection, setGraphSelection] = useState(null)
  const [graphReset, setGraphReset] = useState(0)
  const [graphWidth, setGraphWidth] = useState(() => readStoredGraphWidth() ?? GRAPH_PANE_DEFAULT)
  const [graphResizing, setGraphResizing] = useState(false)
  const bodyRef = useRef(null)
  const graphWidthRef = useRef(graphWidth)
  const graphPreferredRef = useRef(readStoredGraphWidth())
  const listCollapsedRef = useRef(listCollapsed)
  graphWidthRef.current = graphWidth
  listCollapsedRef.current = listCollapsed
  const [tagViewId, setTagViewId] = useState(null)
  const [jsonTitles, setJsonTitles] = useState({})
  const titles = useMemo(
    () => ({ ...courseTitleByPath, ...jsonTitles }),
    [courseTitleByPath, jsonTitles]
  )

  useEffect(() => {
    try {
      localStorage.setItem(
        GRAPH_SETTINGS_KEY,
        JSON.stringify({
          depth: graphDepth,
          linkDistance,
          nodeScale,
          showArrows,
          showLabels,
          labelZoom,
          showCourses,
          showFiles,
          showOrphans
        })
      )
    } catch {
      // The controls still apply for this session.
    }
  }, [
    graphDepth,
    linkDistance,
    nodeScale,
    showArrows,
    showLabels,
    labelZoom,
    showCourses,
    showFiles,
    showOrphans
  ])

  const graphRoomMax = useCallback((body = bodyRef.current) => {
    const list = listCollapsedRef.current ? 48 : 220
    return Math.max(
      GRAPH_PANE_MIN,
      (body?.clientWidth || GRAPH_PANE_DEFAULT + list + 320) - list - 280
    )
  }, [])

  const applyGraphWidth = useCallback(() => {
    const body = bodyRef.current
    const max = graphRoomMax(body)
    const list = listCollapsedRef.current ? 48 : 220
    const preferred = graphPreferredRef.current
    const base =
      preferred == null
        ? Math.round(Math.max(0, (body?.clientWidth || 0) - list) * 0.34)
        : preferred
    setGraphWidth(clampGraphWidth(base || GRAPH_PANE_DEFAULT, max))
  }, [graphRoomMax])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return undefined
    applyGraphWidth()
    const observer = new ResizeObserver(() => applyGraphWidth())
    observer.observe(body)
    return () => observer.disconnect()
  }, [applyGraphWidth, listCollapsed])

  const onGraphResizeStart = useCallback(
    (event) => {
      if (event.button != null && event.button !== 0) return
      if (window.matchMedia('(max-width: 900px)').matches) return
      event.preventDefault()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      const startX = event.clientX
      const startWidth = graphWidthRef.current
      const max = graphRoomMax()
      setGraphResizing(true)

      const onMove = (moveEvent) => {
        const next = clampGraphWidth(startWidth + startX - moveEvent.clientX, max)
        graphPreferredRef.current = next
        setGraphWidth(next)
      }
      const onUp = () => {
        setGraphResizing(false)
        const next = graphPreferredRef.current
        if (next != null) {
          try {
            localStorage.setItem(GRAPH_WIDTH_KEY, String(next))
          } catch {
            // The width still applies for this session.
          }
        }
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
        handle.removeEventListener('pointercancel', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
      handle.addEventListener('pointercancel', onUp)
    },
    [graphRoomMax]
  )

  const onGraphResizeKey = useCallback(
    (event) => {
      const step = event.shiftKey ? 48 : 16
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? step : -step
      const next = clampGraphWidth(graphWidthRef.current + delta, graphRoomMax())
      graphPreferredRef.current = next
      setGraphWidth(next)
      try {
        localStorage.setItem(GRAPH_WIDTH_KEY, String(next))
      } catch {
        // The width still applies for this session.
      }
    },
    [graphRoomMax]
  )

  const resetGraphWidth = useCallback(() => {
    graphPreferredRef.current = null
    try {
      localStorage.removeItem(GRAPH_WIDTH_KEY)
    } catch {
      // The default width still applies for this session.
    }
    applyGraphWidth()
  }, [applyGraphWidth])

  const libraryFindings = corpus || annotations
  const titleLabels = useMemo(() => noteDisplayTitles(libraryFindings), [libraryFindings])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return annotations
    return annotations.filter((item) => {
      const course = resolveCourseTitle(item.coursePath, titles).toLowerCase()
      const hay = [
        item.title,
        item.body,
        item.lessonTitle,
        item.projectTitle,
        course,
        ...(item.topics || []).map((topic) => topic.title),
        noteTitle(item, titleLabels)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [annotations, query, titleLabels, titles])

  useEffect(() => {
    const pending = []
    const seen = new Set()
    for (const finding of libraryFindings) {
      for (const anchor of finding.anchors || []) {
        const coursePath = anchor.coursePath
        if (!coursePath || seen.has(coursePath)) continue
        seen.add(coursePath)
        const known = resolveCourseTitle(coursePath, courseTitleByPath)
        const folder = String(coursePath).split(/[\\/]/).filter(Boolean).pop()
        if (known && known !== coursePath && known !== folder) continue
        pending.push(coursePath)
      }
    }
    if (!pending.length || !window.api?.getCourse) return undefined
    let cancelled = false
    Promise.all(
      pending.map(async (coursePath) => {
        try {
          const data = await window.api.getCourse(coursePath)
          const title = String(data?.title || '').trim()
          return title ? [coursePath, title] : null
        } catch {
          return null
        }
      })
    ).then((pairs) => {
      if (cancelled) return
      const next = {}
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1]
      }
      setJsonTitles(next)
    })
    return () => {
      cancelled = true
    }
  }, [libraryFindings, courseTitleByPath])

  const groups = useMemo(() => {
    if (groupMode === 'topic') {
      return groupFindingsByTopic(filtered, topics, {
        corpus: libraryFindings
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
    preferGroupPath,
    preferGroupProjectId,
    courseColumn
  ])

  const listTree = useMemo(
    () => buildAnnotationTree(groups, { groupMode, courseColumn, titles }),
    [groups, groupMode, courseColumn, titles]
  )

  useEffect(() => {
    if (!selectedId) return
    const openIds = openIdsForItem(listTree, (item) => sameSelection(item, selectedId))
    if (!openIds?.length) return
    setCollapsedIds((prev) => {
      if (openIds.every((id) => !prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of openIds) next.delete(id)
      return next
    })
  }, [selectedId, listTree])

  const toggleTreeNode = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isRowActive = (item) => sameSelection(item, selectedId)

  const selected = useMemo(() => {
    if (!selectedId) return null
    return annotations.find((item) => sameSelection(item, selectedId)) || null
  }, [annotations, selectedId])

  const selectedRef = useRef(null)
  const draftRef = useRef(draft)
  const draftTitleRef = useRef(draftTitle)
  const draftTopicsRef = useRef(draftTopics)
  const topicQueryRef = useRef(topicQuery)
  const topicsRef = useRef(topics)
  const dirtyRef = useRef(dirty)
  const savingRef = useRef(saving)
  const persistRef = useRef(null)
  const pendingFlushRef = useRef(null)
  const appliedPullRef = useRef(0)
  const saveTimerRef = useRef(null)

  draftRef.current = draft
  draftTitleRef.current = draftTitle
  draftTopicsRef.current = draftTopics
  topicQueryRef.current = topicQuery
  topicsRef.current = topics
  dirtyRef.current = dirty
  savingRef.current = saving

  const commitTopicTitle = (title) => {
    const next = String(title || '').trim()
    const current = draftTopicsRef.current || []
    if (!next) return current
    if (current.some((item) => item.toLowerCase() === next.toLowerCase())) return current
    const updated = [...current, next]
    draftTopicsRef.current = updated
    setDraftTopics(updated)
    return updated
  }

  const flushPendingTopic = () => {
    const pending = String(topicQueryRef.current || '').trim()
    if (pending) {
      commitTopicTitle(pending)
      topicQueryRef.current = ''
      setTopicQuery('')
    }
    return draftTopicsRef.current || []
  }

  const currentSnapshot = () => ({
    title: draftTitleRef.current,
    draft: draftRef.current,
    topics: flushPendingTopic()
  })

  const scheduleSave = () => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const item = selectedRef.current
      if (!item || !dirtyRef.current) return
      void persistRef.current?.(item, currentSnapshot(), { silent: true })
    }, 800)
  }

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
    for (const item of libraryFindings) {
      if (!item?.id || item.id === selected?.id) continue
      map.set(`note:${item.id}`, {
        type: 'note',
        id: item.id,
        title: noteTitle(item, titleLabels),
        subtitle: 'Nota'
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
  }, [annotations, libraryFindings, selected?.id, titleLabels, topics])

  const persistNote = useCallback(
    async (item, incoming, { silent = true } = {}) => {
      if (!item) return
      const key = noteKey(item)
      const snapshot = noteKey(selectedRef.current) === key ? currentSnapshot() : incoming
      if (savingRef.current) {
        pendingFlushRef.current = { item, snapshot, silent }
        return
      }
      savingRef.current = true
      if (noteKey(selectedRef.current) === key) {
        setSaving(true)
        setSaveStatus('saving')
      }
      try {
        const body = String(snapshot.draft?.markdown || snapshot.draft?.text || '').trim()
        const topicTitles = [...(snapshot.topics || [])]
        for (const title of hashtagTitlesFromBody(body)) {
          if (!topicTitles.some((item) => topicKey(item) === topicKey(title)))
            topicTitles.push(title)
        }
        if (noteKey(selectedRef.current) === key) {
          draftTopicsRef.current = topicTitles
          setDraftTopics(topicTitles)
        }
        const topicIds = []
        const known = [...(topicsRef.current || [])]
        for (const title of topicTitles) {
          const key = topicKey(title)
          if (!key) continue
          let topic = known.find((entry) => topicKey(entry.title) === key)
          if (!topic && onUpsertTopic) {
            topic = await onUpsertTopic({ title: title.trim() })
            if (topic) known.push(topic)
          }
          if (topic?.id && !topicIds.includes(topic.id)) topicIds.push(topic.id)
        }
        await onSave?.(item, {
          title: String(snapshot.title || '').trim() || null,
          body,
          bodyHtml: null,
          bodyJson: null,
          topicIds
        })
        if (noteKey(selectedRef.current) === key) {
          if (
            snapshotMatchesCurrent(
              { ...snapshot, topics: topicTitles },
              draftRef.current,
              draftTitleRef.current,
              draftTopicsRef.current
            )
          ) {
            setDirty(false)
            setSaveStatus('saved')
          } else {
            setSaveStatus('unsaved')
          }
        }
        if (!silent) toast.success('Guardado')
      } catch (err) {
        if (noteKey(selectedRef.current) === key) {
          setSaveStatus('error')
        }
        toast.error(err.message || 'No se pudo guardar')
      } finally {
        savingRef.current = false
        if (noteKey(selectedRef.current) === key) {
          setSaving(false)
        }
        const queued = pendingFlushRef.current
        pendingFlushRef.current = null
        if (queued) {
          void persistRef.current?.(queued.item, queued.snapshot, { silent: queued.silent })
        } else if (dirtyRef.current && noteKey(selectedRef.current) === key) {
          scheduleSave()
        }
      }
    },
    [onSave, onUpsertTopic]
  )

  persistRef.current = persistNote

  useEffect(() => {
    const prev = selectedRef.current
    const next = selected
    if (dirtyRef.current && prev && noteKey(prev) !== noteKey(next)) {
      clearTimeout(saveTimerRef.current)
      void persistRef.current?.(prev, currentSnapshot(), { silent: true })
    }
    selectedRef.current = next
    appliedPullRef.current = next?.notion?.pulledAt || 0

    if (!next) {
      setDraftTitle('')
      setDraftTopics([])
      setDraft({ text: '', markdown: '', json: null })
      setDirty(false)
      setSaveStatus('idle')
      return
    }
    setDraftTitle(next.title || '')
    setDraftTopics(topicTitlesOf(next, topics))
    setTopicQuery('')
    setDraft({
      text: next.body || '',
      markdown: next.body || '',
      json: next.bodyJson || null
    })
    setEditorKey((k) => k + 1)
    setDirty(false)
    setSaveStatus('idle')
    // Only remount when switching notes — not after every save (updatedAt).
  }, [selected?.id, selected?.coursePath])

  useEffect(() => {
    if (!selected) return
    const stamp = selected.notion?.pulledAt || 0
    if (!stamp || stamp === appliedPullRef.current) return
    appliedPullRef.current = stamp
    if (dirtyRef.current) return
    const title = selected.title || ''
    draftTitleRef.current = title
    setDraftTitle(title)
    setDraftTopics(topicTitlesOf(selected, topics))
    setDraft({
      text: selected.body || '',
      markdown: selected.body || '',
      json: null
    })
    setEditorKey((key) => key + 1)
    setDirty(false)
    setSaveStatus('idle')
  }, [selected, dirty, topics])

  useEffect(() => {
    if (saveStatus !== 'saved') return
    const timer = setTimeout(() => {
      setSaveStatus((current) => (current === 'saved' ? 'idle' : current))
    }, 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  useEffect(() => {
    const onLeave = () => {
      if (!dirtyRef.current || !selectedRef.current) return
      void persistRef.current?.(selectedRef.current, currentSnapshot(), { silent: true })
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      onLeave()
    }
  }, [])

  const markDirty = () => {
    setDirty(true)
    setSaveStatus('unsaved')
    scheduleSave()
  }

  const handleDraftChange = (next) => {
    const text = next.markdown || next.text || ''
    const prev = draftRef.current?.markdown || draftRef.current?.text || ''
    if (text === prev) return
    setDraft({
      text,
      markdown: text,
      json: null
    })
    markDirty()
  }

  const handleTitleChange = (value) => {
    draftTitleRef.current = value
    setDraftTitle(value)
    markDirty()
  }

  const displayName = (item) => {
    if (selected && isRowActive(item) && dirty) {
      const typed = draftTitle.trim()
      if (typed) return typed.length > 72 ? `${typed.slice(0, 72)}…` : typed
    }
    return noteTitle(item, titleLabels)
  }

  const handleSave = () => {
    if (!selected) return
    clearTimeout(saveTimerRef.current)
    void persistNote(selected, currentSnapshot(), { silent: true })
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

      const titleText = draftTitle.trim() || noteTitle(selected, titleLabels)
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
          curso: selected.coursePath ? resolveCourseTitle(selected.coursePath, titles) : null,
          archivo: selected.lessonTitle || selected.projectTitle || 'Del curso',
          proyecto: selected.projectTitle || null,
          tiempo: typeof selected.timeSec === 'number' ? formatTime(selected.timeSec) : null,
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
    return backlinksTo(selected, libraryFindings)
  }, [selected, libraryFindings])

  const graph = useMemo(
    () =>
      buildGlobalGraph({
        viewMode: 'topics',
        findings: libraryFindings,
        topics,
        courseTitles: titles
      }),
    [libraryFindings, topics, titles]
  )

  const graphVisibility = useMemo(
    () =>
      visibleGraph({
        nodes: graph.nodes,
        edges: graph.edges,
        selectedId: graphSelection,
        depth: graphDepth,
        viewMode: graph.viewMode
      }),
    [graph, graphSelection, graphDepth]
  )

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
    const before = draftTopicsRef.current || []
    const updated = commitTopicTitle(next)
    topicQueryRef.current = ''
    setTopicQuery('')
    if (updated !== before) markDirty()
  }

  const findingForNode = (node) =>
    libraryFindings.find((item) => item.id === node?.data?.refId) || null

  const jumpTarget = (node) =>
    node?.data?.kind === 'file'
      ? {
          coursePath: node.data.coursePath,
          lessonRelativePath: node.data.lessonRelativePath,
          projectId: node.data.projectId
        }
      : { coursePath: node?.data?.refId }

  const handleGraphNode = (node) => {
    if (!node) return
    setGraphSelection((current) => (current === node.id ? null : node.id))
  }

  const tagViewNotes = useMemo(() => {
    if (!tagViewId) return []
    return libraryFindings
      .filter((finding) => (finding.topicIds || []).includes(tagViewId))
      .sort((a, b) =>
        noteTitle(a, titleLabels).localeCompare(noteTitle(b, titleLabels), undefined, {
          sensitivity: 'base'
        })
      )
  }, [tagViewId, libraryFindings, titleLabels])

  const tagViewTitle = topics.find((topic) => topic.id === tagViewId)?.title || 'Tag'

  const openFinding = (finding) => {
    setTagViewId(null)
    if (finding) onSelect?.(finding)
  }

  const handleGraphActivate = (node) => {
    if (!node) return
    setGraphSelection(node.id)
    if (node.data?.kind === 'topic') {
      setTagViewId(node.data.refId)
      return
    }
    if (node.data?.kind === 'finding') {
      openFinding(findingForNode(node))
      return
    }
    if (node.data?.kind === 'course' || node.data?.kind === 'file') onJump?.(jumpTarget(node))
  }

  const handleGraphShift = (node) => {
    if (!node) return
    setGraphSelection(node.id)
    if (node.data?.kind === 'finding') {
      const finding = findingForNode(node)
      if (finding) onJump?.(finding)
      return
    }
    if (node.data?.kind === 'course' || node.data?.kind === 'file') onJump?.(jumpTarget(node))
  }

  const createTopic = async (title) => {
    if (!onUpsertTopic) return null
    const topic = await onUpsertTopic({ title })
    if (topic?.title) addTopicTitle(topic.title)
    return topic
  }

  return (
    <div
      className={`annotations-page${listCollapsed ? ' is-list-collapsed' : ''}${graphResizing ? ' is-graph-resizing' : ''}`}
    >
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

      <div
        className="annotations-page__body"
        ref={bodyRef}
        style={{ '--annotations-graph-w': `${graphWidth}px` }}
      >
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
              </div>
              <div className="annotations-page-list__items">
                {loading ? (
                  <p className="annotations-page-list__empty">Cargando…</p>
                ) : filtered.length === 0 ? (
                  <p className="annotations-page-list__empty">
                    {annotations.length === 0 ? 'Aún no hay anotaciones.' : 'Ningún resultado.'}
                  </p>
                ) : (
                  listTree.map((node) => (
                    <AnnotationBranch
                      key={node.id}
                      node={node}
                      collapsedIds={collapsedIds}
                      onToggle={toggleTreeNode}
                      isRowActive={isRowActive}
                      displayName={displayName}
                      onOpen={openFinding}
                    />
                  ))
                )}
              </div>
            </>
          ) : null}
        </aside>

        <main className="annotations-doc-pane">
          {tagViewId ? (
            <div className="annotations-tag-view">
              <div className="annotations-tag-view__bar">
                <button type="button" className="btn btn--ghost" onClick={() => setTagViewId(null)}>
                  Volver
                </button>
                <span>{tagViewNotes.length}</span>
              </div>
              <h2>{tagViewTitle}</h2>
              <p className="annotations-tag-view__meta">Notas con este tag</p>
              {tagViewNotes.length ? (
                <ul>
                  {tagViewNotes.map((item) => {
                    const courses = []
                    for (const anchor of item.anchors || []) {
                      if (!anchor.coursePath) continue
                      const title = resolveCourseTitle(anchor.coursePath, titles)
                      if (title && !courses.includes(title)) courses.push(title)
                    }
                    if (!courses.length && item.coursePath) {
                      courses.push(resolveCourseTitle(item.coursePath, titles))
                    }
                    return (
                      <li key={`${item.coursePath || 'local'}-${item.id}`}>
                        <button type="button" onClick={() => openFinding(item)}>
                          <strong>{displayName(item)}</strong>
                          {courses.length ? <span>{courses.join(' · ')}</span> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="annotations-tag-view__empty">Este tag todavía no tiene notas.</p>
              )}
            </div>
          ) : !selected ? (
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
                  {saveStatus !== 'idle' ? (
                    saveStatus === 'error' ? (
                      <button
                        type="button"
                        className="annotations-doc__save-status is-error"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saveStatusLabel(saveStatus)}
                      </button>
                    ) : (
                      <span
                        className={`annotations-doc__save-status is-${saveStatus}`}
                        aria-live="polite"
                      >
                        {saveStatus === 'saving' ? (
                          <span className="annotations-doc__save-dot" aria-hidden="true" />
                        ) : null}
                        {saveStatusLabel(saveStatus)}
                      </span>
                    )
                  ) : null}
                  {dirty && saveStatus !== 'saving' ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      Guardar
                    </button>
                  ) : null}
                  <NotionSyncNoteButton findingId={selected.id} />
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

              <NotionSyncConflict
                note={selected}
                dirty={dirty}
                localTitle={draftTitle}
                localBody={draft.markdown || draft.text || ''}
                onBeforeLocal={async () => {
                  if (!dirtyRef.current || !selectedRef.current) return
                  await persistRef.current?.(selectedRef.current, currentSnapshot(), {
                    silent: true
                  })
                }}
                onTookRemote={() => {
                  dirtyRef.current = false
                  setDirty(false)
                }}
              />

              <input
                key={`title-${selected.id}`}
                className="annotations-doc__title-input"
                value={draftTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={noteTitle(selected, titleLabels)}
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
                        ? resolveCourseTitle(selected.coursePath, titles)
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
                        .filter(
                          (anchor) => anchor.coursePath && anchor.coursePath !== selected.coursePath
                        )
                        .map((anchor) => resolveCourseTitle(anchor.coursePath, titles))
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
                        const updated = (draftTopicsRef.current || []).filter(
                          (item) => item !== title
                        )
                        draftTopicsRef.current = updated
                        setDraftTopics(updated)
                        markDirty()
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
                    onBlur={(event) => {
                      if (event.relatedTarget?.closest?.('.annotations-topics')) return
                      if (topicQueryRef.current.trim()) addTopicTitle(topicQueryRef.current)
                    }}
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
                  placeholder="Escribe tu anotación… [[ enlaza una nota, # añade un tema."
                  onChange={handleDraftChange}
                  enableTimestamp={typeof selected.timeSec === 'number'}
                  currentTimeSec={typeof selected.timeSec === 'number' ? selected.timeSec : 0}
                  onSeekTimestamp={onJump ? (timeSec) => onJump({ ...selected, timeSec }) : null}
                  mentionItems={mentionItems}
                  programs={programs}
                  onOpenMention={(mention) => {
                    if (mention?.type !== 'note') return
                    openFinding(libraryFindings.find((item) => item.id === mention.id))
                  }}
                  onCreateTopic={onUpsertTopic ? createTopic : null}
                />
              </div>

              {related.length ? (
                <div className="annotations-related">
                  <span className="annotations-doc__prop-label">Referencias vinculadas</span>
                  <ul>
                    {related.map((finding) => (
                      <li key={finding.id}>
                        <button type="button" onClick={() => onSelect?.(finding)}>
                          <strong>{noteTitle(finding, titleLabels)}</strong>
                          <span>
                            {(finding.anchors || [])
                              .map((anchor) => resolveCourseTitle(anchor.coursePath, titles))
                              .filter(Boolean)
                              .filter((value, index, all) => all.indexOf(value) === index)
                              .join(' · ')}
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

        <aside className="annotations-graph-pane" aria-label="Grafo de la biblioteca">
          <div
            className="annotations-graph-pane__resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ancho del grafo"
            aria-valuemin={GRAPH_PANE_MIN}
            aria-valuemax={graphRoomMax()}
            aria-valuenow={graphWidth}
            tabIndex={0}
            title="Arrastra para cambiar el ancho. Doble clic para restablecer."
            onPointerDown={onGraphResizeStart}
            onKeyDown={onGraphResizeKey}
            onDoubleClick={resetGraphWidth}
          />
          <div className="annotations-graph-pane__bar">
            <span>Grafo</span>
          </div>
          <div className="annotations-graph-pane__settings">
            <label>
              Profundidad
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={graphDepth}
                aria-label="Profundidad del grafo"
                onChange={(event) => setGraphDepth(clampDepth(event.target.value))}
              />
              <span>{graphDepth}</span>
            </label>
            <label>
              Distancia
              <input
                type="range"
                min="36"
                max="180"
                step="1"
                value={linkDistance}
                aria-label="Distancia de los enlaces"
                onChange={(event) => setLinkDistance(clampLinkDistance(event.target.value))}
              />
            </label>
            <label>
              Tamaño
              <input
                type="range"
                min="0.6"
                max="2"
                step="0.1"
                value={nodeScale}
                aria-label="Tamaño de los nodos"
                onChange={(event) => setNodeScale(clampNodeScale(event.target.value))}
              />
            </label>
            <label className="annotations-graph-pane__check">
              <input
                type="checkbox"
                checked={showArrows}
                onChange={(event) => setShowArrows(event.target.checked)}
              />
              Flechas
            </label>
            <label className="annotations-graph-pane__check">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(event) => setShowLabels(event.target.checked)}
              />
              Nombres
            </label>
            {showLabels ? (
              <label>
                Umbral
                <input
                  type="range"
                  min={LABEL_ZOOM_MIN}
                  max={LABEL_ZOOM_MAX}
                  step="0.05"
                  value={labelZoom}
                  aria-label="Umbral de zoom de los nombres"
                  onChange={(event) => setLabelZoom(clampLabelZoom(event.target.value))}
                />
                <span>{labelZoom.toFixed(2)}</span>
              </label>
            ) : null}
            <label className="annotations-graph-pane__check">
              <input
                type="checkbox"
                checked={showCourses}
                onChange={(event) => setShowCourses(event.target.checked)}
              />
              Cursos
            </label>
            <label className="annotations-graph-pane__check">
              <input
                type="checkbox"
                checked={showFiles}
                onChange={(event) => setShowFiles(event.target.checked)}
              />
              Archivos
            </label>
            <label className="annotations-graph-pane__check">
              <input
                type="checkbox"
                checked={showOrphans}
                onChange={(event) => setShowOrphans(event.target.checked)}
              />
              Huérfanas
            </label>
            {graphSelection ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setGraphSelection(null)
                  setGraphReset((value) => value + 1)
                }}
              >
                Reiniciar
              </button>
            ) : null}
          </div>
          {graph.nodes.length ? (
            <ul className="knowledge-graph__legend">
              <li>
                <i data-kind="topic" /> Tag
              </li>
              <li>
                <i data-kind="finding" /> Nota
              </li>
              {showFiles ? (
                <li>
                  <i data-kind="file" /> Archivo
                </li>
              ) : null}
              {showCourses ? (
                <li>
                  <i data-kind="course" /> Curso
                </li>
              ) : null}
            </ul>
          ) : null}
          <KnowledgeGraphView
            nodes={graph.nodes}
            edges={graph.edges}
            viewMode={graph.viewMode}
            linkDistance={linkDistance}
            nodeScale={nodeScale}
            showArrows={showArrows}
            showLabels={showLabels}
            labelZoom={labelZoom}
            showCourses={showCourses}
            showFiles={showFiles}
            showOrphans={showOrphans}
            highlightIds={graphVisibility.highlightIds}
            selectedId={graphSelection}
            truncated={graph.truncated || graphVisibility.truncated}
            resetToken={graphReset}
            onNodeClick={handleGraphNode}
            onNodeActivate={handleGraphActivate}
            onNodeShift={handleGraphShift}
            onClear={() => setGraphSelection(null)}
          />
        </aside>
      </div>
    </div>
  )
}

export { noteTitle, formatDateTime }
export default AnnotationsWorkspace
