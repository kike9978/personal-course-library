import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  NodeResizer,
  Panel,
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
import brandMark from '../assets/img/brand-mark.svg'
import {
  PLAYLIST_CARD_H,
  PLAYLIST_COVER_H,
  PLAYLIST_DEFAULT_W,
  PLAYLIST_GAP,
  PLAYLIST_PAD_X,
  buildFlow,
  contentHeight,
  playlistAtPoint,
  reorderCoursePaths,
  withFittedHeight
} from '../learning/playlistLayout'

const BoardActions = createContext(null)

function heightToStore(height, count, bigCover) {
  if (!bigCover) return height
  const extra = contentHeight(count, PLAYLIST_COVER_H) - contentHeight(count, PLAYLIST_CARD_H)
  return Math.max(contentHeight(count), height - extra)
}

function readNodeSize(node, fallback) {
  const width = node.measured?.width ?? node.width ?? node.style?.width ?? fallback.width
  const height = node.measured?.height ?? node.height ?? node.style?.height ?? fallback.height
  return {
    width: typeof width === 'number' ? width : fallback.width,
    height: typeof height === 'number' ? height : fallback.height
  }
}

function PlaylistNode({ id, data }) {
  const actions = useContext(BoardActions)
  const dropHere = actions?.dropId === id
  const current = actions?.selectedId === id

  return (
    <div
      className={`playlist-frame${dropHere ? ' is-drop-target' : ''}${current ? ' is-current' : ''}`}
      data-playlist-id={id}
    >
      <NodeResizer
        minWidth={280}
        minHeight={data.minHeight}
        color="#e84570"
        lineClassName="playlist-frame__resize-line"
        handleClassName="playlist-frame__resize-handle"
      />
      <header className="playlist-frame__drag">
        <input
          className="playlist-frame__title nodrag nopan nowheel"
          data-playlist-title={id}
          aria-label="Nombre de la lista"
          defaultValue={data.title}
          key={data.title}
          autoComplete="off"
          onBlur={(event) => {
            const title = event.target.value.trim() || 'Nueva lista'
            event.target.value = title
            if (title !== data.title) actions?.renamePlaylist(id, title)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            event.stopPropagation()
          }}
        />
        <span className="playlist-frame__count">{data.count}</span>
        <button
          type="button"
          className="playlist-frame__icon nodrag nopan"
          aria-label={`Quitar lista ${data.title}`}
          onClick={() => actions?.deletePlaylist(id)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </header>
      {data.count === 0 ? <p className="playlist-frame__empty">Arrastra un curso aquí</p> : null}
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
      className={`playlist-course${data.missing ? ' is-missing' : ''}${data.inProcess ? ' is-active' : ''}${data.continues ? ' has-next' : ''}${data.bigCover ? ' is-cover' : ''}`}
    >
      <CourseCover
        coursePath={data.missing ? '' : data.coursePath}
        hasCover={data.hasCover}
        coverStamp={data.coverStamp}
        className="playlist-course__cover"
        eager
      />
      <div className="playlist-course__text">
        <h3 title={data.title}>{data.title}</h3>
        <p title={meta}>{meta}</p>
      </div>
      <div className="playlist-course__actions nodrag nopan">
        <button
          type="button"
          className="playlist-frame__icon"
          aria-label={`Abrir ${data.title}`}
          onClick={() => actions?.openCourse(data.coursePath)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          type="button"
          className="playlist-frame__icon"
          aria-label={`Quitar ${data.title} de la lista`}
          onClick={() => actions?.removeCourse(data.playlistId, data.coursePath)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
    </article>
  )
}

const nodeTypes = { playlist: PlaylistNode, course: CourseNode }
const SIDEBAR_MIN = 280
const SIDEBAR_MAX = 1080
const SIDEBAR_WIDTH_KEY = 'playlist-sidebar-width'

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
        course.learning?.percent ?? ''
      ].join('\u001f')
    )
    .join('\n')
}

function PlaylistWorkspace({ courses, onNavigate, onOpenCourse }) {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [institutionFilter, setInstitutionFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [inProcessOnly, setInProcessOnly] = useState(false)
  const [unlistedOnly, setUnlistedOnly] = useState(false)
  const [bigCover, setBigCover] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [selectedId, setSelectedId] = useState(null)
  const [dropId, setDropId] = useState(null)
  const [focusPlaylistId, setFocusPlaylistId] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const playlistsRef = useRef(playlists)
  const coursesRef = useRef(courses)
  const selectedIdRef = useRef(selectedId)
  const canvasRef = useRef(null)
  const didFit = useRef(false)
  const creatingRef = useRef(false)
  const bigCoverRef = useRef(false)
  const sidebarWidthRef = useRef(sidebarWidth)
  playlistsRef.current = playlists
  bigCoverRef.current = bigCover
  sidebarWidthRef.current = sidebarWidth
  coursesRef.current = courses
  selectedIdRef.current = selectedId

  const { fitView, screenToFlowPosition } = useReactFlow()
  const nodesReady = useNodesInitialized()
  const courseSignature = useMemo(() => courseSignatureOf(courses), [courses])

  const courseMap = useCallback(
    () => new Map(coursesRef.current.map((course) => [course.path, course])),
    []
  )

  const syncFlow = useCallback(
    (list, covers = bigCoverRef.current) => {
      const built = buildFlow(list, courseMap(), {
        cardHeight: covers ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
      })
      setNodes(built.nodes)
      setEdges(built.edges)
    },
    [courseMap, setEdges, setNodes]
  )

  useEffect(() => {
    syncFlow(playlists, bigCover)
  }, [playlists, courseSignature, bigCover, syncFlow])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
    } catch {
      // Ignore storage failures; the width still applies for this session.
    }
  }, [sidebarWidth])

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
        if (!cancelled) setPlaylists((list || []).map(withFittedHeight))
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
    if (didFit.current || !nodesReady || playlists.length === 0) return
    fitView({ padding: 0.18, duration: 250 })
    didFit.current = true
  }, [nodesReady, playlists.length, fitView])

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
      input.focus()
      input.select()
      setFocusPlaylistId(null)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusPlaylistId, nodes])

  useOnSelectionChange({
    onChange: ({ nodes: selected }) => {
      const frame = selected.find((node) => node.type === 'playlist')
      const course = selected.find((node) => node.type === 'course')
      const next = frame?.id || course?.data?.playlistId || null
      setSelectedId((current) => (current === next ? current : next))
    }
  })

  const persistPlaylist = useCallback(async (playlist) => {
    const next = withFittedHeight(playlist)
    setPlaylists((prev) => prev.map((item) => (item.id === next.id ? next : item)))
    try {
      await window.api.upsertPlaylist(next)
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar la lista')
      const fresh = await window.api.listPlaylists().catch(() => null)
      if (fresh) setPlaylists(fresh.map(withFittedHeight))
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

  const deletePlaylist = useCallback((id) => {
    const current = playlistsRef.current.find((playlist) => playlist.id === id)
    const label = current?.title || 'esta lista'
    if (!window.confirm(`¿Quitar «${label}» del tablero? Los cursos siguen en la biblioteca.`)) {
      return
    }
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id))
    window.api.deletePlaylist(id).catch(async (err) => {
      toast.error(err.message || 'No se pudo quitar la lista')
      const fresh = await window.api.listPlaylists().catch(() => null)
      if (fresh) setPlaylists(fresh.map(withFittedHeight))
    })
  }, [])

  const removeCourse = useCallback(
    (playlistId, coursePath) => {
      const current = playlistsRef.current.find((playlist) => playlist.id === playlistId)
      if (!current) return
      persistPlaylist({
        ...current,
        coursePaths: current.coursePaths.filter((item) => item !== coursePath)
      })
    },
    [persistPlaylist]
  )

  const openCourse = useCallback(
    (coursePath) => {
      const course = coursesRef.current.find((item) => item.path === coursePath)
      if (!course) {
        toast.error('Ese curso no está en la biblioteca')
        return
      }
      onOpenCourse?.(course)
    },
    [onOpenCourse]
  )

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
      if (playlist.coursePaths.includes(coursePath)) {
        toast('Ese curso ya está en la lista')
        return
      }
      setSelectedId(id)
      persistPlaylist({ ...playlist, coursePaths: [...playlist.coursePaths, coursePath] })
    },
    [persistPlaylist]
  )

  const createPlaylist = useCallback(async () => {
    if (creatingRef.current) return
    creatingRef.current = true
    setCreating(true)
    try {
      const rect = canvasRef.current?.getBoundingClientRect()
      let position = {
        x: 48 + (playlistsRef.current.length % 6) * 28,
        y: 48 + (playlistsRef.current.length % 6) * 24
      }
      if (rect && rect.width > 0) {
        const center = screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + Math.min(rect.height * 0.38, 280)
        })
        position = { x: center.x - PLAYLIST_DEFAULT_W / 2, y: center.y - 40 }
      }
      const created = await window.api.upsertPlaylist({
        title: 'Nueva lista',
        position,
        size: { width: PLAYLIST_DEFAULT_W, height: 220 },
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
  }, [screenToFlowPosition])

  const handleNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      const live = changes.filter(
        (change) => change.type === 'dimensions' && change.resizing && change.dimensions
      )
      if (live.length) {
        setNodes((current) =>
          current.map((node) => {
            if (node.type !== 'course') return node
            const change = live.find((item) => item.id === node.parentId)
            if (!change) return node
            const cardWidth = Math.max(120, change.dimensions.width - PLAYLIST_PAD_X * 2)
            return {
              ...node,
              width: cardWidth,
              style: { ...node.style, width: cardWidth }
            }
          })
        )
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
        const position = { x: node.position.x, y: node.position.y }
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
      const current = list.find((playlist) => playlist.id === node.data.playlistId)
      if (!current) return
      const nextPaths = reorderCoursePaths(
        current.coursePaths,
        node.data.coursePath,
        node.position.y,
        bigCoverRef.current ? PLAYLIST_COVER_H : PLAYLIST_CARD_H
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
    if (groups.length === 0) return true
    const label =
      groups.length === 1 ? `«${groups[0].data?.title || 'esta lista'}»` : `${groups.length} listas`
    return window.confirm(`¿Quitar ${label} del tablero? Los cursos siguen en la biblioteca.`)
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
    const next = prev
      .filter((playlist) => !removedGroups.has(playlist.id))
      .map((playlist) => {
        const drop = removals.get(playlist.id)
        if (!drop?.length) return playlist
        const dropSet = new Set(drop)
        return withFittedHeight({
          ...playlist,
          coursePaths: playlist.coursePaths.filter((coursePath) => !dropSet.has(coursePath))
        })
      })
    setPlaylists(next)
    const tasks = [...removedGroups].map((id) => window.api.deletePlaylist(id))
    for (const playlist of next) {
      const before = prev.find((item) => item.id === playlist.id)
      if (before && before.coursePaths.length !== playlist.coursePaths.length) {
        tasks.push(window.api.upsertPlaylist(playlist))
      }
    }
    Promise.all(tasks).catch(async (err) => {
      toast.error(err.message || 'No se pudo actualizar la lista')
      const fresh = await window.api.listPlaylists().catch(() => null)
      if (fresh) setPlaylists(fresh.map(withFittedHeight))
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

  const onNodeDoubleClick = useCallback(
    (_event, node) => {
      if (node.type === 'course') openCourse(node.data.coursePath)
    },
    [openCourse]
  )

  const actions = useMemo(
    () => ({
      dropId,
      selectedId,
      renamePlaylist,
      deletePlaylist,
      removeCourse,
      openCourse
    }),
    [dropId, selectedId, renamePlaylist, deletePlaylist, removeCourse, openCourse]
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
  const visibleCourses = useMemo(() => {
    const query = search.trim().toLowerCase()
    const listed = new Set(selectedPlaylist?.coursePaths || [])
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

  const membership = useMemo(() => {
    const map = new Map()
    for (const playlist of playlists) {
      for (const coursePath of playlist.coursePaths) {
        map.set(coursePath, (map.get(coursePath) || 0) + 1)
      }
    }
    return map
  }, [playlists])

  const inSelected = new Set(selectedPlaylist?.coursePaths || [])

  return (
    <BoardActions.Provider value={actions}>
      <div
        className="playlist-board"
        style={{
          '--playlist-gap': `${PLAYLIST_GAP}px`,
          '--sidebar-w': `${sidebarWidth}px`
        }}
      >
        <header className="playlist-board__header">
          <div className="playlist-board__brand">
            <h1>Listas</h1>
            <AppNav active="playlists" onSelect={onNavigate} />
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={createPlaylist}
            disabled={creating}
          >
            Nueva lista
          </button>
        </header>
        <div className="playlist-board__body">
          <aside className="playlist-board__sidebar">
            <div className="playlist-board__sidebar-head">
              <div className="playlist-board__sidebar-title">
                <h2>Cursos</h2>
                <div
                  className="segmented playlist-board__view"
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
              <p>
                {selectedPlaylist
                  ? `${visibleCourses.length} · añadir a «${selectedPlaylist.title}»`
                  : `${visibleCourses.length} cursos`}
              </p>
            </div>
            <div className="search-field playlist-board__search">
              <svg
                className="search-field__icon"
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
              />
            </div>
            <div className="playlist-board__filters">
              <div className="chip-select">
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
              <div className="chip-select">
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
              <div className="playlist-board__pills">
                <button
                  type="button"
                  className="filter-pill"
                  aria-pressed={inProcessOnly}
                  onClick={() => setInProcessOnly((value) => !value)}
                >
                  En curso
                </button>
                <button
                  type="button"
                  className="filter-pill"
                  aria-pressed={unlistedOnly}
                  onClick={() => setUnlistedOnly((value) => !value)}
                >
                  Sin añadir
                </button>
              </div>
            </div>
            <div className={`playlist-board__courses${bigCover ? ' is-covers' : ''}`} role="list">
              {visibleCourses.length === 0 ? (
                <p className="playlist-board__courses-empty">Ningún curso coincide.</p>
              ) : (
                visibleCourses.map((course) => {
                  const member = inSelected.has(course.path)
                  const count = membership.get(course.path) || 0
                  return (
                    <div
                      key={course.path}
                      className={`playlist-course-row${member ? ' is-member' : ''}`}
                      role="listitem"
                      draggable
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
                      <CourseCover
                        coursePath={course.path}
                        hasCover={course.hasCover}
                        coverStamp={course.coverStamp}
                        className="playlist-course-row__cover"
                      />
                      <div className="playlist-course-row__text">
                        <span className="playlist-course-row__title">
                          {course.title || course.path}
                        </span>
                        <span className="playlist-course-row__meta">
                          {member
                            ? 'En esta lista'
                            : count > 0
                              ? `En ${count} ${count === 1 ? 'lista' : 'listas'}`
                              : course.institution || 'Arrastrar'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="playlist-course-row__add"
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
              className="playlist-board__resizer"
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
          <div
            className="playlist-board__canvas"
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
              onBeforeDelete={onBeforeDelete}
              onNodesDelete={onNodesDelete}
              onNodeDoubleClick={onNodeDoubleClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              style={{ width: '100%', height: '100%' }}
              colorMode="light"
              fitView={false}
              minZoom={0.25}
              maxZoom={1.75}
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
                <Panel position="top-center" className="playlist-board__hint">
                  Crea una lista y arrastra cursos desde el lateral.
                </Panel>
              ) : null}
              {loading ? (
                <Panel position="top-center" className="playlist-board__hint">
                  Cargando listas…
                </Panel>
              ) : null}
            </ReactFlow>
          </div>
        </div>
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
