import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  AppWindow,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  Film,
  Hash,
  History,
  Link2,
  Play,
  ArrowUpRight,
  EllipsisVertical,
  Group,
  Layers,
  Library,
  Locate,
  Plus,
  Search,
  Settings,
  Tags
} from 'lucide-react'
import AppHeader from './AppHeader'
import FlashcardBuilder from './FlashcardBuilder'
import NoteEditor from './NoteEditor'
import { NotionSyncConflict, NotionSyncNoteButton } from './NotionSyncControl'
import { TreeSection } from './LessonTree'
import KnowledgeGraphView from './KnowledgeGraphView'
import { formatTime } from './StudySidePanel'
import { askConfirm } from '../utils/askConfirm'
import { cn } from '../ui/cn'
import {
  btnCompact,
  btnGhost,
  btnPrimary,
  iconOnly,
  menuItem,
  popover
} from '../ui/classes'

const page = 'flex h-full min-h-0 flex-1 flex-col bg-white text-ink'
const pageBody =
  'grid min-h-0 flex-1 max-[900px]:grid-cols-1 max-[900px]:grid-rows-[minmax(140px,28%)_minmax(0,1fr)_minmax(220px,36%)]'
const pageBodyOpen =
  'grid-cols-[var(--annotations-list-w,268px)_minmax(280px,1fr)_minmax(280px,min(var(--annotations-graph-w,34%),70%))]'
const pageBodyCollapsed =
  'grid-cols-[3rem_minmax(280px,1fr)_minmax(280px,min(var(--annotations-graph-w,34%),70%))]'
const headerIcon = iconOnly
const menu = 'relative z-[8] shrink-0'
const docStack = 'mx-auto max-w-[46rem] px-7 pt-5 pb-12'
const docTitle = 'm-0 font-display text-2xl text-ink'
const docList = 'm-0 flex list-none flex-col gap-[0.45rem] p-0'
const docLink =
  'flex w-full cursor-pointer flex-col items-start gap-[0.15rem] rounded-md border border-ink/10 bg-surface px-[0.85rem] py-[0.7rem] text-left font-[inherit] text-ink shadow-card hover:-translate-y-px hover:shadow-lift [&_strong]:font-display [&_strong]:text-md [&_span]:text-xs [&_span]:text-ink-soft'
const relatedLink =
  'flex w-full cursor-pointer flex-col items-start gap-[0.1rem] rounded-sm border border-chip-status-border bg-chip-status px-[0.55rem] py-[0.15rem] text-left font-[inherit] text-xs text-chip-status-text [&_span]:text-xs [&_span]:text-ink-soft'
const graphOption =
  'flex w-full cursor-pointer flex-col items-start gap-[0.05rem] rounded-sm border-0 bg-transparent px-2 py-[0.35rem] text-left font-[inherit] text-ink hover:bg-cream-deep [&.is-active]:bg-cream-deep [&_span]:max-w-full [&_span]:truncate [&_small]:text-2xs [&_small]:text-ink-soft'
const popoverScroll = cn(popover, 'max-h-[min(60vh,22rem)] overflow-auto')
const iconSquare = iconOnly
const iconCreate = cn(btnPrimary, btnCompact, 'h-8 px-2.5')
const iconOn = 'border-coral bg-[rgba(232,69,112,0.12)] text-coral-deep'
const toolBtn = cn(iconOnly, 'aria-pressed:bg-coral-soft aria-pressed:text-coral-deep')
const listItem =
  'mt-[0.02rem] mb-[0.02rem] ml-[var(--ann-indent)] box-border flex w-[calc(100%-var(--ann-indent))] min-w-0 cursor-pointer flex-row items-baseline justify-between gap-[0.55rem] rounded-md border-0 bg-transparent px-[var(--ann-pad-x)] py-[0.2rem] text-left font-[inherit] text-ink hover:bg-[rgba(23,21,28,0.045)] [&.is-active]:bg-[rgba(23,21,28,0.08)] [&.is-active]:shadow-none [&.is-active:hover]:bg-[rgba(23,21,28,0.08)] [&_small]:text-2xs [&_small]:text-coral-deep [&.is-active_span_span]:font-semibold'
const savePill =
  'inline-flex appearance-none items-center gap-[0.3rem] rounded-full border border-ink/16 bg-cream px-[0.55rem] py-[0.18rem] font-body text-2xs leading-[1.2] font-semibold text-ink-soft shadow-none'
const saveWarm = 'border-chip-programs-border bg-chip-programs text-chip-programs-text'
const saveCool = 'border-chip-status-border bg-chip-status text-chip-status-text'
const propLabel = 'text-sm font-semibold text-ink-soft'
const propRow =
  'grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 rounded-xs px-1.5 py-1 text-sm hover:bg-ink/[0.025] max-[900px]:grid-cols-1 max-[900px]:gap-0.5'
const propKey =
  'flex items-center gap-2 text-sm text-ink-soft [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-ink-faint'
const topicChip =
  'inline-flex cursor-pointer items-center rounded-full border border-chip-status-border bg-chip-status px-2 py-px text-xs font-medium text-chip-status-text hover:border-chip-status-text/40'
const searchInList =
  'relative w-full min-w-0 max-w-none flex-none [&_input]:h-8 [&_input]:w-full [&_input]:rounded-full [&_input]:border [&_input]:border-ink/10 [&_input]:bg-surface [&_input]:py-0 [&_input]:pr-[0.85rem] [&_input]:pl-[2.15rem] [&_input]:text-sm [&_input]:text-ink [&_input]:shadow-none [&_input]:outline-none [&_input]:focus:shadow-find [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:top-1/2 [&_svg]:left-[0.7rem] [&_svg]:size-[0.9rem] [&_svg]:-translate-y-1/2 [&_svg]:opacity-55'
const graphPanel =
  'absolute top-[3.15rem] right-[0.65rem] z-[6] flex max-h-[calc(100%-4rem)] w-[min(16.5rem,calc(100%-1.3rem))] flex-col gap-[0.65rem] overflow-auto rounded-md border border-ink/10 bg-surface px-[0.85rem] py-3 text-xs font-medium text-ink-soft shadow-lift'
const rangeLabel =
  'grid grid-cols-[5.6rem_minmax(0,1fr)_auto] items-center gap-[0.45rem] [&_input]:w-full [&_input]:min-w-0 [&_input]:accent-coral [&>span:last-child]:min-w-[1.6rem] [&>span:last-child]:text-right [&>span:last-child]:text-ink [&>span:last-child]:tabular-nums'
const checkLabel =
  'grid grid-cols-[auto_1fr] items-center justify-start gap-[0.45rem] [&_input]:accent-coral'
import { groupAnnotationsByTarget, groupAnnotationsByWeek } from '../utils/annotationGroups'
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
  stripTopicFromMarkdown,
  resolveCourseTitle,
  topicKey,
  noteTextTitle,
  outlineNoteTitle,
  isDefaultNoteTitle,
  formatNoteTimestamp,
  visibleGraph
} from '../../../shared/knowledgeGraph.js'

function foldSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function clipTitle(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > 72 ? `${text.slice(0, 72)}…` : text
}

function noteTitle(item) {
  return clipTitle(noteTextTitle(item))
}

function editableTitle(value) {
  const text = String(value || '').trim()
  return isDefaultNoteTitle(text) ? '' : text
}

function topicTitlesOf(item, topics = []) {
  if (Array.isArray(item?.topics) && item.topics.length) {
    return item.topics.map((topic) => topic.title).filter(Boolean)
  }
  return (item?.topicIds || [])
    .map((id) => topics.find((topic) => topic.id === id)?.title)
    .filter(Boolean)
}

function countNotes(node) {
  const own = node.items?.length || 0
  const nested = (node.children || []).reduce((sum, child) => sum + countNotes(child), 0)
  return own + nested
}

function noteIdsIn(node, ids = []) {
  for (const item of node.items || []) {
    if (item?.id && !ids.includes(item.id)) ids.push(item.id)
  }
  for (const child of node.children || []) noteIdsIn(child, ids)
  return ids
}

function noteListParts(item, fullTitle) {
  const fromClock = typeof item?.timeSec === 'number' ? formatNoteTimestamp(item.timeSec) : ''
  const name = fullTitle || ''
  return { name, time: name && name === fromClock ? '' : fromClock }
}

function AnnotationBranch({
  node,
  nested,
  collapsedIds,
  onToggle,
  isRowActive,
  displayName,
  onOpen,
  selecting = false,
  selectedIds,
  onToggleSelect,
  onToggleSection
}) {
  const open = !collapsedIds.has(node.id)
  const count = countNotes(node)
  const loose = String(node.id).endsWith('__loose__')
  const sectionIds = selecting ? noteIdsIn(node) : []
  const pickedCount = sectionIds.filter((id) => selectedIds?.has(id)).length
  const sectionTitle = node.title || 'sección'
  return (
    <TreeSection
      id={node.id}
      idPrefix="ann-section"
      title={node.title}
      meta={count ? String(count) : null}
      open={open}
      nested={nested}
      dense
      className={loose ? 'is-loose' : undefined}
      onToggle={() => onToggle(node.id)}
      pick={
        selecting && sectionIds.length
          ? {
              checked: pickedCount === sectionIds.length,
              indeterminate: pickedCount > 0 && pickedCount < sectionIds.length,
              label: `Incluir ${sectionTitle}`,
              onChange: () => onToggleSection?.(sectionIds, pickedCount !== sectionIds.length)
            }
          : null
      }
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
          selecting={selecting}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleSection={onToggleSection}
        />
      ))}
      {node.items?.map((item) => {
        const parts = noteListParts(item, displayName(item))
        const picked = Boolean(selecting && selectedIds?.has(item.id))
        return (
          <div
            key={`${node.id}-${item.coursePath || 'local'}-${item.id}`}
            data-annotation-item=""
            className={cn(listItem, isRowActive(item) && 'is-active', picked && 'bg-coral/10')}
            title={parts.name}
          >
            {selecting ? (
              <input
                type="checkbox"
                className="mt-[0.15rem] shrink-0 accent-coral"
                checked={picked}
                aria-label={parts.name ? `Incluir ${parts.name}` : 'Incluir nota'}
                onChange={() => onToggleSelect?.(item)}
              />
            ) : null}
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-[0.55rem] border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
              onClick={() => onOpen(item)}
            >
              <span className="flex min-w-0 flex-1 flex-col items-stretch gap-[0.05rem] overflow-hidden">
                <span className="block max-w-full min-w-0 truncate text-sm leading-[1.3] font-medium">
                  {parts.name}
                </span>
                {item.notion?.conflict ? <small>Conflicto con Notion</small> : null}
              </span>
              {parts.time ? (
                <span className="shrink-0 text-2xs font-semibold text-ink-soft tabular-nums">
                  {parts.time}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}
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
const GROUP_MODES = [
  { id: 'target', label: 'Por archivo' },
  { id: 'topic', label: 'Por tema' },
  { id: 'week', label: 'Por semana' }
]
const GROUP_MODE_KEY = 'pcl.annotations.group-mode'

const GRAPH_SETTINGS_KEY = 'pcl.graph.node-visibility'
const GRAPH_WIDTH_KEY = 'pcl.graph.pane-width'
const GRAPH_PANE_MIN = 280
const GRAPH_PANE_DEFAULT = 420
const LIST_WIDTH_KEY = 'pcl.annotations.list-width'
const LIST_PANE_MIN = 200
const LIST_PANE_DEFAULT = 268
const LIST_COLLAPSED = 48
const DOC_PANE_MIN = 280
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

function clampListWidth(width, maxAvailable = 640) {
  const max = Math.max(LIST_PANE_MIN, maxAvailable)
  return Math.min(max, Math.max(LIST_PANE_MIN, Math.round(width)))
}

function readStoredGroupMode() {
  try {
    const stored = localStorage.getItem(GROUP_MODE_KEY)
    if (GROUP_MODES.some((mode) => mode.id === stored)) return stored
  } catch {
    // Grouping is only a list preference.
  }
  return 'target'
}

function readStoredListWidth() {
  try {
    const stored = Number(localStorage.getItem(LIST_WIDTH_KEY))
    if (Number.isFinite(stored) && stored >= LIST_PANE_MIN) return Math.round(stored)
  } catch {
    // Width is only a layout preference.
  }
  return null
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
    showTags: true,
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
      showTags: stored.showTags !== false,
      showOrphans: stored.showOrphans !== false
    }
  } catch {
    return defaults
  }
}

function MoreMenu({ label, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
    }
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  return (
    <div className={menu} ref={ref}>
      <button
        type="button"
        className={headerIcon}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <EllipsisVertical size={20} />
      </button>
      {open ? (
        <div className={popover} role="menu" aria-label={label}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      ) : null}
    </div>
  )
}

function AnnotationTitleField({ value, onChange, placeholder }) {
  const shown = String(value || '')
  const hint = placeholder || 'Título'
  return (
    <div className="relative mb-4">
      <div
        className={cn(
          'm-0 line-clamp-3 font-display text-[clamp(1.6rem,2.4vw,2.1rem)] leading-[1.15] font-semibold tracking-[-0.03em] whitespace-pre-wrap wrap-anywhere text-ink pointer-events-none',
          !shown && 'text-ink-soft opacity-55'
        )}
        aria-hidden="true"
      >
        {shown || hint}
      </div>
      <textarea
        className="absolute inset-0 m-0 box-border block h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-display text-[clamp(1.6rem,2.4vw,2.1rem)] leading-[1.15] font-semibold tracking-[-0.03em] whitespace-pre-wrap wrap-anywhere text-transparent caret-coral-deep outline-none selection:bg-[rgba(232,69,112,0.28)] [-webkit-text-fill-color:transparent]"
        value={shown}
        rows={1}
        autoFocus
        aria-label="Título de la anotación"
        onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, ' '))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
        }}
      />
    </div>
  )
}

function AnnotationsWorkspace({
  title = 'Anotaciones',
  subtitle,
  navActive = null,
  onNavigate,
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
  courseFilter = null,
  courseTitleByPath = {},
  preferGroupPath = null,
  preferGroupProjectId = null,
  loading = false,
  topics = [],
  programs = [],
  corpus = null,
  onUpsertTopic,
  onDeleteTopic,
  onOpenDecks
}) {
  const [query, setQuery] = useState('')
  const [outlineTool, setOutlineTool] = useState(null)
  const searchInputRef = useRef(null)
  const outlineToolsRef = useRef(null)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [listWidth, setListWidth] = useState(() => readStoredListWidth() ?? LIST_PANE_DEFAULT)
  const [listResizing, setListResizing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTopics, setDraftTopics] = useState([])
  const [topicQuery, setTopicQuery] = useState('')
  const [draft, setDraft] = useState({ text: '', markdown: '', json: null })
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [groupMode, setGroupMode] = useState(readStoredGroupMode)
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
  const [showTags, setShowTags] = useState(graphPrefs.showTags)
  const [showOrphans, setShowOrphans] = useState(graphPrefs.showOrphans)
  const [graphSelection, setGraphSelection] = useState(null)
  const [graphFocus, setGraphFocus] = useState({ id: null, token: 0 })
  const [graphQuery, setGraphQuery] = useState('')
  const [graphQueryIndex, setGraphQueryIndex] = useState(0)
  const [graphReset, setGraphReset] = useState(0)
  const [graphWidth, setGraphWidth] = useState(() => readStoredGraphWidth() ?? GRAPH_PANE_DEFAULT)
  const [graphResizing, setGraphResizing] = useState(false)
  const [graphSettingsOpen, setGraphSettingsOpen] = useState(false)
  const graphSettingsRef = useRef(null)
  const bodyRef = useRef(null)
  const graphWidthRef = useRef(graphWidth)
  const graphPreferredRef = useRef(readStoredGraphWidth())
  const listCollapsedRef = useRef(listCollapsed)
  const listWidthRef = useRef(listWidth)
  const listPreferredRef = useRef(readStoredListWidth())
  graphWidthRef.current = graphWidth
  listCollapsedRef.current = listCollapsed
  listWidthRef.current = listWidth

  useEffect(() => {
    if (outlineTool !== 'search') return
    searchInputRef.current?.focus()
  }, [outlineTool])

  useEffect(() => {
    if (outlineTool !== 'course' && outlineTool !== 'group') return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOutlineTool(null)
    }
    const onPointerDown = (event) => {
      if (outlineToolsRef.current?.contains(event.target)) return
      setOutlineTool(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [outlineTool])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || event.isComposing) return
      if (!(event.ctrlKey || event.metaKey) || event.repeat) return
      if (event.code !== 'KeyF' && String(event.key || '').toLowerCase() !== 'f') return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      event.stopPropagation()
      if (listCollapsedRef.current) setListCollapsed(false)
      setOutlineTool('search')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
  const [pickingCards, setPickingCards] = useState(false)
  const [cardPick, setCardPick] = useState(() => new Set())
  const [cardBuilderOpen, setCardBuilderOpen] = useState(false)
  const [tagViewId, setTagViewId] = useState(null)
  const [tagsManageOpen, setTagsManageOpen] = useState(false)
  const [jsonTitles, setJsonTitles] = useState({})
  const titles = useMemo(
    () => ({ ...courseTitleByPath, ...jsonTitles }),
    [courseTitleByPath, jsonTitles]
  )

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_MODE_KEY, groupMode)
    } catch {
      // Grouping is only a list preference.
    }
  }, [groupMode])

  useEffect(() => {
    if (!graphQuery.trim()) return undefined
    const onPointerDown = (event) => {
      if (event.target.closest?.('[data-graph-finder]')) return
      setGraphQuery('')
      setGraphQueryIndex(0)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [graphQuery])

  useEffect(() => {
    if (!graphSettingsOpen) return undefined
    const onPointerDown = (event) => {
      if (graphSettingsRef.current?.contains(event.target)) return
      setGraphSettingsOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setGraphSettingsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [graphSettingsOpen])

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
          showTags,
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
    showTags,
    showOrphans
  ])

  const listRoomMax = useCallback((body = bodyRef.current) => {
    const graph = graphWidthRef.current || GRAPH_PANE_MIN
    return Math.max(
      LIST_PANE_MIN,
      (body?.clientWidth || LIST_PANE_DEFAULT + graph + DOC_PANE_MIN) - graph - DOC_PANE_MIN
    )
  }, [])

  const graphRoomMax = useCallback((body = bodyRef.current) => {
    const list = listCollapsedRef.current
      ? LIST_COLLAPSED
      : listWidthRef.current || LIST_PANE_DEFAULT
    return Math.max(
      GRAPH_PANE_MIN,
      (body?.clientWidth || GRAPH_PANE_DEFAULT + list + DOC_PANE_MIN) - list - DOC_PANE_MIN
    )
  }, [])

  const applyGraphWidth = useCallback(() => {
    const body = bodyRef.current
    const max = graphRoomMax(body)
    const list = listCollapsedRef.current
      ? LIST_COLLAPSED
      : listWidthRef.current || LIST_PANE_DEFAULT
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
  }, [applyGraphWidth, listCollapsed, listWidth])

  const onListResizeStart = useCallback(
    (event) => {
      if (event.button != null && event.button !== 0) return
      if (listCollapsedRef.current) return
      if (window.matchMedia('(max-width: 900px)').matches) return
      event.preventDefault()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      const startX = event.clientX
      const startWidth = listWidthRef.current
      const max = listRoomMax()
      setListResizing(true)

      const onMove = (moveEvent) => {
        const next = clampListWidth(startWidth + moveEvent.clientX - startX, max)
        listPreferredRef.current = next
        setListWidth(next)
      }
      const onUp = () => {
        setListResizing(false)
        const next = listPreferredRef.current
        if (next != null) {
          try {
            localStorage.setItem(LIST_WIDTH_KEY, String(next))
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
    [listRoomMax]
  )

  const onListResizeKey = useCallback(
    (event) => {
      const step = event.shiftKey ? 48 : 16
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const delta = event.key === 'ArrowRight' ? step : -step
      const next = clampListWidth(listWidthRef.current + delta, listRoomMax())
      listPreferredRef.current = next
      setListWidth(next)
      try {
        localStorage.setItem(LIST_WIDTH_KEY, String(next))
      } catch {
        // The width still applies for this session.
      }
    },
    [listRoomMax]
  )

  const resetListWidth = useCallback(() => {
    listPreferredRef.current = null
    try {
      localStorage.removeItem(LIST_WIDTH_KEY)
    } catch {
      // The default width still applies for this session.
    }
    setListWidth(LIST_PANE_DEFAULT)
  }, [])

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
        noteTitle(item)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [annotations, query, titles])

  const toggleCardPick = (item) => {
    if (!item?.id) return
    setCardPick((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  const toggleCardSection = (ids, selected) => {
    setCardPick((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const selectVisibleCards = () => {
    setCardPick((current) => {
      const next = new Set(current)
      const visibleIds = filtered.map((item) => item.id).filter(Boolean)
      const allOn = visibleIds.length > 0 && visibleIds.every((id) => next.has(id))
      for (const id of visibleIds) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const pickedNotes = annotations.filter((item) => cardPick.has(item.id))

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
    if (groupMode === 'week') return groupAnnotationsByWeek(filtered)
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

  useLayoutEffect(() => {
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

  const listItemsRef = useRef(null)
  const didScrollActive = useRef(false)
  useLayoutEffect(() => {
    if (didScrollActive.current || loading) return
    const active = listItemsRef.current?.querySelector('[data-annotation-item].is-active')
    if (!active) return
    active.scrollIntoView({ block: 'center', inline: 'nearest' })
    didScrollActive.current = true
  }, [loading, selectedId, listTree, collapsedIds])

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
  const persistPromiseRef = useRef(Promise.resolve())
  const editEpochRef = useRef(0)

  draftRef.current = draft
  draftTitleRef.current = draftTitle
  draftTopicsRef.current = draftTopics
  topicQueryRef.current = topicQuery
  topicsRef.current = topics

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

  const dropTopicFromDraft = (topic) => {
    const key = topicKey(topic?.title)
    const remaining = (draftTopicsRef.current || []).filter((title) => topicKey(title) !== key)
    draftTopicsRef.current = remaining
    setDraftTopics(remaining)
    const prev = draftRef.current?.markdown || draftRef.current?.text || ''
    const markdown = stripTopicFromMarkdown(prev, { id: topic?.id, title: topic?.title })
    if (markdown === prev) return
    const next = { text: markdown, markdown, json: null }
    draftRef.current = next
    setDraft(next)
    setEditorKey((value) => value + 1)
  }

  const currentSnapshot = () => ({
    title: draftTitleRef.current,
    draft: draftRef.current,
    topics: draftTopicsRef.current || []
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
        title: noteTitle(item),
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
  }, [annotations, libraryFindings, selected?.id, topics])

  const persistNote = useCallback(
    async (item, incoming, { silent = true } = {}) => {
      if (!item) return
      const key = noteKey(item)
      const snapshot = noteKey(selectedRef.current) === key ? currentSnapshot() : incoming
      if (savingRef.current) {
        pendingFlushRef.current = { item, snapshot, silent }
        return
      }
      const epoch = editEpochRef.current
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
        const currentTopics = draftTopicsRef.current || []
        const sameTopics =
          topicTitles.length === currentTopics.length &&
          topicTitles.every((title, index) => topicKey(title) === topicKey(currentTopics[index]))
        if (!sameTopics && noteKey(selectedRef.current) === key) {
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
          if (editEpochRef.current === epoch) {
            dirtyRef.current = false
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

  persistRef.current = (item, snapshot, options) => {
    const job = persistNote(item, snapshot, options)
    persistPromiseRef.current = Promise.resolve(job)
    return job
  }

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
      draftTitleRef.current = ''
      draftTopicsRef.current = []
      draftRef.current = { text: '', markdown: '', json: null }
      dirtyRef.current = false
      setDraftTitle('')
      setDraftTopics([])
      setDraft({ text: '', markdown: '', json: null })
      setDirty(false)
      setSaveStatus('idle')
      return
    }
    const loadedTitle = editableTitle(next.title)
    const loadedTopics = topicTitlesOf(next, topics)
    const loadedDraft = {
      text: next.body || '',
      markdown: next.body || '',
      json: next.bodyJson || null
    }
    draftTitleRef.current = loadedTitle
    draftTopicsRef.current = loadedTopics
    draftRef.current = loadedDraft
    dirtyRef.current = false
    setDraftTitle(loadedTitle)
    setDraftTopics(loadedTopics)
    setTopicQuery('')
    setDraft(loadedDraft)
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
    const title = editableTitle(selected.title)
    const loadedTopics = topicTitlesOf(selected, topics)
    const loadedDraft = {
      text: selected.body || '',
      markdown: selected.body || '',
      json: null
    }
    draftTitleRef.current = title
    draftTopicsRef.current = loadedTopics
    draftRef.current = loadedDraft
    dirtyRef.current = false
    setDraftTitle(title)
    setDraftTopics(loadedTopics)
    setDraft(loadedDraft)
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
    editEpochRef.current += 1
    dirtyRef.current = true
    setDirty(true)
    setSaveStatus('unsaved')
    scheduleSave()
  }

  const handleDraftChange = (next) => {
    const text = next.markdown || next.text || ''
    const prev = draftRef.current?.markdown || draftRef.current?.text || ''
    if (text === prev) return
    const loaded = { text, markdown: text, json: null }
    draftRef.current = loaded
    setDraft(loaded)
    markDirty()
  }

  const handleTitleChange = (value) => {
    draftTitleRef.current = value
    setDraftTitle(value)
    markDirty()
  }

  const displayName = (item) => {
    if (selected && isRowActive(item) && dirty) {
      return outlineNoteTitle({
        title: draftTitle,
        body: draft?.markdown || draft?.text || '',
        timeSec: item.timeSec
      })
    }
    return outlineNoteTitle(item)
  }

  const handleSave = () => {
    if (!selected) return
    clearTimeout(saveTimerRef.current)
    void persistRef.current?.(selected, currentSnapshot(), { silent: true })
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

  const graphMatches = useMemo(() => {
    const q = foldSearch(graphQuery.trim())
    if (!q) return []
    return graph.nodes
      .map((node) => {
        const label = node.data?.fullLabel || node.data?.label || ''
        const kind = node.data?.kindLabel || ''
        if (!foldSearch(`${label} ${kind}`).includes(q)) return null
        return { node, rank: foldSearch(label).startsWith(q) ? 0 : 1, label }
      })
      .filter(Boolean)
      .sort(
        (a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'es', { sensitivity: 'base' })
      )
      .slice(0, 8)
      .map((item) => item.node)
  }, [graph.nodes, graphQuery])

  const focusGraphNode = (node) => {
    if (!node) return
    const kind = node.data?.kind
    if (kind === 'topic') setShowTags(true)
    if (kind === 'course') setShowCourses(true)
    if (kind === 'file') setShowFiles(true)
    if (kind === 'finding' && node.data?.orphan) setShowOrphans(true)
    setGraphSelection(node.id)
    setGraphFocus((current) => ({ id: node.id, token: current.token + 1 }))
    setGraphQuery('')
    setGraphQueryIndex(0)
  }

  const focusFindingInGraph = (finding) => {
    const node = graph.nodes.find((item) => item.id === `finding:${finding?.id}`)
    if (!node) {
      toast.error('Esta nota aún no está en la gráfica')
      return
    }
    focusGraphNode(node)
  }

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
        noteTitle(a).localeCompare(noteTitle(b), undefined, {
          sensitivity: 'base'
        })
      )
  }, [tagViewId, libraryFindings])

  const tagViewTitle = topics.find((topic) => topic.id === tagViewId)?.title || 'Tag'

  const topicUsage = useMemo(() => {
    const counts = new Map()
    for (const finding of libraryFindings) {
      for (const id of finding.topicIds || []) {
        counts.set(id, (counts.get(id) || 0) + 1)
      }
    }
    return counts
  }, [libraryFindings])

  const removeTopic = async (topic) => {
    if (!topic || !onDeleteTopic) return
    const count = topicUsage.get(topic.id) || 0
    const where = count === 1 ? '1 nota' : `${count} notas`
    const ok = await askConfirm({
      title: 'Borrar tag',
      message: count
        ? `¿Borrar «${topic.title}»? Se quita de ${where} y de su texto.`
        : `¿Borrar «${topic.title}»?`,
      confirmLabel: 'Borrar'
    })
    if (!ok) return
    try {
      clearTimeout(saveTimerRef.current)
      await persistPromiseRef.current
      clearTimeout(saveTimerRef.current)
      dropTopicFromDraft(topic)
      await onDeleteTopic(topic.id)
      if (tagViewId === topic.id) setTagViewId(null)
      if (dirtyRef.current && selectedRef.current) {
        clearTimeout(saveTimerRef.current)
        await persistRef.current?.(selectedRef.current, currentSnapshot(), { silent: true })
      }
      toast.success('Tag borrado')
    } catch (err) {
      toast.error(err.message || 'No se pudo borrar el tag')
    }
  }

  const openFinding = (finding) => {
    setTagViewId(null)
    setTagsManageOpen(false)
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
    <div className={cn(page, (listResizing || graphResizing) && 'cursor-col-resize select-none')}>
      {cardBuilderOpen ? (
        <FlashcardBuilder
          notes={pickedNotes}
          onClose={() => setCardBuilderOpen(false)}
          onSaved={() => {
            setCardPick(new Set())
            setPickingCards(false)
          }}
          onOpenDecks={() => onOpenDecks?.()}
        />
      ) : null}
      <AppHeader
        active={navActive}
        onNavigate={onNavigate}
        title={title}
        subtitle={subtitle}
        onBack={navActive ? undefined : onBack}
        className="z-[6] bg-surface"
        actions={
          <>
          {onOpenPopOut ? (
            <button
              type="button"
              className={headerIcon}
              title="Abrir anotaciones en una ventana aparte"
              aria-label="Abrir en una ventana"
              onClick={onOpenPopOut}
            >
              <AppWindow size={20} />
            </button>
          ) : null}
          <MoreMenu label="Más acciones">
            {(close) => (
              <button
                type="button"
                className={menuItem}
                role="menuitem"
                title="Mostrar learning-store.json en el explorador"
                onClick={async () => {
                  close()
                  try {
                    await window.api.revealLearningStore()
                  } catch (err) {
                    toast.error(err.message || 'No se pudo abrir la ubicación')
                  }
                }}
              >
                <span>Abrir ubicación</span>
              </button>
            )}
          </MoreMenu>
          </>
        }
      />

      <div
        className={cn(pageBody, listCollapsed ? pageBodyCollapsed : pageBodyOpen)}
        ref={bodyRef}
        style={{
          '--annotations-graph-w': `${graphWidth}px`,
          '--annotations-list-w': `${listWidth}px`
        }}
      >
        <aside
          className="relative flex min-h-0 min-w-0 flex-col border-r border-ink/10 bg-cream [--ann-chevron-gap:0.3rem] [--ann-chevron:0.7rem] [--ann-indent:calc(var(--ann-chevron)+var(--ann-chevron-gap))] [--ann-pad-x:0.35rem]"
          data-annotations-list=""
          aria-label="Lista de anotaciones"
        >
          {!listCollapsed ? (
            <div
              className={cn(
                'absolute top-0 right-0 z-[5] h-full w-2 cursor-col-resize touch-none hover:bg-[rgba(232,69,112,0.45)] focus-visible:bg-[rgba(232,69,112,0.45)] focus-visible:outline-none max-[900px]:hidden',
                listResizing && 'bg-[rgba(232,69,112,0.45)]'
              )}
              role="separator"
              aria-orientation="vertical"
              aria-label="Ancho del índice"
              aria-valuemin={LIST_PANE_MIN}
              aria-valuemax={listRoomMax()}
              aria-valuenow={listWidth}
              tabIndex={0}
              title="Arrastra para cambiar el ancho. Doble clic para restablecer."
              onPointerDown={onListResizeStart}
              onKeyDown={onListResizeKey}
              onDoubleClick={resetListWidth}
            />
          ) : null}
          <div className="flex h-12 items-center gap-1.5 border-b border-ink/8 px-2">
            <button
              type="button"
              className={iconSquare}
              onClick={() => setListCollapsed((value) => !value)}
              title={listCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
              aria-label={listCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
            >
              {listCollapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
            {!listCollapsed ? (
              <>
                <span className="ml-1 text-sm font-semibold text-ink">Notas</span>
                <span className="rounded-full bg-ink/6 px-1.5 text-xs text-ink-soft tabular-nums">
                  {filtered.length}
                </span>
                <span className="flex-1" />
                {onCreate ? (
                  <button
                    type="button"
                    className={iconCreate}
                    title="Nueva anotación"
                    aria-label="Nueva anotación"
                    onClick={onCreate}
                  >
                    <Plus size={14} aria-hidden="true" />
                    Nueva
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          {!listCollapsed ? (
            <>
              <div
                className="relative z-[4] flex flex-col gap-[0.45rem] px-[0.6rem] pt-[0.45rem] pb-[0.15rem]"
                ref={outlineToolsRef}
              >
                <div className="flex items-center justify-center gap-[0.15rem]">
                  <button
                    type="button"
                    className={cn(toolBtn, pickingCards && 'text-coral-deep')}
                    title="Elegir notas para tarjetas"
                    aria-label="Elegir notas para tarjetas"
                    aria-pressed={pickingCards}
                    onClick={() => {
                      setPickingCards((current) => {
                        if (current) {
                          setCardPick(new Set())
                          setCardBuilderOpen(false)
                        }
                        return !current
                      })
                      setOutlineTool(null)
                    }}
                  >
                    <Layers size={16} />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      toolBtn,
                      (outlineTool === 'search' || query.trim()) && 'text-coral-deep'
                    )}
                    title="Buscar"
                    aria-label="Buscar"
                    aria-pressed={outlineTool === 'search'}
                    onClick={() =>
                      setOutlineTool((current) => (current === 'search' ? null : 'search'))
                    }
                  >
                    <Search size={16} />
                  </button>
                  {courseFilter ? (
                    <div className="static">
                      <button
                        type="button"
                        className={cn(
                          toolBtn,
                          (outlineTool === 'course' || courseFilter.value) && 'text-coral-deep'
                        )}
                        title={
                          courseFilter.options.find((option) => option.value === courseFilter.value)
                            ?.label || 'Curso'
                        }
                        aria-label="Filtrar por curso"
                        aria-haspopup="menu"
                        aria-expanded={outlineTool === 'course'}
                        onClick={() =>
                          setOutlineTool((current) => (current === 'course' ? null : 'course'))
                        }
                      >
                        <Library size={16} />
                      </button>
                      {outlineTool === 'course' ? (
                        <div
                          className={cn(
                            popoverScroll,
                            'top-[calc(0.45rem+2rem+6px)] right-[0.6rem] left-[0.6rem] z-[8] w-auto min-w-0 [&_button]:max-w-full [&_button]:min-w-0 [&_span]:block [&_span]:max-w-full [&_span]:truncate'
                          )}
                          role="menu"
                          aria-label="Curso"
                        >
                          <button
                            type="button"
                            className={menuItem}
                            role="menuitemradio"
                            aria-checked={!courseFilter.value}
                            onClick={() => {
                              courseFilter.onChange('')
                              setOutlineTool(null)
                            }}
                          >
                            <span>Todos</span>
                          </button>
                          {courseFilter.options.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={menuItem}
                              role="menuitemradio"
                              title={option.label}
                              aria-checked={courseFilter.value === option.value}
                              onClick={() => {
                                courseFilter.onChange(option.value)
                                setOutlineTool(null)
                              }}
                            >
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="static">
                    <button
                      type="button"
                      className={cn(
                        toolBtn,
                        (outlineTool === 'group' || groupMode !== 'target') && 'text-coral-deep'
                      )}
                      title={GROUP_MODES.find((mode) => mode.id === groupMode)?.label || 'Agrupar'}
                      aria-label="Agrupar"
                      aria-haspopup="menu"
                      aria-expanded={outlineTool === 'group'}
                      onClick={() =>
                        setOutlineTool((current) => (current === 'group' ? null : 'group'))
                      }
                    >
                      <Group size={16} />
                    </button>
                    {outlineTool === 'group' ? (
                      <div
                        className={cn(
                          popoverScroll,
                          'top-[calc(0.45rem+2rem+6px)] right-[0.6rem] left-[0.6rem] z-[8] w-auto min-w-0 [&_button]:max-w-full [&_button]:min-w-0 [&_span]:block [&_span]:max-w-full [&_span]:truncate'
                        )}
                        role="menu"
                        aria-label="Agrupar"
                      >
                        {GROUP_MODES.map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            className={menuItem}
                            role="menuitemradio"
                            aria-checked={groupMode === mode.id}
                            onClick={() => {
                              setGroupMode(mode.id)
                              setOutlineTool(null)
                            }}
                          >
                            <span>{mode.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                {outlineTool === 'search' ? (
                  <div className={searchInList}>
                    <svg
                      className="pointer-events-none"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar…"
                      aria-label="Buscar anotaciones"
                      title="Buscar (Ctrl+F)"
                    />
                  </div>
                ) : null}
              </div>
              <div
                className="flex min-h-0 flex-1 flex-col gap-[0.55rem] overflow-auto px-[0.45rem] pt-[0.55rem] pb-[0.85rem]"
                ref={listItemsRef}
              >
                {loading ? (
                  <p className="mx-2 my-[0.8rem] text-sm text-ink-soft">Cargando…</p>
                ) : filtered.length === 0 ? (
                  <p className="mx-2 my-[0.8rem] text-sm text-ink-soft">
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
                      selecting={pickingCards}
                      selectedIds={cardPick}
                      onToggleSelect={toggleCardPick}
                      onToggleSection={toggleCardSection}
                    />
                  ))
                )}
              </div>
              {pickingCards ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 px-[0.6rem] py-[0.45rem]">
                  <span className="text-xs font-semibold text-ink-soft">
                    {cardPick.size === 1 ? '1 nota' : `${cardPick.size} notas`}
                  </span>
                  <button
                    type="button"
                    className={cn(btnGhost, 'px-2 py-1 text-xs shadow-none')}
                    onClick={selectVisibleCards}
                  >
                    Visibles
                  </button>
                  <button
                    type="button"
                    className={cn(btnPrimary, 'px-2 py-1 text-xs shadow-none')}
                    disabled={!cardPick.size}
                    onClick={() => setCardBuilderOpen(true)}
                  >
                    Crear tarjetas
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </aside>

        <main className="relative min-h-0 overflow-auto bg-white" data-annotations-doc="">
          {tagViewId ? (
            <div className={docStack}>
              <div className="mb-[0.85rem] flex items-center justify-between gap-3 text-xs font-semibold text-ink-soft">
                <button type="button" className={btnGhost} onClick={() => setTagViewId(null)}>
                  Volver
                </button>
                <span className="flex items-center gap-[0.65rem]">
                  <span>{tagViewNotes.length}</span>
                  {onDeleteTopic ? (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => void removeTopic(topics.find((item) => item.id === tagViewId))}
                    >
                      Borrar tag
                    </button>
                  ) : null}
                </span>
              </div>
              <h2 className={docTitle}>{tagViewTitle}</h2>
              <p className="mt-1 mb-4 text-sm text-ink-soft">Notas con este tag</p>
              {tagViewNotes.length ? (
                <ul className={docList}>
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
                        <button type="button" className={docLink} onClick={() => openFinding(item)}>
                          <strong>{displayName(item)}</strong>
                          {courses.length ? <span>{courses.join(' · ')}</span> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-ink-soft">Este tag todavía no tiene notas.</p>
              )}
            </div>
          ) : tagsManageOpen ? (
            <div className={docStack}>
              <div className="mb-[0.85rem] flex items-center justify-between gap-3 text-xs font-semibold text-ink-soft">
                <button type="button" className={btnGhost} onClick={() => setTagsManageOpen(false)}>
                  Volver
                </button>
              </div>
              <h2 className={docTitle}>Tags</h2>
              <p className="mt-1 mb-4 text-sm text-ink-soft">
                Quitar un tag lo saca de todas las notas y de su texto.
              </p>
              {topics.length ? (
                <ul className={cn(docList, '[&_li]:flex [&_li]:items-center [&_li]:gap-2')}>
                  {topics.map((topic) => {
                    const count = topicUsage.get(topic.id) || 0
                    const useLabel =
                      count === 0 ? 'Sin notas' : count === 1 ? '1 nota' : `${count} notas`
                    return (
                      <li key={topic.id}>
                        <button
                          type="button"
                          className={cn(docLink, 'min-w-0 flex-1')}
                          onClick={() => setTagViewId(topic.id)}
                        >
                          <strong>{topic.title}</strong>
                          <span>{useLabel}</span>
                        </button>
                        {onDeleteTopic ? (
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => void removeTopic(topic)}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-ink-soft">Todavía no hay tags.</p>
              )}
            </div>
          ) : !selected ? (
            <div className="mx-auto mt-16 max-w-[28rem] text-center text-ink-soft">
              <h2 className="mb-2 font-display text-ink">Selecciona una anotación</h2>
              <p>Abre una fila de la tabla o crea una nueva para editarla aquí.</p>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-[2] flex w-full items-center justify-end gap-[0.4rem] bg-white px-0 pt-[0.2rem] pb-[0.15rem]">
                <div className="ml-auto flex items-center justify-end gap-[0.4rem] pr-[0.15rem]">
                  {saveStatus !== 'idle' ? (
                    saveStatus === 'error' ? (
                      <button
                        type="button"
                        className={cn(savePill, saveWarm, 'cursor-pointer')}
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saveStatusLabel(saveStatus)}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          savePill,
                          (saveStatus === 'unsaved' || saveStatus === 'saving') && saveWarm,
                          saveStatus === 'saved' && saveCool,
                          saveStatus === 'error' && saveWarm
                        )}
                        aria-live="polite"
                      >
                        {saveStatus === 'saving' ? (
                          <span
                            className="size-[0.35rem] animate-loader-text rounded-full bg-current"
                            aria-hidden="true"
                          />
                        ) : null}
                        {saveStatusLabel(saveStatus)}
                      </span>
                    )
                  ) : null}
                  {dirty && saveStatus !== 'saving' ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      Guardar
                    </button>
                  ) : null}
                  {onJump && selected.coursePath && typeof selected.timeSec !== 'number' ? (
                    <button
                      type="button"
                      className={headerIcon}
                      title={jumpLabel(selected)}
                      aria-label={jumpLabel(selected)}
                      onClick={() => onJump(selected)}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={headerIcon}
                    title="Enfocar en la gráfica"
                    aria-label="Enfocar en la gráfica"
                    onClick={() => focusFindingInGraph(selected)}
                  >
                    <Locate size={20} />
                  </button>
                  <MoreMenu label="Más acciones de la anotación">
                    {(close) => (
                      <>
                        <NotionSyncNoteButton
                          findingId={selected.id}
                          variant="menu"
                          onDone={close}
                        />
                        <button
                          type="button"
                          className={menuItem}
                          role="menuitem"
                          onClick={() => {
                            close()
                            handleExport()
                          }}
                        >
                          <span>Exportar</span>
                        </button>
                        {onDelete ? (
                          <button
                            type="button"
                            className={menuItem}
                            role="menuitem"
                            onClick={() => {
                              const item = selected
                              void (async () => {
                                const ok = await askConfirm({
                                  title: 'Borrar anotación',
                                  message: '¿Borrar esta anotación?',
                                  confirmLabel: 'Borrar'
                                })
                                close()
                                if (ok) onDelete(item)
                              })()
                            }}
                          >
                            <span>Borrar</span>
                          </button>
                        ) : null}
                      </>
                    )}
                  </MoreMenu>
                </div>
              </div>

              <div className="mx-auto max-w-[46rem] px-7 pt-[0.15rem] pb-12">
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

                <AnnotationTitleField
                  key={`title-${selected.id}`}
                  value={draftTitle}
                  onChange={handleTitleChange}
                  placeholder={noteTitle(selected) || 'Título'}
                />

                <div className="-mx-1.5 mb-5 flex flex-col gap-0.5 border-b border-ink/8 pb-4">
                  <div className={propRow}>
                    <span className={propKey}>
                      <CalendarDays aria-hidden="true" />
                      Creada
                    </span>
                    <span>{formatDateTime(selected.createdAt)}</span>
                  </div>
                  {courseColumn ? (
                    <div className={propRow}>
                      <span className={propKey}>
                        <Library aria-hidden="true" />
                        Curso
                      </span>
                      <span>
                        {selected.coursePath
                          ? resolveCourseTitle(selected.coursePath, titles)
                          : 'Sin curso'}
                      </span>
                    </div>
                  ) : null}
                  {selected.coursePath || selected.lessonRelativePath || selected.projectId ? (
                    <div className={propRow}>
                      <span className={propKey}>
                        <Film aria-hidden="true" />
                        {targetPropLabel(selected)}
                      </span>
                      <span>{targetPropValue(selected)}</span>
                    </div>
                  ) : null}
                  {typeof selected.timeSec === 'number' ? (
                    <div className={propRow}>
                      <span className={propKey}>
                        <Clock aria-hidden="true" />
                        Tiempo
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-[0.45rem]">
                        <span>{formatTime(selected.timeSec)}</span>
                        {onJump && selected.coursePath ? (
                          <button
                            type="button"
                            className={cn(btnGhost, btnCompact, 'h-6 px-2')}
                            onClick={() => onJump(selected)}
                          >
                            <Play className="size-3 fill-current" aria-hidden="true" />
                            Ir al video
                          </button>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {selected.updatedAt && selected.updatedAt !== selected.createdAt ? (
                    <div className={propRow}>
                      <span className={propKey}>
                        <History aria-hidden="true" />
                        Actualizada
                      </span>
                      <span>{formatDateTime(selected.updatedAt)}</span>
                    </div>
                  ) : null}
                  {(selected.anchors || []).length > 1 ? (
                    <div className={propRow}>
                      <span className={propKey}>
                        <Link2 aria-hidden="true" />
                        También en
                      </span>
                      <span>
                        {selected.anchors
                          .filter(
                            (anchor) =>
                              anchor.coursePath && anchor.coursePath !== selected.coursePath
                          )
                          .map((anchor) => resolveCourseTitle(anchor.coursePath, titles))
                          .join(' · ') || 'varios puntos'}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="-mx-1.5 -mt-4 mb-5 border-b border-ink/8 pb-4" data-annotation-topics="">
                  <div className={cn(propRow, 'items-start')}>
                  <span className={cn(propKey, 'pt-0.5')}>
                    <Hash aria-hidden="true" />
                    Temas
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {draftTopics.map((title) => (
                      <button
                        key={title}
                        type="button"
                        className={topicChip}
                        onClick={() => {
                          const topic = (topicsRef.current || []).find(
                            (item) => topicKey(item.title) === topicKey(title)
                          )
                          dropTopicFromDraft({ id: topic?.id, title })
                          markDirty()
                        }}
                        title="Quitar tema"
                      >
                        {title}
                        <span aria-hidden="true"> ×</span>
                      </button>
                    ))}
                    <input
                      className="min-w-[8rem] border-0 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-faint"
                      value={topicQuery}
                      placeholder="Añadir tema"
                      aria-label="Añadir tema"
                      onChange={(event) => setTopicQuery(event.target.value)}
                      onBlur={(event) => {
                        if (event.relatedTarget?.closest?.('[data-annotation-topics]')) return
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
                  </div>
                  {topicQuery.trim() && topicSuggestions.length ? (
                    <div className="mt-1.5 ml-[calc(9rem+0.75rem+0.375rem)] flex flex-wrap gap-1 max-[900px]:ml-1.5 [&_button]:cursor-pointer [&_button]:rounded-full [&_button]:border [&_button]:border-dashed [&_button]:border-chip-status-border [&_button]:bg-surface [&_button]:px-2 [&_button]:py-px [&_button]:text-xs [&_button]:text-chip-status-text [&_button:hover]:bg-chip-status">
                      {topicSuggestions.map((title) => (
                        <button key={title} type="button" onClick={() => addTopicTitle(title)}>
                          {title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
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
                  <div className="px-5 pb-3">
                    <span className={propLabel}>Referencias vinculadas</span>
                    <ul className="m-0 mt-[0.4rem] flex list-none flex-col gap-[0.35rem] p-0">
                      {related.map((finding) => (
                        <li key={finding.id}>
                          <button
                            type="button"
                            className={relatedLink}
                            onClick={() => onSelect?.(finding)}
                          >
                            <strong>{noteTitle(finding)}</strong>
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
            </>
          )}
        </main>

        <aside
          className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-ink/10 bg-white"
          aria-label="Gráfica de la biblioteca"
        >
          <div
            className={cn(
              'absolute top-0 left-0 z-[3] h-full w-2 cursor-col-resize touch-none hover:bg-[rgba(232,69,112,0.45)] focus-visible:bg-[rgba(232,69,112,0.45)] focus-visible:outline-none max-[900px]:hidden',
              graphResizing && 'bg-[rgba(232,69,112,0.45)]'
            )}
            role="separator"
            aria-orientation="vertical"
            aria-label="Ancho de la gráfica"
            aria-valuemin={GRAPH_PANE_MIN}
            aria-valuemax={graphRoomMax()}
            aria-valuenow={graphWidth}
            tabIndex={0}
            title="Arrastra para cambiar el ancho. Doble clic para restablecer."
            onPointerDown={onGraphResizeStart}
            onKeyDown={onGraphResizeKey}
            onDoubleClick={resetGraphWidth}
          />
          <div className="flex items-center justify-between gap-2 px-3 py-[0.55rem] font-display text-base font-semibold text-ink">
            <span>Gráfica</span>
            <div className="static ml-auto flex items-center gap-[0.15rem]" ref={graphSettingsRef}>
              <button
                type="button"
                className={cn(
                  'inline-flex size-[1.85rem] cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-ink-soft hover:text-ink focus-visible:text-ink focus-visible:outline-none',
                  tagsManageOpen && 'text-ink'
                )}
                aria-label="Tags"
                aria-pressed={tagsManageOpen}
                title="Tags"
                onClick={() => {
                  setGraphSettingsOpen(false)
                  setTagViewId(null)
                  setTagsManageOpen((open) => !open)
                }}
              >
                <Tags size={16} />
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex size-[1.85rem] cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-ink-soft hover:text-ink focus-visible:text-ink focus-visible:outline-none',
                  graphSettingsOpen && 'text-ink'
                )}
                aria-label="Ajustes de la gráfica"
                aria-expanded={graphSettingsOpen}
                title="Ajustes de la gráfica"
                onClick={() => setGraphSettingsOpen((open) => !open)}
              >
                <Settings size={16} />
              </button>
              {graphSettingsOpen ? (
                <div className={graphPanel} role="dialog" aria-label="Ajustes de la gráfica">
                  <label className={rangeLabel}>
                    Profundidad
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={graphDepth}
                      aria-label="Profundidad de la gráfica"
                      onChange={(event) => setGraphDepth(clampDepth(event.target.value))}
                    />
                    <span>{graphDepth}</span>
                  </label>
                  <label className={rangeLabel}>
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
                  <label className={rangeLabel}>
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
                  <label className={checkLabel}>
                    <input
                      type="checkbox"
                      checked={showArrows}
                      onChange={(event) => setShowArrows(event.target.checked)}
                    />
                    Flechas
                  </label>
                  <label className={checkLabel}>
                    <input
                      type="checkbox"
                      checked={showLabels}
                      onChange={(event) => setShowLabels(event.target.checked)}
                    />
                    Nombres
                  </label>
                  {showLabels ? (
                    <label className={rangeLabel}>
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
                  <label className={checkLabel}>
                    <input
                      type="checkbox"
                      checked={showTags}
                      onChange={(event) => setShowTags(event.target.checked)}
                    />
                    Tags
                  </label>
                  <label className={checkLabel}>
                    <input
                      type="checkbox"
                      checked={showCourses}
                      onChange={(event) => setShowCourses(event.target.checked)}
                    />
                    Cursos
                  </label>
                  <label className={checkLabel}>
                    <input
                      type="checkbox"
                      checked={showFiles}
                      onChange={(event) => setShowFiles(event.target.checked)}
                    />
                    Archivos
                  </label>
                  <label className={checkLabel}>
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
                      className={cn(btnGhost, 'self-start px-[0.55rem] py-[0.2rem] text-xs')}
                      onClick={() => {
                        setGraphSelection(null)
                        setGraphReset((value) => value + 1)
                      }}
                    >
                      Reiniciar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="relative px-3 pb-[0.35rem]" data-graph-finder="">
            <div className={searchInList}>
              <svg
                className="pointer-events-none"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="search"
                value={graphQuery}
                placeholder="Buscar y enfocar…"
                aria-label="Buscar un nodo de la gráfica"
                aria-autocomplete="list"
                aria-controls="graph-node-results"
                aria-expanded={Boolean(graphQuery.trim())}
                onChange={(event) => {
                  setGraphQuery(event.target.value)
                  setGraphQueryIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setGraphQuery('')
                    setGraphQueryIndex(0)
                    return
                  }
                  if (!graphMatches.length) return
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setGraphQueryIndex((index) => (index + 1) % graphMatches.length)
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setGraphQueryIndex(
                      (index) => (index - 1 + graphMatches.length) % graphMatches.length
                    )
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    focusGraphNode(graphMatches[Math.min(graphQueryIndex, graphMatches.length - 1)])
                  }
                }}
              />
            </div>
            {graphQuery.trim() ? (
              <ul
                id="graph-node-results"
                className="absolute top-[calc(100%-0.2rem)] right-3 left-3 z-[5] m-0 max-h-56 list-none overflow-auto rounded-md border border-ink/10 bg-surface p-1 shadow-lift"
                role="listbox"
                aria-label="Nodos"
                onMouseDown={(event) => event.preventDefault()}
              >
                {graphMatches.length ? (
                  graphMatches.map((node, index) => {
                    const active = index === Math.min(graphQueryIndex, graphMatches.length - 1)
                    return (
                      <li key={node.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={cn(graphOption, active && 'is-active')}
                          onMouseEnter={() => setGraphQueryIndex(index)}
                          onClick={() => focusGraphNode(node)}
                        >
                          <span>{node.data?.fullLabel || node.data?.label}</span>
                          {node.data?.kindLabel ? <small>{node.data.kindLabel}</small> : null}
                        </button>
                      </li>
                    )
                  })
                ) : (
                  <li className="px-2 py-[0.4rem] text-xs text-ink-soft">Ningún nodo.</li>
                )}
              </ul>
            ) : null}
          </div>
          {graph.nodes.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-[0.7rem] px-3 pt-[0.45rem] text-xs text-ink-soft [&_li]:inline-flex [&_li]:items-center [&_li]:gap-[0.3rem] [&_i]:size-2 [&_i]:rounded-full [&_i]:bg-[#6b6578] [&_i[data-kind=finding]]:bg-[#e84570] [&_i[data-kind=topic]]:bg-[#3d7a7a] [&_i[data-kind=course]]:bg-[#c47b2d] [&_i[data-kind=file]]:bg-[#6a4c9c]">
              <li>
                <i data-kind="finding" /> Nota
              </li>
              {showTags ? (
                <li>
                  <i data-kind="topic" /> Tag
                </li>
              ) : null}
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
            showTags={showTags}
            showOrphans={showOrphans}
            highlightIds={graphVisibility.highlightIds}
            selectedId={graphSelection}
            focusId={graphFocus.id}
            focusToken={graphFocus.token}
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

export default AnnotationsWorkspace
