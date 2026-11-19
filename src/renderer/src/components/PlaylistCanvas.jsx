import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { toast } from 'react-hot-toast'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  NodeResizer,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useOnSelectionChange,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import AppNav from './AppNav'
import CourseDetailPanel from './CourseDetailPanel'
import CoursePickBox from './CoursePickBox'
import CourseZipBar from './CourseZipBar'
import CourseFilterBar from './CourseFilterBar'
import CourseEditModal from './CourseEditModal'
import CoverSearchModal from './CoverSearchModal'
import PlaylistBuilder from './PlaylistBuilder'
import brandMark from '../assets/img/brand-mark.svg'
import { InstitutionMark } from './InstitutionMark'
import { cn } from '../ui/cn'
import { btnGhost, btnPrimary } from '../ui/classes'
import { MAX_NESTED, settleNesting } from '../../../shared/playlistNest.js'
import { applyCoursePick, collectExportCoursePaths } from '../../../shared/courseExportSelection.js'
import { courseCatalog, sameFolder } from '../../../shared/courseFolderMatch.js'
import {
  PLAYLIST_CARD_H,
  PLAYLIST_COVER_H,
  PLAYLIST_DEFAULT_W,
  PLAYLIST_GAP,
  PLAYLIST_HEADER,
  PLAYLIST_MAX_W,
  PLAYLIST_MIN_W,
  PLAYLIST_PAD_X,
  NEST_FRAME_X,
  NEST_COURSE_X,
  buildFlow,
  contentHeight,
  courseNodeId,
  frameSlots,
  dominantTheme,
  orderPlaylists,
  placeWithoutOverlap,
  separateOverlaps,
  playlistAtPoint,
  reorderCoursePaths,
  withFittedHeight
} from '../learning/playlistLayout'
import {
  collectCourseFacets,
  courseMatchesLibraryFilters,
  libraryFiltersActive,
  projectPlaylists,
  useDebouncedValue
} from '../utils/courseFilters'

const BoardActions = createContext(null)

const frameIcon =
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-ink/10 bg-surface p-0 text-ink hover:shadow-lift [&_svg]:transition-transform [&_svg]:duration-[120ms] [&_svg]:ease-pop [&.is-collapsed_svg]:-rotate-90'
const frame =
  'relative flex h-full w-full flex-col rounded-lg border border-ink/10 bg-surface shadow-[inset_3px_0_0_var(--color-coral),var(--shadow-card)]'
const titlePill =
  'm-0 ml-[0.4rem] block w-max max-w-[min(64rem,72vw)] cursor-grab overflow-hidden rounded-full border border-ink/10 bg-surface px-[0.6rem] py-[0.16rem] font-display text-[0.9rem] leading-[1.2] font-extrabold text-ellipsis whitespace-nowrap text-ink shadow-lift select-none [field-sizing:content] focus:cursor-text focus:shadow-[0_0_0_2px_var(--color-coral)] focus:outline-none focus:select-text'
const courseCard =
  'relative flex h-full items-center gap-2 rounded-md border border-ink/10 bg-surface py-[0.35rem] pr-[0.4rem] pl-2 shadow-card cursor-grab [&>label]:absolute [&>label]:top-[0.35rem] [&>label]:left-[0.35rem] [&>label]:z-[4]'
const courseCover =
  'flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-cream-deep [&_img]:size-full [&_img]:object-cover [&_img.is-mark]:size-[22px] [&_img.is-mark]:object-contain'
const rowCover =
  'flex size-[42px] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-cream-deep [&_img]:size-full [&_img]:object-cover [&_img.is-mark]:size-[22px] [&_img.is-mark]:object-contain'
const statusMark =
  'pointer-events-none absolute z-[2] hidden items-center rounded-full border border-chip-status-border bg-chip-status px-[0.65rem] py-[0.28rem] text-[0.7rem] font-extrabold tracking-[0.03em] text-chip-status-text uppercase'
const pickBox =
  'grid size-[1.45rem] shrink-0 cursor-pointer place-items-center rounded-[0.35rem] border border-ink/10 bg-surface shadow-card [&_input]:m-0 [&_input]:size-[0.95rem] [&_input]:cursor-pointer [&_input]:accent-coral'
const menuItem =
  'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[0.875rem] font-bold text-ink hover:bg-[rgba(42,36,56,0.05)] disabled:cursor-not-allowed disabled:opacity-50'
const popover =
  'absolute top-[calc(100%+6px)] right-0 z-[5] min-w-[17rem] rounded-md border border-ink/10 bg-surface p-1.5 shadow-panel'
const searchBox =
  'relative min-w-0 max-w-none flex-none [&_input]:h-auto [&_input]:w-full [&_input]:rounded-full [&_input]:border [&_input]:border-ink/10 [&_input]:bg-surface [&_input]:py-[0.7rem] [&_input]:pr-4 [&_input]:pl-[2.6rem] [&_input]:text-ink [&_input]:shadow-none [&_input]:outline-none [&_input]:focus:shadow-find [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:top-1/2 [&_svg]:left-[0.95rem] [&_svg]:size-4 [&_svg]:-translate-y-1/2 [&_svg]:opacity-55'
const chipSelect =
  'flex min-w-0 [&_select]:min-w-0 [&_select]:flex-1 [&_select]:cursor-pointer [&_select]:rounded-full [&_select]:border [&_select]:border-ink/10 [&_select]:bg-surface [&_select]:px-3 [&_select]:py-[0.35rem] [&_select]:text-[0.82rem] [&_select]:font-semibold [&_select]:text-ink [&_select]:shadow-none'
const filterPill =
  'inline-flex cursor-pointer items-center gap-[0.4rem] rounded-full border border-ink/10 bg-surface px-[0.65rem] py-[0.28rem] text-[0.75rem] font-bold text-ink shadow-none aria-pressed:bg-teal aria-pressed:text-white'
const board =
  'flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(232,69,112,0.05),transparent_40%),radial-gradient(circle_at_88%_8%,rgba(61,122,122,0.05),transparent_38%),var(--color-cream-deep)] [&_.react-flow]:size-full [&_.react-flow]:bg-transparent [&_.react-flow__node-playlist]:cursor-default [&_.react-flow__node-playlist]:overflow-visible [&_.react-flow__node-playlist]:rounded-none [&_.react-flow__node-playlist]:border-0 [&_.react-flow__node-playlist]:bg-transparent [&_.react-flow__node-playlist]:p-0 [&_.react-flow__node-playlist]:text-left [&_.react-flow__node-playlist]:text-inherit [&_.react-flow__node-playlist]:shadow-none [&_.react-flow__node-course]:overflow-visible [&_.react-flow__node-course]:rounded-none [&_.react-flow__node-course]:border-0 [&_.react-flow__node-course]:bg-transparent [&_.react-flow__node-course]:p-0 [&_.react-flow__node-course]:text-left [&_.react-flow__node-course]:text-inherit [&_.react-flow__node-course]:shadow-none [&_.react-flow__node-course.selected_article]:shadow-[0_0_0_2px_var(--color-coral),var(--shadow-card)] [&_.react-flow__edge]:pointer-events-none [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-md [&_.react-flow__controls]:border [&_.react-flow__controls]:border-ink/10 [&_.react-flow__controls]:shadow-card [&_.react-flow__controls-button]:border-b-ink/10 [&_.react-flow__controls-button]:bg-surface [&_.react-flow__controls-button]:fill-ink [&_.react-flow__controls-button:hover]:bg-cream [&_.react-flow__minimap]:overflow-hidden [&_.react-flow__minimap]:rounded-md [&_.react-flow__minimap]:border [&_.react-flow__minimap]:border-ink/10 [&_.react-flow__minimap]:bg-surface [&_.react-flow__minimap]:shadow-card [&_.react-flow__attribution]:bg-transparent [&_.react-flow__attribution]:text-ink-soft [&_.detail-panel]:w-detail [&_.detail-panel]:max-w-none [&_.detail-panel]:flex-none [&_.detail-panel]:border-t-0 [&_.detail-panel]:border-l [&_.detail-panel]:border-ink/10 max-[900px]:[&_.detail-panel]:w-[min(100vw,300px)] max-[800px]:[&_.detail-panel]:!w-full max-[800px]:[&_.detail-panel]:max-h-[45vh] max-[800px]:[&_.detail-panel]:border-t max-[800px]:[&_.detail-panel]:border-l-0'
const boardFilters =
  'relative z-[4] flex min-w-0 flex-wrap items-center gap-2 border-b border-ink/10 bg-surface-muted px-3 py-[0.55rem] [&_.search-field]:max-w-[22rem] [&_.search-field]:min-w-[9rem] [&_.search-field]:flex-[0_1_18rem] [&_.search-field_input]:h-8 [&_.search-field_input]:py-0 [&_.search-field_input]:pr-[0.85rem] [&_.search-field_input]:pl-[2.15rem] [&_.search-field_input]:text-[0.8125rem] [&_.search-field__icon]:left-3 [&_.header-programs]:flex-auto'

function heightToStore(height, count, bigCover) {
  if (!bigCover) return height
  const extra = contentHeight(count, PLAYLIST_COVER_H) - contentHeight(count, PLAYLIST_CARD_H)
  return Math.max(contentHeight(count), height - extra)
}

function showPlaylists(list, cardHeight = PLAYLIST_CARD_H) {
  const settled = settleNesting(list)
  const byId = new Map(settled.map((playlist) => [playlist.id, playlist]))
  return settled.map((playlist) => withFittedHeight(playlist, cardHeight, byId))
}

function readNodeSize(node, fallback) {
  const width = node.measured?.width ?? node.width ?? node.style?.width ?? fallback.width
  const height = node.measured?.height ?? node.height ?? node.style?.height ?? fallback.height
  return {
    width: typeof width === 'number' ? width : fallback.width,
    height: typeof height === 'number' ? height : fallback.height
  }
}

function nestViews(slots) {
  return slots
    .filter((slot) => slot.kind === 'nest')
    .map((slot) => ({
      childId: slot.childId,
      title: slot.title,
      why: slot.why,
      count: slot.count,
      y: slot.y,
      height: slot.boxHeight,
      collapsed: Boolean(slot.collapsed)
    }))
}

function applyCoverWidth(nodes, playlist, width, playlists) {
  const byId = new Map(playlists.map((item) => [item.id, item]))
  const fitted = withFittedHeight(
    { ...playlist, size: { ...playlist.size, width } },
    PLAYLIST_COVER_H,
    byId
  )
  const { slots } = frameSlots(fitted, byId, PLAYLIST_COVER_H)
  const byNode = new Map(
    slots
      .filter((slot) => slot.kind === 'course')
      .map((slot) => [courseNodeId(slot.ownerId, slot.coursePath), slot])
  )
  const nests = nestViews(slots)
  return nodes.map((node) => {
    if (node.id === fitted.id && node.type === 'playlist') {
      return {
        ...node,
        data: { ...node.data, nests }
      }
    }
    if (node.parentId !== fitted.id || node.type !== 'course') return node
    const slot = byNode.get(node.id)
    if (!slot) return node
    return {
      ...node,
      position: { x: slot.x, y: slot.y },
      width: slot.width,
      height: slot.height,
      style: { ...node.style, width: slot.width, height: slot.height },
      data: {
        ...node.data,
        continues: slot.continues,
        columns: slot.columns,
        inset: slot.inset,
        innerWidth: slot.innerWidth
      }
    }
  })
}

function forwardBoardDrag(id, event) {
  if (event.button !== 0) return
  const handle = document.querySelector(
    `.playlist-frame[data-playlist-id="${CSS.escape(id)}"] .playlist-frame__drag`
  )
  if (!handle) return
  event.stopPropagation()
  handle.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: 0,
      buttons: 1
    })
  )
}

function ListTitle({ id, title }) {
  const actions = useContext(BoardActions)
  const inputRef = useRef(null)
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(false)

  if (actions?.focusPlaylistId === id && !editing) setEditing(true)

  useEffect(() => {
    setDraft(title)
  }, [title])

  useLayoutEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input || document.activeElement === input) return
    input.focus()
    input.select()
  }, [editing])

  const commit = (event) => {
    const next = event.target.value.trim() || 'Nueva lista'
    setDraft(next)
    setEditing(false)
    if (next !== title) actions?.renamePlaylist(id, next)
  }

  const startEditing = (event) => {
    event.stopPropagation()
    setEditing(true)
  }

  return (
    <>
      <div className="relative flex min-w-0 flex-1 items-center">
        <span
          className="w-full min-w-0 cursor-grab overflow-hidden border-0 bg-transparent font-display text-[1.5rem] font-extrabold text-ellipsis whitespace-nowrap text-ink select-none outline-none focus:cursor-text focus:shadow-[0_1px_0_var(--color-coral)] focus:select-text"
          onDoubleClick={startEditing}
        >
          {draft}
        </span>
      </div>
      <NodeToolbar
        isVisible
        position={Position.Top}
        align="start"
        offset={6}
        className="nodrag nopan nowheel pointer-events-auto"
        style={{ zIndex: actions?.selectedId === id ? 50 : 40 }}
        onMouseDown={(event) => {
          if (editing || event.target instanceof HTMLInputElement) return
          forwardBoardDrag(id, event)
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className={titlePill}
            aria-label="Nombre de la lista"
            data-playlist-title={id}
            value={draft}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              event.stopPropagation()
            }}
          />
        ) : (
          <span className={titlePill} onDoubleClick={startEditing}>
            {draft}
          </span>
        )}
      </NodeToolbar>
    </>
  )
}

function PlaylistNode({ id, data }) {
  const actions = useContext(BoardActions)
  const dropHere = actions?.dropId === id
  const current = actions?.selectedId === id

  return (
    <div
      className={cn(
        'playlist-frame',
        frame,
        current &&
          'shadow-[inset_3px_0_0_var(--color-coral),0_0_0_2px_rgba(232,69,112,0.35),var(--shadow-card)]',
        dropHere &&
          'shadow-[inset_3px_0_0_var(--color-coral),0_0_0_2px_var(--color-coral),var(--shadow-lift)]',
        actions?.isListPicked?.(id) && 'outline outline-2 outline-offset-2 outline-coral'
      )}
      data-playlist-id={id}
    >
      <NodeResizer
        minWidth={PLAYLIST_MIN_W}
        maxWidth={PLAYLIST_MAX_W}
        minHeight={data.minHeight}
        maxHeight={data.minHeight}
        color="#e84570"
        lineClassName=""
        handleClassName="size-2 rounded-[2px] border border-coral bg-surface"
      />
      <header className="playlist-frame__drag flex h-14 cursor-grab items-center gap-[0.4rem] pr-[0.65rem] pl-[0.4rem]" title={data.why || undefined}>
        <button
          type="button"
          className={cn(frameIcon, 'nodrag nopan', data.collapsed && 'is-collapsed')}
          aria-expanded={!data.collapsed}
          aria-label={data.collapsed ? `Expandir ${data.title}` : `Contraer ${data.title}`}
          onClick={() => actions?.toggleCollapsed(id)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
          </svg>
        </button>
        <CoursePickBox
          className={cn(pickBox, 'nodrag nopan')}
          checked={Boolean(actions?.isListPicked?.(id))}
          label={`Seleccionar lista ${data.title}`}
          onPick={() => actions?.toggleListPick(id)}
        />
        <ListTitle id={id} title={data.title} />
        <FrameCount count={data.count} total={data.totalCount} />
        <button
          type="button"
          className={cn(frameIcon, 'nodrag nopan')}
          aria-label={`Quitar lista ${data.title}`}
          onClick={() => actions?.deletePlaylist(id)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </header>
      {(data.nests || []).map((nest) => (
        <div
          key={nest.childId}
          className="nodrag nopan pointer-events-none absolute z-[1] box-content flex flex-col rounded-md border border-ink/10 bg-cream shadow-[inset_3px_0_0_var(--color-teal)]"
          style={{ top: nest.y, height: nest.height, left: NEST_FRAME_X, right: NEST_FRAME_X }}
          title={nest.why || undefined}
        >
          <div className="pointer-events-auto flex h-10 shrink-0 items-center gap-[0.35rem] pr-[0.35rem] pl-[0.7rem]">
            <button
              type="button"
              className={cn(frameIcon, nest.collapsed && 'is-collapsed')}
              aria-expanded={!nest.collapsed}
              aria-label={nest.collapsed ? `Expandir ${nest.title}` : `Contraer ${nest.title}`}
              onClick={() => actions?.toggleCollapsed(nest.childId)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>
            <CoursePickBox
              className={pickBox}
              checked={Boolean(actions?.isListPicked?.(nest.childId))}
              label={`Seleccionar lista ${nest.title}`}
              onPick={() => actions?.toggleListPick(nest.childId)}
            />
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer overflow-hidden border-0 bg-transparent p-0 text-left font-display text-[0.86rem] font-extrabold text-ellipsis whitespace-nowrap text-ink"
              onClick={() => actions?.selectPlaylist(nest.childId)}
            >
              {nest.title}
            </button>
            <FrameCount count={nest.count} total={nest.totalCount} />
            <button
              type="button"
              className={frameIcon}
              aria-label={`Sacar ${nest.title}`}
              onClick={() => actions?.unnestPlaylist(nest.childId)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM5 5h6V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6h-2v6H5V5z" />
              </svg>
            </button>
          </div>
        </div>
      ))}
      {data.collapsed || data.count > 0 || (data.nests || []).length ? null : (
        <p className="mx-[0.85rem] mt-[0.35rem] rounded-md border border-dashed border-ink/16 px-3 py-[1.1rem] text-center text-[0.8rem] text-ink-soft">
          {data.filtered && data.totalCount > 0
            ? 'Ningún curso coincide'
            : 'Arrastra un curso o una lista aquí'}
        </p>
      )}
    </div>
  )
}

function useCourseCover(coursePath, hasCover, coverStamp, eager) {
  const ref = useRef(null)
  const [cover, setCover] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!hasCover || !coursePath) {
      setCover(null)
      return undefined
    }

    let cancelled = false
    const load = () => {
      window.api
        .getCoverImageUrl(coursePath)
        .then((url) => {
          if (!cancelled) setCover(url || null)
        })
        .catch(() => {
          if (!cancelled) setCover(null)
        })
    }

    const node = ref.current
    if (eager || !node || typeof IntersectionObserver === 'undefined') {
      load()
      return () => {
        cancelled = true
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        load()
      },
      { rootMargin: '160px', threshold: 0.01 }
    )
    observer.observe(node)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [coursePath, hasCover, coverStamp, eager])

  return {
    ref,
    src: !failed && cover ? cover : null,
    onError: () => setFailed(true)
  }
}

function CourseCover({ coursePath, hasCover, coverStamp, className, eager = false }) {
  const { ref, src, onError } = useCourseCover(coursePath, hasCover, coverStamp, eager)
  return (
    <div ref={ref} className={className}>
      {src ? (
        <img src={src} alt="" draggable={false} onError={onError} />
      ) : (
        <img className="is-mark" src={brandMark} alt="" draggable={false} />
      )}
    </div>
  )
}

function CourseNode({ data }) {
  const actions = useContext(BoardActions)

  const meta = data.missing
    ? 'No está en la biblioteca'
    : [data.institution, typeof data.percent === 'number' ? `${data.percent}%` : '']
        .filter(Boolean)
        .join(' · ') || 'Curso'

  return (
    <article
      className={cn(
        courseCard,
        data.missing && 'bg-cream',
        data.inProcess && 'shadow-[inset_3px_0_0_var(--color-coral),var(--shadow-card)]',
        data.continues &&
          "after:absolute after:top-full after:left-[1.35rem] after:h-[var(--playlist-gap)] after:w-[1.5px] after:bg-[rgba(42,36,56,0.38)] after:content-['']",
        data.bigCover &&
          'flex-col items-stretch gap-0 p-0 [&_.cover]:h-auto [&_.cover]:w-full [&_.cover]:min-h-0 [&_.cover]:flex-1 [&_.cover]:rounded-t-[13px] [&_.cover_img.is-mark]:size-12 [&_.actions]:absolute [&_.actions]:top-[0.4rem] [&_.actions]:right-[0.4rem] [&_.actions]:flex-row [&_.text]:flex-none [&_.text]:px-[0.6rem] [&_.text]:pt-[0.4rem] [&_.text]:pb-[0.5rem]',
        data.bigCover &&
          data.continues &&
          'after:left-1/2 after:-ml-[0.75px]',
        (actions?.detailPath === data.coursePath || actions?.detailPath === data.libraryPath) &&
          'shadow-[0_0_0_2px_var(--color-coral),var(--shadow-card)]',
        actions?.isCoursePicked?.(data.coursePath) && 'outline outline-2 outline-offset-1 outline-coral'
      )}
    >
      <CoursePickBox
        className={cn(pickBox, 'nodrag nopan')}
        checked={Boolean(actions?.isCoursePicked?.(data.coursePath))}
        label={`Seleccionar ${data.title}`}
        onPick={(pick) => actions?.toggleCoursePick(data.coursePath, pick)}
      />
      <CourseCover
        coursePath={data.missing ? '' : data.libraryPath || data.coursePath}
        hasCover={data.hasCover}
        coverStamp={data.coverStamp}
        className={cn(courseCover, 'cover')}
        eager
      />
      {data.inProcess ? (
        <span className={cn(statusMark, 'top-[0.45rem] left-[0.45rem]', data.bigCover && 'inline-flex')}>
          En curso
        </span>
      ) : null}
      <div className="text min-w-0 flex-1 [&_h3]:m-0 [&_h3]:truncate [&_h3]:font-display [&_h3]:text-[0.9rem] [&_h3]:font-extrabold [&_p]:m-0 [&_p]:mt-[0.1rem] [&_p]:truncate [&_p]:text-[0.72rem] [&_p]:text-ink-soft">
        <h3 title={data.why ? `${data.title}. ${data.why}` : data.title}>{data.title}</h3>
        {data.missing ? (
          <p title={meta}>{meta}</p>
        ) : (
          <p className="flex min-w-0 items-center gap-[0.2rem] [&_.institution-logo]:block" title={meta}>
            <InstitutionMark institution={data.institution} nameClassName="institution-name" />
            {typeof data.percent === 'number' ? (
              <span>{`${data.institution ? ' · ' : ''}${data.percent}%`}</span>
            ) : null}
            {!data.institution && typeof data.percent !== 'number' ? 'Curso' : null}
          </p>
        )}
      </div>
      <div className="actions nodrag nopan flex flex-col gap-[0.2rem]">
        <button
          type="button"
          className={cn(frameIcon, data.bigCover && 'bg-surface')}
          aria-label={`Abrir ${data.title}`}
          onClick={(event) => {
            event.stopPropagation()
            actions?.openCourse(data.coursePath)
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          type="button"
          className={cn(frameIcon, data.bigCover && 'bg-surface')}
          aria-label={`Quitar ${data.title} de la lista`}
          onClick={(event) => {
            event.stopPropagation()
            actions?.removeCourse(data.playlistId, data.coursePath, data.title)
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
    </article>
  )
}

function FrameCount({ count, total }) {
  const narrowed = typeof total === 'number' && total !== count
  return (
    <span
      className="shrink-0 rounded-full border border-ink/10 bg-cream-deep px-[0.45rem] py-[0.12rem] text-[0.72rem] font-bold text-ink-soft"
      title={narrowed ? `${count} de ${total} cursos` : undefined}
    >
      {narrowed ? `${count}/${total}` : count}
    </span>
  )
}

const nodeTypes = { playlist: PlaylistNode, course: CourseNode }
const SIDEBAR_MIN = 280
const SIDEBAR_MAX = 1080
const SIDEBAR_WIDTH_KEY = 'playlist-sidebar-width'
const COURSE_VIEW_KEY = 'playlist-course-view'
const VIEWPORT_KEY = 'playlist-board-viewport'
const BOARD_MIN_ZOOM = 0.25
const BOARD_MAX_ZOOM = 1.75

function isViewport(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.zoom) &&
    value.zoom > 0
  )
}

function readViewport() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEWPORT_KEY) || 'null')
    if (!isViewport(parsed)) return null
    return {
      x: parsed.x,
      y: parsed.y,
      zoom: Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, parsed.zoom))
    }
  } catch {
    return null
  }
}

let rememberedViewport = readViewport()

function rememberViewport(viewport) {
  if (!isViewport(viewport)) return
  rememberedViewport = {
    x: viewport.x,
    y: viewport.y,
    zoom: Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, viewport.zoom))
  }
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(rememberedViewport))
  } catch {
    // The in-memory viewport still restores this session.
  }
}

function readBigCover() {
  try {
    return localStorage.getItem(COURSE_VIEW_KEY) === 'covers'
  } catch {
    return false
  }
}

function clampSidebar(width, maxAvailable = SIDEBAR_MAX) {
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, maxAvailable))
  return Math.min(max, Math.max(SIDEBAR_MIN, Math.round(width)))
}

function readSidebarWidth() {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    if (Number.isFinite(stored)) return clampSidebar(stored)
  } catch {
    // The width is only a layout preference.
  }
  return 320
}

function courseSignatureOf(courses) {
  return courses
    .map((course) =>
      [
        course.path,
        course.title,
        course.institution,
        course.hasCover ? 1 : 0,
        course.coverStamp || '',
        course.isInProcess ? 1 : 0,
        course.isNew ? 1 : 0,
        course.missingProps ? 1 : 0,
        course.rate ?? '',
        course.instructor || '',
        (course.programs || []).join('\u001e'),
        (course.theme || []).join('\u001e'),
        course.learning?.percent ?? '',
        course.learning?.isRecentlyViewed ? 1 : 0
      ].join('\u001f')
    )
    .join('\n')
}

function PlaylistWorkspace({ courses, onNavigate, onOpenCourse, zipExport }) {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const [orderMenuOpen, setOrderMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [institutionFilter, setInstitutionFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [inProcessOnly, setInProcessOnly] = useState(false)
  const [unlistedOnly, setUnlistedOnly] = useState(false)
  const [boardQuery, setBoardQuery] = useState('')
  const [boardInProcess, setBoardInProcess] = useState(false)
  const [boardNewOnly, setBoardNewOnly] = useState(false)
  const [boardRecentOnly, setBoardRecentOnly] = useState(false)
  const [boardMissingOnly, setBoardMissingOnly] = useState(false)
  const [boardInstitution, setBoardInstitution] = useState('')
  const [boardProgram, setBoardProgram] = useState('')
  const [boardTheme, setBoardTheme] = useState('')
  const [boardMinRate, setBoardMinRate] = useState(0)
  const [bigCover, setBigCover] = useState(readBigCover)
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [selectedId, setSelectedId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [focusPlaylistId, setFocusPlaylistId] = useState(null)
  const [detailPath, setDetailPath] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [coverSearch, setCoverSearch] = useState(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [pickedCourses, setPickedCourses] = useState(() => new Set())
  const [pickedLists, setPickedLists] = useState(() => new Set())
  const [intentReady, setIntentReady] = useState(!window.api?.getPlaylistIntent)
  const [intent, setIntent] = useState({ goal: '', interests: [] })
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const playlistsRef = useRef(playlists)
  const coursesRef = useRef(courses)
  const selectedIdRef = useRef(selectedId)
  const pickAnchorRef = useRef(null)
  const visiblePathsRef = useRef([])
  const canvasRef = useRef(null)
  const orderMenuRef = useRef(null)
  const didFit = useRef(false)
  const cameraReady = useRef(false)
  const aliveRef = useRef(true)
  const [initialViewport] = useState(() => rememberedViewport)
  const creatingRef = useRef(false)
  const bigCoverRef = useRef(bigCover)
  const sidebarWidthRef = useRef(sidebarWidth)
  const displayRef = useRef(playlists)
  const debouncedBoardQuery = useDebouncedValue(boardQuery, 200)
  const boardFilters = useMemo(
    () => ({
      query: debouncedBoardQuery,
      isInProcessOnly: boardInProcess,
      isNewOnly: boardNewOnly,
      recentlyViewedOnly: boardRecentOnly,
      missingPropsOnly: boardMissingOnly,
      institution: boardInstitution,
      program: boardProgram,
      theme: boardTheme,
      minRate: boardMinRate
    }),
    [
      debouncedBoardQuery,
      boardInProcess,
      boardNewOnly,
      boardRecentOnly,
      boardMissingOnly,
      boardInstitution,
      boardProgram,
      boardTheme,
      boardMinRate
    ]
  )
  const boardFiltersRef = useRef(boardFilters)
  playlistsRef.current = playlists
  bigCoverRef.current = bigCover
  sidebarWidthRef.current = sidebarWidth
  boardFiltersRef.current = boardFilters
  displayRef.current = projectPlaylists(playlists, courseCatalog(courses), boardFilters)
  coursesRef.current = courses
  selectedIdRef.current = selectedId

  const { fitView, getViewport, getZoom, screenToFlowPosition, setCenter, setViewport } =
    useReactFlow()
  const nodesReady = useNodesInitialized()
  const courseSignature = useMemo(() => courseSignatureOf(courses), [courses])

  const courseMap = useCallback(() => courseCatalog(coursesRef.current), [])

  const syncFlow = useCallback(
    (list, covers = bigCoverRef.current) => {
      const filters = boardFiltersRef.current
      const map = courseMap()
      const locked = libraryFiltersActive(filters)
      const projected = projectPlaylists(list, map, filters)
      displayRef.current = projected
      const built = buildFlow(projected, map, {
        cardHeight: covers ? PLAYLIST_COVER_H : PLAYLIST_CARD_H,
        coursesLocked: locked,
        fullById: locked ? new Map(list.map((playlist) => [playlist.id, playlist])) : null
      })
      setNodes(built.nodes)
      setEdges(built.edges)
    },
    [courseMap, setEdges, setNodes]
  )

  useEffect(() => {
    syncFlow(playlists, bigCover)
  }, [playlists, courseSignature, bigCover, boardFilters, syncFlow])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
    } catch {
      // Ignore storage failures; the width still applies for this session.
    }
  }, [sidebarWidth])

  useEffect(() => {
    try {
      localStorage.setItem(COURSE_VIEW_KEY, bigCover ? 'covers' : 'list')
    } catch {
      // Ignore storage failures; the view still applies for this session.
    }
  }, [bigCover])

  const onSidebarResizeStart = useCallback((event) => {
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = sidebarWidthRef.current
    const body = handle.closest('.playlist-board__body')
    const max = (body?.clientWidth || SIDEBAR_MAX) - 240

    const onMove = (moveEvent) => {
      setSidebarWidth(clampSidebar(startWidth + moveEvent.clientX - startX, max))
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }, [])

  const onSidebarResizeKey = useCallback((event) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const body = event.currentTarget.closest('.playlist-board__body')
    const max = (body?.clientWidth || SIDEBAR_MAX) - 240
    const delta = event.key === 'ArrowRight' ? step : -step
    setSidebarWidth((width) => clampSidebar(width + delta, max))
  }, [])

  const catalogKey = useMemo(
    () => [...courses.map((course) => course.path)].sort().join('\0'),
    [courses]
  )
  const catalogKeyRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!window.api?.listPlaylists) {
      setLoading(false)
      toast.error('Las listas no están disponibles')
      return undefined
    }
    window.api
      .listPlaylists()
      .then((list) => {
        if (!cancelled) setPlaylists(showPlaylists(list || []))
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'No se pudieron cargar las listas')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return window.api.onPlaylistsChanged?.(() => {
      const cardHeight = bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
      window.api
        .listPlaylists?.()
        .then((list) => {
          if (list) setPlaylists(showPlaylists(list, cardHeight))
        })
        .catch(() => {})
    })
  }, [])

  useEffect(() => {
    if (catalogKeyRef.current === null) {
      catalogKeyRef.current = catalogKey
      return undefined
    }
    if (catalogKeyRef.current === catalogKey) return undefined
    catalogKeyRef.current = catalogKey
    let cancelled = false
    window.api
      .listPlaylists?.()
      .then((list) => {
        if (!cancelled && list) {
          const cardHeight = bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
          setPlaylists(showPlaylists(list, cardHeight))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [catalogKey])

  useEffect(() => {
    if (didFit.current) return
    if (initialViewport) {
      didFit.current = true
      cameraReady.current = true
      setViewport(initialViewport, { duration: 0 })
      return
    }
    if (loading) return
    if (playlists.length === 0) {
      didFit.current = true
      cameraReady.current = true
      return
    }
    if (!nodesReady) return
    didFit.current = true
    cameraReady.current = true
    fitView({ padding: 0.18, duration: 250 }).finally(() => {
      if (!aliveRef.current) return
      cameraReady.current = true
      rememberViewport(getViewport())
    })
  }, [loading, nodesReady, playlists.length, fitView, getViewport, initialViewport, setViewport])

  const onMoveEnd = useCallback((_, viewport) => {
    if (!cameraReady.current) return
    rememberViewport(viewport)
  }, [])

  useEffect(() => {
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (selectedId && !playlists.some((playlist) => playlist.id === selectedId)) {
      setSelectedId(null)
    }
  }, [playlists, selectedId])

  useEffect(() => {
    if (!focusPlaylistId) return undefined
    const frame = window.requestAnimationFrame(() => {
      const input = document.querySelector(`[data-playlist-title="${CSS.escape(focusPlaylistId)}"]`)
      if (!(input instanceof HTMLInputElement)) return
      const playlist = playlistsRef.current.find((item) => item.id === focusPlaylistId)
      if (playlist) {
        const fitted = withFittedHeight(
          playlist,
          bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
        )
        setCenter(
          fitted.position.x + fitted.size.width / 2,
          fitted.position.y + fitted.size.height / 2,
          {
            zoom: getZoom(),
            duration: 250
          }
        )
      }
      input.focus()
      input.select()
      setFocusPlaylistId(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusPlaylistId, nodes, getZoom, setCenter])

  useOnSelectionChange({
    onChange: ({ nodes: selected }) => {
      const frame = selected.find((node) => node.type === 'playlist')
      const course = selected.find((node) => node.type === 'course')
      const next = frame?.id || course?.data?.playlistId || null
      setSelectedId((current) => (current === next ? current : next))
    }
  })

  const persistPlaylist = useCallback(async (playlist) => {
    const cardHeight = bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
    const merged = playlistsRef.current.map((item) =>
      item.id === playlist.id ? { ...item, ...playlist } : item
    )
    const next = showPlaylists(merged, cardHeight)
    const saved = next.find((item) => item.id === playlist.id) || playlist
    setPlaylists(next)
    try {
      await window.api.upsertPlaylist(saved)
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar la lista')
      const fresh = await window.api.listPlaylists().catch(() => null)
      if (fresh) setPlaylists(showPlaylists(fresh, cardHeight))
    }
  }, [])

  const renamePlaylist = useCallback(
    (id, title) => {
      const current = playlistsRef.current.find((playlist) => playlist.id === id)
      if (!current || current.title === title) return
      persistPlaylist({ ...current, title })
    },
    [persistPlaylist]
  )

  const toggleCollapsed = useCallback(
    (id) => {
      const current = playlistsRef.current.find((playlist) => playlist.id === id)
      if (!current) return
      persistPlaylist({ ...current, collapsed: !current.collapsed })
    },
    [persistPlaylist]
  )

  const deletePlaylist = useCallback((id) => {
    const current = playlistsRef.current.find((playlist) => playlist.id === id)
    const label = current?.title || 'esta lista'
    if (!window.confirm(`¿Quitar «${label}» del tablero? Los cursos siguen en la biblioteca.`)) {
      return
    }
    setPlaylists((prev) => showPlaylists(prev.filter((playlist) => playlist.id !== id)))
    window.api.deletePlaylist(id).catch(async (err) => {
      toast.error(err.message || 'No se pudo quitar la lista')
      const fresh = await window.api.listPlaylists().catch(() => null)
      if (fresh) setPlaylists(showPlaylists(fresh))
    })
  }, [])

  const removeCourse = useCallback(
    (playlistId, coursePath, title) => {
      const current = playlistsRef.current.find((playlist) => playlist.id === playlistId)
      if (!current) return
      const course = courseCatalog(coursesRef.current).get(coursePath)
      const label = String(title || course?.title || 'este curso').trim() || 'este curso'
      const list = current.title || 'la lista'
      if (!window.confirm(`¿Quitar «${label}» de «${list}»? El curso sigue en la biblioteca.`)) {
        return
      }
      persistPlaylist({
        ...current,
        coursePaths: current.coursePaths.filter((item) => !sameFolder(item, coursePath))
      })
    },
    [persistPlaylist]
  )

  const openCourse = useCallback(
    (coursePath) => {
      const course = courseCatalog(coursesRef.current).get(coursePath)
      if (!course) {
        toast.error('Ese curso no está en la biblioteca')
        return
      }
      onOpenCourse?.(course)
    },
    [onOpenCourse]
  )

  const previewCourse = useCallback((coursePath) => {
    const course = courseCatalog(coursesRef.current).get(coursePath)
    if (!course) {
      toast.error('Ese curso no está en la biblioteca')
      return
    }
    setDetailPath(course.path)
  }, [])

  const toggleInProcess = useCallback(async (course, newValue) => {
    const result = await window.api.updateCourseProperty(course.path, 'isInProcess', newValue)
    if (!result.success) throw new Error(result.error || 'Update failed')
    toast.success(newValue ? 'Marcado en curso' : 'Quitado de en curso')
  }, [])

  const generateProps = useCallback(async (course) => {
    try {
      await window.api.generateCourseProps(course.path)
      toast.success('Propiedades generadas')
    } catch (err) {
      toast.error(err.message || 'Error')
    }
  }, [])

  useEffect(() => {
    if (!detailPath) return undefined
    if (courses.some((course) => course.path === detailPath)) return undefined
    setDetailPath(null)
    return undefined
  }, [courses, detailPath])

  useEffect(() => {
    if (!detailPath) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || editingCourse || coverSearch || builderOpen) return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (event.target?.isContentEditable) return
      setDetailPath(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailPath, editingCourse, coverSearch, builderOpen])

  const addCourse = useCallback(
    (playlistId, coursePath) => {
      const list = playlistsRef.current
      let id = playlistId
      if (!id) {
        if (
          selectedIdRef.current &&
          list.some((playlist) => playlist.id === selectedIdRef.current)
        ) {
          id = selectedIdRef.current
        } else if (list.length === 1) {
          id = list[0].id
        }
      }
      if (!id) {
        toast.error(list.length ? 'Selecciona una lista' : 'Crea una lista primero')
        return
      }
      const playlist = list.find((item) => item.id === id)
      if (!playlist) return
      if (playlist.coursePaths.some((item) => sameFolder(item, coursePath))) {
        toast('Ese curso ya está en la lista')
        return
      }
      setSelectedId(id)
      persistPlaylist({
        ...playlist,
        collapsed: false,
        coursePaths: [...playlist.coursePaths, coursePath]
      })
    },
    [persistPlaylist]
  )

  useEffect(() => {
    if (!window.api?.getPlaylistIntent) return undefined
    let cancelled = false
    window.api
      .getPlaylistIntent()
      .then((next) => {
        if (!cancelled && next) setIntent(next)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIntentReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveIntent = useCallback((next) => {
    setIntent(next)
    const save = window.api?.savePlaylistIntent
    if (!save) return
    save(next).catch(() => {})
  }, [])

  const cardHeightNow = useCallback(
    () => (bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H),
    []
  )

  const playlistOrigin = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    let position = { x: 48, y: 48 }
    if (rect && rect.width > 0) {
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height * 0.38, 280)
      })
      position = { x: center.x - PLAYLIST_DEFAULT_W / 2, y: center.y - 40 }
    }
    return position
  }, [screenToFlowPosition])

  const openPosition = useCallback(
    (occupied, size, preferred) =>
      placeWithoutOverlap(occupied, size, preferred, { cardHeight: cardHeightNow() }),
    [cardHeightNow]
  )

  const createBuiltLists = useCallback(
    async (lists) => {
      const origin = playlistOrigin()
      const cardHeight = cardHeightNow()
      const created = []
      for (const item of lists) {
        const steps = Array.isArray(item.children) ? item.children : []
        const flat = steps.length === 1
        const children = []
        for (const child of flat ? [] : steps) {
          const childPaths = child.coursePaths || []
          const savedChild = await window.api.upsertPlaylist({
            title: child.title || 'Nuevo paso',
            why: child.why || '',
            courseWhys: child.courseWhys || {},
            childIds: [],
            position: origin,
            size: {
              width: PLAYLIST_DEFAULT_W,
              height: contentHeight(childPaths.length, cardHeight)
            },
            coursePaths: childPaths
          })
          children.push(savedChild)
        }
        const coursePaths = [...(item.coursePaths || [])]
        const courseWhys = { ...(item.courseWhys || {}) }
        if (flat) {
          const only = steps[0]
          const seen = new Set(coursePaths)
          for (const coursePath of only.coursePaths || []) {
            if (seen.has(coursePath)) continue
            seen.add(coursePath)
            coursePaths.push(coursePath)
          }
          Object.assign(courseWhys, only.courseWhys || {})
        }
        const childIds = children.map((child) => child.id)
        const draft = {
          title: item.title || 'Nueva lista',
          why: item.why || (flat ? steps[0].why || '' : ''),
          courseWhys,
          childIds,
          position: { x: 0, y: 0 },
          size: {
            width: PLAYLIST_DEFAULT_W,
            height: contentHeight(coursePaths.length, cardHeight)
          },
          coursePaths
        }
        const byId = new Map(
          [...playlistsRef.current, ...created, ...children, { ...draft, id: 'draft' }].map(
            (playlist) => [playlist.id, playlist]
          )
        )
        const visual = withFittedHeight({ ...draft, id: 'draft' }, cardHeight, byId)
        const nestedIds = new Set(created.flatMap((playlist) => playlist.childIds || []))
        const position = openPosition(
          [...playlistsRef.current, ...created.filter((playlist) => !nestedIds.has(playlist.id))],
          visual.size,
          origin
        )
        const playlist = await window.api.upsertPlaylist({ ...draft, position, size: visual.size })
        created.push(playlist, ...children)
      }
      if (created.length) {
        const next = showPlaylists([...playlistsRef.current, ...created], cardHeight)
        setPlaylists(next)
        const parent = next.find((playlist) =>
          created.some((item) => item.id === playlist.id && !playlist.parentId)
        )
        if (parent) {
          setSelectedId(parent.id)
          setFocusPlaylistId(parent.id)
        }
      }
      return lists.length
    },
    [cardHeightNow, openPosition, playlistOrigin]
  )

  const appendPlaylistCourses = useCallback(
    async (id, item) => {
      const current = playlistsRef.current.find((playlist) => playlist.id === id)
      if (!current) throw new Error('Esa lista ya no está en el tablero')
      const coursePaths = [...(current.coursePaths || [])]
      for (const coursePath of item?.coursePaths || []) {
        if (coursePath && !coursePaths.includes(coursePath)) coursePaths.push(coursePath)
      }
      const added = coursePaths.length - (current.coursePaths || []).length
      const cardHeight = cardHeightNow()
      const draft = withFittedHeight(
        {
          ...current,
          why: current.why || item?.why || '',
          coursePaths,
          courseWhys: { ...(current.courseWhys || {}), ...(item?.courseWhys || {}) }
        },
        cardHeight
      )
      const saved = await window.api.upsertPlaylist(draft)
      const merged = showPlaylists(
        playlistsRef.current.map((playlist) =>
          playlist.id === saved.id ? { ...playlist, ...saved } : playlist
        ),
        cardHeight
      )
      playlistsRef.current = merged
      setPlaylists(merged)
      return added
    },
    [cardHeightNow]
  )

  const extendSelectedPlaylist = useCallback(
    async (item) => {
      const id = selectedIdRef.current
      if (!id || !playlistsRef.current.some((playlist) => playlist.id === id)) {
        throw new Error('Selecciona una lista')
      }
      return appendPlaylistCourses(id, item)
    },
    [appendPlaylistCourses]
  )

  const placeLooseCourses = useCallback(
    async ({ adds, lists }) => {
      let added = 0
      for (const add of adds || []) {
        added += await appendPlaylistCourses(add.id, add)
      }
      const created = lists?.length ? await createBuiltLists(lists) : 0
      return { added, created }
    },
    [appendPlaylistCourses, createBuiltLists]
  )

  const createPlaylist = useCallback(async () => {
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    try {
      const cardHeight = cardHeightNow()
      const visual = withFittedHeight(
        {
          position: { x: 0, y: 0 },
          size: { width: PLAYLIST_DEFAULT_W, height: contentHeight(0) },
          coursePaths: []
        },
        cardHeight
      )
      const position = openPosition(playlistsRef.current, visual.size, playlistOrigin())
      const created = await window.api.upsertPlaylist({
        title: 'Nueva lista',
        position,
        size: { width: PLAYLIST_DEFAULT_W, height: contentHeight(0) },
        coursePaths: []
      })
      const next = withFittedHeight(created)
      setPlaylists((prev) => [...prev, next])
      setSelectedId(next.id)
      setFocusPlaylistId(next.id)
    } catch (err) {
      toast.error(err.message || 'No se pudo crear la lista')
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }, [cardHeightNow, openPosition, playlistOrigin])

  useEffect(() => {
    if (!orderMenuOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOrderMenuOpen(false)
    }
    const onPointerDown = (event) => {
      if (orderMenuRef.current && !orderMenuRef.current.contains(event.target)) {
        setOrderMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [orderMenuOpen])

  const orderBoard = useCallback(
    async (mode = 'reading') => {
      const current = playlistsRef.current
      if (!current.length || ordering) return
      setOrderMenuOpen(false)
      const rect = canvasRef.current?.getBoundingClientRect()
      const zoom = getViewport().zoom || 1
      const cardHeight = cardHeightNow()
      let originX = 48
      let originY = 48
      let maxRowWidth = 1280
      if (rect && rect.width > 0) {
        const origin = screenToFlowPosition({ x: rect.left + 36, y: rect.top + 36 })
        originX = origin.x
        originY = origin.y
        maxRowWidth = Math.max(PLAYLIST_DEFAULT_W, rect.width / zoom - 72)
      }
      const byId = new Map(current.map((playlist) => [playlist.id, playlist]))
      const courseByPath = courseCatalog(coursesRef.current)
      const next =
        mode === 'clean'
          ? separateOverlaps(current, { cardHeight })
          : orderPlaylists(current, {
              cardHeight,
              originX,
              originY,
              maxRowWidth,
              mode,
              topicOf: (playlist) => dominantTheme(playlist, byId, courseByPath)
            })
      const moved = next.filter((playlist) => {
        const before = current.find((item) => item.id === playlist.id)
        if (!before) return false
        return (
          Math.abs(playlist.position.x - before.position.x) > 0.5 ||
          Math.abs(playlist.position.y - before.position.y) > 0.5
        )
      })
      if (!moved.length) {
        fitView({ padding: 0.16, duration: 250 })
        return
      }
      setOrdering(true)
      setPlaylists(next)
      try {
        await Promise.all(moved.map((playlist) => window.api.upsertPlaylist(playlist)))
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ padding: 0.16, duration: 280 })
          })
        })
      } catch (err) {
        toast.error(err.message || 'No se pudieron ordenar las listas')
        const fresh = await window.api.listPlaylists().catch(() => null)
        if (fresh) setPlaylists(showPlaylists(fresh))
      } finally {
        setOrdering(false)
      }
    },
    [cardHeightNow, fitView, getViewport, ordering, screenToFlowPosition]
  )

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      const live = changes.filter(
        (change) => change.type === 'dimensions' && change.resizing && change.dimensions
      )
      if (live.length) {
        setNodes((current) => {
          if (!bigCoverRef.current) {
            return current.map((node) => {
              if (node.type !== 'course') return node
              const change = live.find((item) => item.id === node.parentId)
              if (!change) return node
              const inset = node.data?.nested ? NEST_COURSE_X : PLAYLIST_PAD_X
              const cardWidth = Math.max(120, change.dimensions.width - inset * 2)
              return {
                ...node,
                width: cardWidth,
                style: { ...node.style, width: cardWidth }
              }
            })
          }
          return live.reduce((next, change) => {
            const source = displayRef.current
            const playlist = source.find((item) => item.id === change.id)
            if (!playlist) return next
            return applyCoverWidth(next, playlist, change.dimensions.width, source)
          }, current)
        })
      }
      const finished = changes.filter(
        (change) => change.type === 'dimensions' && change.resizing === false && change.dimensions
      )
      if (!finished.length) return
      queueMicrotask(() => {
        for (const change of finished) {
          const current = playlistsRef.current.find((playlist) => playlist.id === change.id)
          if (!current) continue
          const { width, height } = change.dimensions
          if (
            Math.abs(width - current.size.width) < 1 &&
            Math.abs(height - current.size.height) < 1
          ) {
            continue
          }
          persistPlaylist({
            ...current,
            size: {
              width,
              height: heightToStore(height, current.coursePaths.length, bigCoverRef.current)
            }
          })
        }
      })
    },
    [onNodesChange, persistPlaylist, setNodes]
  )

  const onNodeDragStop = useCallback(
    (_event, node) => {
      const list = playlistsRef.current
      if (node.type === 'playlist') {
        const current = list.find((playlist) => playlist.id === node.id)
        if (!current) return
        const cardHeight = bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
        const point = {
          x: node.position.x + current.size.width / 2,
          y: node.position.y + 28
        }
        const hit = playlistAtPoint(list, point, { ignoreId: node.id, cardHeight })
        const canNest =
          hit &&
          hit.id !== current.id &&
          !current.parentId &&
          !(current.childIds || []).length &&
          !hit.parentId &&
          !(hit.childIds || []).includes(current.id)
        if (canNest && (hit.childIds || []).length >= MAX_NESTED) {
          toast(`Esa lista ya tiene ${MAX_NESTED} listas dentro`)
          syncFlow(list)
          return
        }
        if (canNest) {
          const parent = {
            ...hit,
            collapsed: false,
            childIds: [...(hit.childIds || []), current.id].slice(0, MAX_NESTED)
          }
          const next = showPlaylists(
            list.map((playlist) => (playlist.id === parent.id ? parent : playlist)),
            cardHeight
          )
          setPlaylists(next)
          const saved = next.find((playlist) => playlist.id === parent.id)
          window.api.upsertPlaylist(saved || parent).catch(async (err) => {
            toast.error(err.message || 'No se pudo anidar la lista')
            const fresh = await window.api.listPlaylists().catch(() => null)
            if (fresh) setPlaylists(showPlaylists(fresh, cardHeight))
          })
          setSelectedId(parent.id)
          return
        }
        const position = { x: node.position.x, y: node.position.y }
        if (libraryFiltersActive(boardFiltersRef.current)) {
          const width = readNodeSize(node, current.size).width
          const samePos =
            Math.abs(position.x - current.position.x) < 0.5 &&
            Math.abs(position.y - current.position.y) < 0.5
          const sameWidth = Math.abs(width - current.size.width) < 1
          if (!samePos || !sameWidth) {
            persistPlaylist({ ...current, position, size: { ...current.size, width } })
          }
          return
        }
        const measured = readNodeSize(node, current.size)
        const size = {
          width: measured.width,
          height: heightToStore(measured.height, current.coursePaths.length, bigCoverRef.current)
        }
        const samePos =
          Math.abs(position.x - current.position.x) < 0.5 &&
          Math.abs(position.y - current.position.y) < 0.5
        const sameSize =
          Math.abs(size.width - current.size.width) < 1 &&
          Math.abs(size.height - current.size.height) < 1
        if (samePos && sameSize) return
        persistPlaylist({ ...current, position, size })
        return
      }
      if (node.type !== 'course') return
      if (libraryFiltersActive(boardFiltersRef.current)) {
        syncFlow(list)
        return
      }
      const current = list.find((playlist) => playlist.id === node.data.playlistId)
      if (!current) return
      const sectionTop = node.data.sectionTop ?? PLAYLIST_HEADER
      const cardHeight = bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
      const columns = node.data.columns || 1
      const nextPaths =
        columns > 1
          ? reorderCoursePaths(
              current.coursePaths,
              node.data.coursePath,
              node.position.y,
              cardHeight,
              {
                columns,
                x: node.position.x,
                inset: node.data.inset,
                innerWidth: node.data.innerWidth,
                originY: sectionTop
              }
            )
          : reorderCoursePaths(
              current.coursePaths,
              node.data.coursePath,
              node.position.y - sectionTop + PLAYLIST_HEADER,
              cardHeight
            )
      const same = nextPaths.every((coursePath, index) => coursePath === current.coursePaths[index])
      if (same) {
        syncFlow(list)
        return
      }
      persistPlaylist({ ...current, coursePaths: nextPaths })
    },
    [persistPlaylist, syncFlow]
  )

  const onBeforeDelete = useCallback(({ nodes: doomed }) => {
    const groups = doomed.filter((node) => node.type === 'playlist')
    const groupIds = new Set(groups.map((node) => node.id))
    const courses = doomed.filter(
      (node) =>
        node.type === 'course' &&
        !groupIds.has(node.parentId) &&
        !groupIds.has(node.data?.playlistId)
    )
    if (groups.length === 0 && courses.length === 0) return true
    if (groups.length === 0) {
      const label =
        courses.length === 1
          ? `«${courses[0].data?.title || 'este curso'}» de la lista`
          : `${courses.length} cursos de la lista`
      const stays = courses.length === 1 ? 'El curso sigue' : 'Los cursos siguen'
      return window.confirm(`¿Quitar ${label}? ${stays} en la biblioteca.`)
    }
    const label =
      groups.length === 1 ? `«${groups[0].data?.title || 'esta lista'}»` : `${groups.length} listas`
    if (courses.length === 0) {
      return window.confirm(`¿Quitar ${label} del tablero? Los cursos siguen en la biblioteca.`)
    }
    const extra =
      courses.length === 1
        ? ` y «${courses[0].data?.title || 'un curso'}»`
        : ` y ${courses.length} cursos`
    return window.confirm(
      `¿Quitar ${label}${extra} del tablero? Los cursos siguen en la biblioteca.`
    )
  }, [])

  const onNodesDelete = useCallback((deleted) => {
    const removedGroups = new Set(
      deleted.filter((node) => node.type === 'playlist').map((node) => node.id)
    )
    const removals = new Map()
    for (const node of deleted) {
      if (node.type !== 'course' || removedGroups.has(node.data?.playlistId)) continue
      const paths = removals.get(node.data.playlistId) || []
      paths.push(node.data.coursePath)
      removals.set(node.data.playlistId, paths)
    }
    const prev = playlistsRef.current
    const next = showPlaylists(
      prev
        .filter((playlist) => !removedGroups.has(playlist.id))
        .map((playlist) => {
          const drop = removals.get(playlist.id)
          const childIds = (playlist.childIds || []).filter((id) => !removedGroups.has(id))
          if (!drop?.length && childIds.length === (playlist.childIds || []).length) {
            return { ...playlist, childIds }
          }
          const dropSet = new Set(drop || [])
          return {
            ...playlist,
            childIds,
            coursePaths: playlist.coursePaths.filter((coursePath) => !dropSet.has(coursePath))
          }
        })
    )
    setPlaylists(next)
    const tasks = [...removedGroups].map((id) => window.api.deletePlaylist(id))
    for (const playlist of next) {
      const before = prev.find((item) => item.id === playlist.id)
      if (!before) continue
      const pathsChanged = before.coursePaths.length !== playlist.coursePaths.length
      const nestChanged = (before.childIds || []).join() !== (playlist.childIds || []).join()
      if (pathsChanged || nestChanged) tasks.push(window.api.upsertPlaylist(playlist))
    }
    Promise.all(tasks).catch(async (err) => {
      toast.error(err.message || 'No se pudo actualizar la lista')
      const fresh = await window.api.listPlaylists().catch(() => null)
      if (fresh) setPlaylists(showPlaylists(fresh))
    })
  }, [])

  const onDragOver = useCallback(
    (event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const hit = playlistAtPoint(playlistsRef.current, point)
      const next = hit?.id || null
      setDropId((current) => (current === next ? current : next))
    },
    [screenToFlowPosition]
  )

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()
      setDropId(null)
      const coursePath =
        event.dataTransfer.getData('application/x-course') ||
        event.dataTransfer.getData('text/plain')
      if (!coursePath) return
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const hit = playlistAtPoint(playlistsRef.current, point)
      if (!hit) {
        toast.error('Suelta el curso sobre una lista')
        return
      }
      addCourse(hit.id, coursePath)
    },
    [addCourse, screenToFlowPosition]
  )

  const toggleCoursePick = useCallback((coursePath, { range = false } = {}) => {
    setPickedCourses((current) => {
      const result = applyCoursePick(current, visiblePathsRef.current, coursePath, {
        range,
        anchor: pickAnchorRef.current
      })
      pickAnchorRef.current = result.anchor
      return result.selected
    })
  }, [])

  const toggleListPick = useCallback((playlistId) => {
    setPickedLists((current) => {
      const next = new Set(current)
      if (next.has(playlistId)) next.delete(playlistId)
      else next.add(playlistId)
      return next
    })
  }, [])

  const toggleVisibleCoursePicks = useCallback(() => {
    const paths = visiblePathsRef.current
    setPickedCourses((current) => {
      const next = new Set(current)
      const all = paths.length > 0 && paths.every((coursePath) => next.has(coursePath))
      if (all) {
        for (const coursePath of paths) next.delete(coursePath)
      } else {
        for (const coursePath of paths) next.add(coursePath)
      }
      return next
    })
    pickAnchorRef.current = paths.at(-1) || null
  }, [])

  const clearExportPicks = useCallback(() => {
    setPickedCourses(new Set())
    setPickedLists(new Set())
    pickAnchorRef.current = null
  }, [])

  const onNodeClick = useCallback(
    (event, node) => {
      if (node.type !== 'course') return
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleCoursePick(node.data.coursePath, { range: event.shiftKey })
        return
      }
      previewCourse(node.data.coursePath)
    },
    [previewCourse, toggleCoursePick]
  )

  const onNodeDoubleClick = useCallback(
    (_event, node) => {
      if (node.type === 'course') openCourse(node.data.coursePath)
    },
    [openCourse]
  )

  const selectPlaylist = useCallback((id) => {
    setSelectedId(id)
  }, [])

  const unnestPlaylist = useCallback(
    (childId) => {
      const list = playlistsRef.current
      const child = list.find((playlist) => playlist.id === childId)
      const parent = list.find((playlist) => (playlist.childIds || []).includes(childId))
      if (!child || !parent) return
      const cardHeight = cardHeightNow()
      const parentNext = {
        ...parent,
        childIds: parent.childIds.filter((id) => id !== childId)
      }
      const released = {
        ...child,
        parentId: '',
        childIds: []
      }
      const merged = list.map((playlist) => {
        if (playlist.id === parent.id) return parentNext
        if (playlist.id === child.id) return released
        return playlist
      })
      const position = openPosition(merged, child.size, {
        x: parent.position.x + parent.size.width + PLAYLIST_GAP,
        y: parent.position.y
      })
      const next = showPlaylists(
        merged.map((playlist) => (playlist.id === child.id ? { ...released, position } : playlist)),
        cardHeight
      )
      setPlaylists(next)
      const savedParent = next.find((playlist) => playlist.id === parent.id)
      const savedChild = next.find((playlist) => playlist.id === child.id)
      Promise.all([
        window.api.upsertPlaylist(savedParent),
        window.api.upsertPlaylist(savedChild)
      ]).catch(async (err) => {
        toast.error(err.message || 'No se pudo sacar la lista')
        const fresh = await window.api.listPlaylists().catch(() => null)
        if (fresh) setPlaylists(showPlaylists(fresh, cardHeight))
      })
      setSelectedId(child.id)
      setFocusPlaylistId(child.id)
    },
    [cardHeightNow, openPosition]
  )

  const actions = useMemo(
    () => ({
      dropId,
      selectedId,
      detailPath,
      focusPlaylistId,
      renamePlaylist,
      toggleCollapsed,
      deletePlaylist,
      removeCourse,
      openCourse,
      selectPlaylist,
      unnestPlaylist,
      isCoursePicked: (coursePath) => {
        if (pickedCourses.has(coursePath)) return true
        const course = courseCatalog(coursesRef.current).get(coursePath)
        return Boolean(course && pickedCourses.has(course.path))
      },
      isListPicked: (playlistId) => pickedLists.has(playlistId),
      toggleCoursePick,
      toggleListPick
    }),
    [
      dropId,
      selectedId,
      detailPath,
      focusPlaylistId,
      renamePlaylist,
      toggleCollapsed,
      deletePlaylist,
      removeCourse,
      openCourse,
      selectPlaylist,
      unnestPlaylist,
      pickedCourses,
      pickedLists,
      toggleCoursePick,
      toggleListPick
    ]
  )

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedId) || null
  const institutions = useMemo(() => {
    const names = new Set()
    courses.forEach((course) => {
      if (course.institution) names.add(course.institution)
    })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [courses])
  const programs = useMemo(() => {
    const names = new Set()
    courses.forEach((course) => {
      ;(course.programs || []).forEach((program) => {
        if (program) names.add(program)
      })
    })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [courses])
  const themes = useMemo(() => {
    const names = new Set()
    courses.forEach((course) => {
      ;(course.theme || []).forEach((theme) => {
        if (theme) names.add(theme)
      })
    })
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [courses])
  const listedCourses = useMemo(() => {
    const paths = new Set()
    let stored = 0
    const catalog = courseCatalog(courses)
    for (const playlist of playlists) {
      for (const coursePath of playlist.coursePaths || []) {
        stored += 1
        const course = catalog.get(coursePath)
        if (course) paths.add(course.path)
      }
    }
    if (stored === 0) return courses
    return courses.filter((course) => paths.has(course.path))
  }, [courses, playlists])
  const boardFacets = useMemo(() => collectCourseFacets(listedCourses), [listedCourses])
  const boardStats = useMemo(() => {
    const byPath = courseCatalog(courses)
    const active = libraryFiltersActive(boardFilters)
    const all = new Set()
    let visible = 0
    for (const playlist of playlists) {
      for (const coursePath of playlist.coursePaths || []) {
        const course = byPath.get(coursePath)
        const key = course?.path || coursePath
        if (all.has(key)) continue
        all.add(key)
        if (!active || (course && courseMatchesLibraryFilters(course, boardFilters))) visible += 1
      }
    }
    return { total: all.size, visible: active ? visible : all.size, active }
  }, [courses, playlists, boardFilters])
  const detailCourse = useMemo(
    () => (detailPath ? courses.find((course) => course.path === detailPath) || null : null),
    [courses, detailPath]
  )
  const visibleCourses = useMemo(() => {
    const query = search.trim().toLowerCase()
    const catalog = courseCatalog(courses)
    const listed = new Set()
    for (const coursePath of selectedPlaylist?.coursePaths || []) {
      listed.add(catalog.get(coursePath)?.path || coursePath)
    }
    return [...courses]
      .filter((course) => {
        if (institutionFilter && course.institution !== institutionFilter) return false
        if (programFilter && !(course.programs || []).includes(programFilter)) return false
        if (inProcessOnly && !course.isInProcess) return false
        if (unlistedOnly && listed.has(course.path)) return false
        if (!query) return true
        const hay = [
          course.title,
          course.institution,
          course.instructor,
          course.path,
          course.notesSearchText,
          ...(course.programs || []),
          ...(course.theme || [])
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(query)
      })
      .sort((a, b) =>
        (a.title || a.path).localeCompare(b.title || b.path, undefined, { sensitivity: 'base' })
      )
  }, [
    courses,
    search,
    institutionFilter,
    programFilter,
    inProcessOnly,
    unlistedOnly,
    selectedPlaylist
  ])

  visiblePathsRef.current = visibleCourses.map((course) => course.path)
  const allSidebarPicked =
    visibleCourses.length > 0 && visibleCourses.every((course) => pickedCourses.has(course.path))

  const liveListIds = useMemo(() => {
    const ids = new Set(playlists.map((playlist) => playlist.id))
    return [...pickedLists].filter((id) => ids.has(id))
  }, [playlists, pickedLists])

  const exportPaths = useMemo(
    () =>
      collectExportCoursePaths(playlists, {
        coursePaths: [...pickedCourses],
        playlistIds: liveListIds
      }),
    [playlists, pickedCourses, liveListIds]
  )

  const handleExportZip = useCallback(async () => {
    const result = await zipExport.run(exportPaths, { listCount: liveListIds.length })
    if (result?.ok) clearExportPicks()
  }, [clearExportPicks, exportPaths, liveListIds.length, zipExport])

  const membership = useMemo(() => {
    const map = new Map()
    const catalog = courseCatalog(courses)
    for (const playlist of playlists) {
      for (const coursePath of playlist.coursePaths) {
        const key = catalog.get(coursePath)?.path || coursePath
        map.set(key, (map.get(key) || 0) + 1)
      }
    }
    return map
  }, [playlists, courses])

  const inSelected = useMemo(() => {
    const catalog = courseCatalog(courses)
    const selected = new Set()
    for (const coursePath of selectedPlaylist?.coursePaths || []) {
      selected.add(catalog.get(coursePath)?.path || coursePath)
    }
    return selected
  }, [courses, selectedPlaylist])

  return (
    <BoardActions.Provider value={actions}>
      <div
        className={board}
        style={{
          '--playlist-gap': `${PLAYLIST_GAP}px`,
          '--sidebar-w': `${sidebarWidth}px`
        }}
      >
        <header className="relative z-[6] flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink/10 bg-surface-muted px-5 py-4 backdrop-blur-[10px] [&_h1]:m-0 [&_h1]:font-display [&_h1]:text-[1.35rem] [&_h1]:font-black [&_h1]:tracking-[-0.02em]">
          <div className="flex min-w-0 flex-col gap-[0.2rem]">
            <h1>Listas</h1>
            <AppNav active="playlists" onSelect={onNavigate} />
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <div className="relative shrink-0" ref={orderMenuRef}>
              <button
                type="button"
                className={btnGhost}
                aria-haspopup="menu"
                aria-expanded={orderMenuOpen}
                onClick={() => setOrderMenuOpen((open) => !open)}
                disabled={ordering || loading || playlists.length === 0}
              >
                Ordenar
              </button>
              {orderMenuOpen ? (
                <div className={popover} role="menu" aria-label="Ordenar listas">
                  <button
                    type="button"
                    className={cn(menuItem, '[&_small]:text-[0.75rem] [&_small]:font-medium [&_small]:text-ink-soft')}
                    role="menuitem"
                    onClick={() => orderBoard('reading')}
                  >
                    <span>En filas</span>
                    <small>Orden de lectura, sin solapes</small>
                  </button>
                  <button
                    type="button"
                    className={cn(menuItem, '[&_small]:text-[0.75rem] [&_small]:font-medium [&_small]:text-ink-soft')}
                    role="menuitem"
                    onClick={() => orderBoard('alpha')}
                  >
                    <span>Alfabético</span>
                    <small>Por título, de la A a la Z</small>
                  </button>
                  <button
                    type="button"
                    className={cn(menuItem, '[&_small]:text-[0.75rem] [&_small]:font-medium [&_small]:text-ink-soft')}
                    role="menuitem"
                    onClick={() => orderBoard('topic')}
                  >
                    <span>Por tema</span>
                    <small>Agrupa el tema más común de cada lista</small>
                  </button>
                  <hr className="mx-1.5 my-1 h-px border-0 bg-ink/10" />
                  <button
                    type="button"
                    className={cn(menuItem, '[&_small]:text-[0.75rem] [&_small]:font-medium [&_small]:text-ink-soft')}
                    role="menuitem"
                    onClick={() => orderBoard('clean')}
                  >
                    <span>Mantener orden</span>
                    <small>Separa solo las que se pisan</small>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setBuilderOpen(true)}
              disabled={!intentReady}
            >
              Creador de listas
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={createPlaylist}
              disabled={creating}
            >
              Nueva lista
            </button>
          </div>
        </header>
        <div className="playlist-board__body flex min-h-0 flex-1 max-[800px]:flex-col">
          <aside className="relative flex w-[var(--sidebar-w,320px)] shrink-0 flex-col gap-3 min-h-0 border-r border-ink/10 bg-white/45 px-[0.85rem] pt-[0.9rem] pb-4 max-[800px]:max-h-56 max-[800px]:w-full max-[800px]:border-r-0 max-[800px]:border-b">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 font-display text-[0.72rem] font-extrabold tracking-[0.08em] text-ink-soft uppercase">
                  Cursos
                </h2>
                <div
                  className="inline-flex gap-[0.2rem] rounded-full border border-ink/10 bg-surface p-1 [&_button]:cursor-pointer [&_button]:rounded-full [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-[0.55rem] [&_button]:py-[0.22rem] [&_button]:text-[0.72rem] [&_button]:font-bold [&_button]:text-ink-soft [&_button[aria-pressed=true]]:bg-coral [&_button[aria-pressed=true]]:text-white"
                  role="group"
                  aria-label="Vista de cursos"
                >
                  <button type="button" aria-pressed={!bigCover} onClick={() => setBigCover(false)}>
                    Lista
                  </button>
                  <button type="button" aria-pressed={bigCover} onClick={() => setBigCover(true)}>
                    Portadas
                  </button>
                </div>
              </div>
              <p className="mt-[0.2rem] text-[0.8rem] text-ink-soft">
                {selectedPlaylist
                  ? `${visibleCourses.length} · añadir a «${selectedPlaylist.title}»`
                  : `${visibleCourses.length} cursos`}
              </p>
              <button
                type="button"
                className={cn(btnGhost, 'mt-[0.45rem] px-3 py-[0.35rem] text-[0.82rem] shadow-none')}
                onClick={toggleVisibleCoursePicks}
                disabled={!visibleCourses.length || zipExport.exporting}
              >
                {allSidebarPicked ? 'Quitar selección' : 'Seleccionar visibles'}
              </button>
              {selectedPlaylist?.why ? (
                <p className="m-0 line-clamp-3 text-[0.78rem] leading-[1.35] text-ink-soft">
                  {selectedPlaylist.why}
                </p>
              ) : null}
            </div>
            <div className={searchBox}>
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
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cursos…"
                aria-label="Buscar cursos"
                title="Buscar (Ctrl+F)"
              />
            </div>
            <div className="flex shrink-0 flex-col gap-[0.4rem]">
              <div className={cn(chipSelect, '[&_label]:text-[0.75rem] [&_label]:font-bold [&_label]:tracking-[0.04em] [&_label]:text-ink-soft [&_label]:uppercase')}>
                <label htmlFor="playlist-institution">Academia</label>
                <select
                  id="playlist-institution"
                  value={institutionFilter}
                  onChange={(event) => setInstitutionFilter(event.target.value)}
                >
                  <option value="">Todas</option>
                  {institutions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={cn(chipSelect, '[&_label]:text-[0.75rem] [&_label]:font-bold [&_label]:tracking-[0.04em] [&_label]:text-ink-soft [&_label]:uppercase')}>
                <label htmlFor="playlist-program">Programa</label>
                <select
                  id="playlist-program"
                  value={programFilter}
                  onChange={(event) => setProgramFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  {programs.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-[0.35rem]">
                <button
                  type="button"
                  className={filterPill}
                  aria-pressed={inProcessOnly}
                  onClick={() => setInProcessOnly((value) => !value)}
                >
                  En curso
                </button>
                <button
                  type="button"
                  className={filterPill}
                  aria-pressed={unlistedOnly}
                  onClick={() => setUnlistedOnly((value) => !value)}
                >
                  Sin añadir
                </button>
              </div>
            </div>
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-[0.45rem] overflow-auto pr-[0.15rem]',
                bigCover &&
                  'grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] content-start items-start [&_.row]:relative [&_.row]:h-max [&_.row]:min-h-min [&_.row]:flex-col [&_.row]:items-stretch [&_.row]:gap-0 [&_.row]:self-start [&_.row]:overflow-hidden [&_.row]:p-0 [&_.row>.pick]:absolute [&_.row>.pick]:top-[0.35rem] [&_.row>.pick]:left-[0.35rem] [&_.row>.pick]:z-[4] [&_.row-cover]:relative [&_.row-cover]:aspect-[16/10] [&_.row-cover]:h-auto [&_.row-cover]:w-full [&_.row-cover]:flex-none [&_.row-cover]:rounded-none [&_.row-cover_img]:absolute [&_.row-cover_img]:inset-0 [&_.row-cover_img]:size-full [&_.row-cover_img]:object-cover [&_.row-cover_img.is-mark]:inset-auto [&_.row-cover_img.is-mark]:top-1/2 [&_.row-cover_img.is-mark]:left-1/2 [&_.row-cover_img.is-mark]:size-12 [&_.row-cover_img.is-mark]:-translate-x-1/2 [&_.row-cover_img.is-mark]:-translate-y-1/2 [&_.row-cover_img.is-mark]:object-contain [&_.row-text]:flex-none [&_.row-text]:px-[0.65rem] [&_.row-text]:pt-[0.45rem] [&_.row-text]:pb-[0.55rem] [&_.row-title]:line-clamp-2 [&_.row-title]:whitespace-normal [&_.row-add]:absolute [&_.row-add]:top-[0.45rem] [&_.row-add]:right-[0.45rem] [&_.row-add]:bg-surface [&_.mark]:top-[0.45rem] [&_.mark]:left-[0.45rem] [&_.mark]:inline-flex'
              )}
              role="list"
            >
              {visibleCourses.length === 0 ? (
                <p className="mx-[0.15rem] my-2 text-[0.85rem] text-ink-soft">Ningún curso coincide.</p>
              ) : (
                visibleCourses.map((course) => {
                  const member = inSelected.has(course.path)
                  const count = membership.get(course.path) || 0
                  return (
                    <div
                      key={course.path}
                      className={cn(
                        'row flex shrink-0 cursor-grab items-center gap-[0.45rem] rounded-md border border-ink/10 bg-surface px-2 py-[0.45rem] shadow-card',
                        member && 'shadow-[inset_3px_0_0_var(--color-teal),var(--shadow-card)]',
                        detailPath === course.path &&
                          'shadow-[inset_3px_0_0_var(--color-coral),var(--shadow-card)]',
                        pickedCourses.has(course.path) && 'outline outline-2 outline-offset-1 outline-coral'
                      )}
                      role="listitem"
                      draggable
                      onClick={(event) => {
                        if (event.target.closest('button, label, input')) return
                        if (event.shiftKey || event.metaKey || event.ctrlKey) {
                          toggleCoursePick(course.path, { range: event.shiftKey })
                          return
                        }
                        previewCourse(course.path)
                      }}
                      onDragStart={(event) => {
                        if (event.target.closest('button')) {
                          event.preventDefault()
                          return
                        }
                        event.dataTransfer.setData('application/x-course', course.path)
                        event.dataTransfer.setData('text/plain', course.path)
                        event.dataTransfer.effectAllowed = 'copy'
                      }}
                    >
                      <CoursePickBox
                        className={cn(pickBox, 'pick')}
                        checked={pickedCourses.has(course.path)}
                        label={`Seleccionar ${course.title || course.path}`}
                        onPick={(pick) => toggleCoursePick(course.path, pick)}
                      />
                      <CourseCover
                        coursePath={course.path}
                        hasCover={course.hasCover}
                        coverStamp={course.coverStamp}
                        className={cn(rowCover, 'row-cover')}
                      />
                      {course.isInProcess ? (
                        <span className={cn(statusMark, 'mark')}>En curso</span>
                      ) : null}
                      <div className="row-text flex min-w-0 flex-1 flex-col gap-[0.1rem]">
                        <span className="row-title truncate font-display text-[0.86rem] font-extrabold">
                          {course.title || course.path}
                        </span>
                        <span className="truncate text-[0.72rem] text-ink-soft [&_.institution-logo]:block">
                          {member ? (
                            'En esta lista'
                          ) : count > 0 ? (
                            `En ${count} ${count === 1 ? 'lista' : 'listas'}`
                          ) : (
                            <InstitutionMark
                              institution={course.institution}
                              nameClassName="institution-name"
                              emptyLabel="Arrastrar"
                            />
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="row-add shrink-0 cursor-pointer rounded-sm border border-ink/10 bg-cream px-2 py-[0.28rem] text-[0.72rem] font-bold text-ink disabled:cursor-default disabled:opacity-45"
                        disabled={member}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => addCourse(null, course.path)}
                      >
                        Añadir
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <div
              className="absolute top-0 -right-1 z-[3] h-full w-2 cursor-col-resize touch-none hover:bg-[rgba(232,69,112,0.45)] focus-visible:bg-[rgba(232,69,112,0.45)] focus-visible:outline-none max-[800px]:hidden"
              role="separator"
              aria-orientation="vertical"
              aria-label="Ancho de la lista de cursos"
              aria-valuemin={SIDEBAR_MIN}
              aria-valuemax={SIDEBAR_MAX}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onPointerDown={onSidebarResizeStart}
              onKeyDown={onSidebarResizeKey}
            />
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CourseFilterBar
              idPrefix="board"
              className={boardFilters}
              showSearch
              query={boardQuery}
              onQueryChange={setBoardQuery}
              isInProcessOnly={boardInProcess}
              onInProcessOnlyChange={setBoardInProcess}
              isNewOnly={boardNewOnly}
              onNewOnlyChange={setBoardNewOnly}
              recentlyViewedOnly={boardRecentOnly}
              onRecentlyViewedOnlyChange={setBoardRecentOnly}
              missingPropsOnly={boardMissingOnly}
              onMissingPropsOnlyChange={setBoardMissingOnly}
              institutions={boardFacets.institutions}
              programs={boardFacets.programs}
              themes={boardFacets.themes}
              institutionFilter={boardInstitution}
              onInstitutionFilterChange={setBoardInstitution}
              programFilter={boardProgram}
              onProgramFilterChange={setBoardProgram}
              themeFilter={boardTheme}
              onThemeFilterChange={setBoardTheme}
              minRate={boardMinRate}
              onMinRateChange={setBoardMinRate}
              courseCount={boardStats.visible}
              courseTotal={boardStats.total}
            />
            <div
              className="min-h-0 min-w-0 flex-1"
              ref={canvasRef}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) return
                setDropId(null)
              }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                onBeforeDelete={onBeforeDelete}
                onNodesDelete={onNodesDelete}
                onNodeDoubleClick={onNodeDoubleClick}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                style={{ width: '100%', height: '100%' }}
                colorMode="light"
                fitView={false}
                defaultViewport={initialViewport || { x: 0, y: 0, zoom: 1 }}
                onMoveEnd={onMoveEnd}
                minZoom={BOARD_MIN_ZOOM}
                maxZoom={BOARD_MAX_ZOOM}
                panOnScroll
                zoomOnDoubleClick={false}
                nodesConnectable={false}
                edgesReconnectable={false}
                elevateNodesOnSelect={false}
                deleteKeyCode={['Backspace', 'Delete']}
                proOptions={{ hideAttribution: false }}
                defaultEdgeOptions={{ type: 'straight', interactionWidth: 0 }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={22}
                  size={1.4}
                  color="rgba(42, 36, 56, 0.18)"
                />
                <Controls position="bottom-left" showInteractive={false} />
                <MiniMap
                  position="top-right"
                  pannable
                  zoomable
                  maskColor="rgba(250, 248, 246, 0.72)"
                  nodeColor={(node) => (node.type === 'playlist' ? '#e84570' : '#ffffff')}
                  nodeStrokeWidth={2}
                />
                {!loading && playlists.length === 0 ? (
                  <Panel position="top-center" className="mt-3 rounded-md border border-ink/10 bg-surface px-[0.95rem] py-[0.7rem] text-[0.88rem] text-ink-soft shadow-card">
                    Crea una lista, o usa Armar para agrupar cursos parecidos.
                  </Panel>
                ) : null}
                {loading ? (
                  <Panel position="top-center" className="mt-3 rounded-md border border-ink/10 bg-surface px-[0.95rem] py-[0.7rem] text-[0.88rem] text-ink-soft shadow-card">
                    Cargando listas…
                  </Panel>
                ) : null}
              </ReactFlow>
            </div>
          </div>
          {detailCourse ? (
            <CourseDetailPanel
              course={detailCourse}
              onClose={() => setDetailPath(null)}
              onOpenCourse={(course, target) => onOpenCourse?.(course, target)}
              onEdit={setEditingCourse}
              onToggleInProcess={toggleInProcess}
              onGenerateProps={detailCourse.missingProps ? () => generateProps(detailCourse) : null}
              onSearchCover={() =>
                setCoverSearch({ courses: [detailCourse], initialStep: 'choose' })
              }
            />
          ) : null}
        </div>
        {editingCourse ? (
          <CourseEditModal
            course={editingCourse}
            programOptions={programs}
            themeOptions={themes}
            onCourseUpdated={() => setEditingCourse(null)}
            onClose={() => setEditingCourse(null)}
          />
        ) : null}
        {builderOpen ? (
          <PlaylistBuilder
            courses={courses}
            playlists={playlists}
            seedCourse={detailCourse}
            selectedPlaylist={selectedPlaylist}
            intent={intent}
            onIntent={saveIntent}
            onCreateLists={createBuiltLists}
            onExtend={extendSelectedPlaylist}
            onPlaceLoose={placeLooseCourses}
            onClose={() => setBuilderOpen(false)}
          />
        ) : null}
        {coverSearch ? (
          <CoverSearchModal
            courses={coverSearch.courses}
            initialStep={coverSearch.initialStep}
            onClose={() => setCoverSearch(null)}
          />
        ) : null}
        {zipExport.exporting ? null : (
          <CourseZipBar
            count={exportPaths.length}
            listCount={liveListIds.length}
            onClear={clearExportPicks}
            onExport={handleExportZip}
          />
        )}
      </div>
    </BoardActions.Provider>
  )
}

function PlaylistCanvas(props) {
  return (
    <ReactFlowProvider>
      <PlaylistWorkspace {...props} />
    </ReactFlowProvider>
  )
}

export default PlaylistCanvas
