export const PLAYLIST_PAD_X = 16
export const PLAYLIST_HEADER = 56
export const PLAYLIST_CARD_H = 76
export const PLAYLIST_COVER_H = 210
export const PLAYLIST_GAP = 28
export const PLAYLIST_PAD_BOTTOM = 16
export const NEST_HEAD = 40
export const NEST_FRAME_X = 10
export const NEST_PAD = 8
export const NEST_COURSE_X = NEST_FRAME_X + NEST_PAD
export const NEST_PAD_BOTTOM = 12
export const PLAYLIST_MIN_W = 280
export const PLAYLIST_MAX_W = 1440
export const PLAYLIST_DEFAULT_W = 320
export const PLAYLIST_COVER_COL = 220
export const PLAYLIST_PLACE_GAP = 32

function finite(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function cardStride(cardHeight = PLAYLIST_CARD_H) {
  return cardHeight + PLAYLIST_GAP
}

/** How many cover cards fit across the inside of a lista. */
export function coverColumnCount(innerWidth) {
  const inner = Math.max(0, Number(innerWidth) || 0)
  return Math.max(1, Math.floor((inner + PLAYLIST_GAP) / (PLAYLIST_COVER_COL + PLAYLIST_GAP)))
}

export function coverCardWidth(innerWidth, columns) {
  const cols = Math.max(1, columns || 1)
  const inner = Math.max(0, Number(innerWidth) || 0)
  if (cols === 1) return inner
  return (inner - PLAYLIST_GAP * (cols - 1)) / cols
}

export function contentHeight(count, cardHeight = PLAYLIST_CARD_H) {
  const total = Number(count) || 0
  const card = cardHeight || PLAYLIST_CARD_H
  if (total <= 0) return PLAYLIST_HEADER + 108
  return PLAYLIST_HEADER + total * card + (total - 1) * PLAYLIST_GAP + PLAYLIST_PAD_BOTTOM
}

/**
 * Slots for a lista and the listas nested inside it.
 * Lista view is one column. Portadas wraps courses into a grid that follows the frame width.
 * Own courses come first. Each nested lista is a header plus its courses.
 */
export function frameSlots(playlist, byId, cardHeight = PLAYLIST_CARD_H) {
  const card = cardHeight || PLAYLIST_CARD_H
  const grid = card === PLAYLIST_COVER_H
  const frameWidth = Math.min(
    PLAYLIST_MAX_W,
    Math.max(PLAYLIST_MIN_W, finite(playlist?.size?.width, PLAYLIST_DEFAULT_W))
  )
  if (playlist?.collapsed) return { slots: [], height: PLAYLIST_HEADER, width: frameWidth }

  const slots = []
  let y = PLAYLIST_HEADER
  let started = false

  const gap = () => {
    if (started) y += PLAYLIST_GAP
    started = true
  }

  const placeCourses = (paths, { inset, ownerId, nested, sectionTop }) => {
    const inner = Math.max(0, frameWidth - inset * 2)
    const columns = grid ? coverColumnCount(inner) : 1
    const cardWidth = columns === 1 ? inner : coverCardWidth(inner, columns)
    paths.forEach((coursePath, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      slots.push({
        kind: 'course',
        x: inset + column * (cardWidth + PLAYLIST_GAP),
        y: sectionTop + row * cardStride(card),
        width: cardWidth,
        height: card,
        columns,
        inset,
        innerWidth: inner,
        coursePath,
        ownerId,
        sectionTop,
        nested: Boolean(nested),
        continues: columns === 1 && index < paths.length - 1
      })
    })
    if (!paths.length) return 0
    const rows = Math.ceil(paths.length / columns)
    return rows * card + (rows - 1) * PLAYLIST_GAP
  }

  const own = Array.isArray(playlist?.coursePaths) ? playlist.coursePaths : []
  if (own.length) {
    y += placeCourses(own, {
      inset: PLAYLIST_PAD_X,
      ownerId: playlist.id,
      sectionTop: y
    })
    started = true
  }

  const childIds = Array.isArray(playlist?.childIds) ? playlist.childIds : []
  for (const childId of childIds) {
    const child = byId?.get(childId)
    if (!child) continue
    gap()
    const paths = Array.isArray(child.coursePaths) ? child.coursePaths : []
    const collapsed = Boolean(child.collapsed)
    const nest = {
      kind: 'nest',
      y,
      height: NEST_HEAD,
      boxHeight: NEST_HEAD,
      childId,
      title: child.title || 'Lista',
      why: child.why || '',
      count: paths.length,
      collapsed
    }
    slots.push(nest)
    y += NEST_HEAD
    if (!collapsed && paths.length) {
      const sectionTop = y + PLAYLIST_GAP
      const block = placeCourses(paths, {
        inset: NEST_COURSE_X,
        ownerId: child.id,
        nested: true,
        sectionTop
      })
      y = sectionTop + block + NEST_PAD_BOTTOM
    }
    nest.boxHeight = y - nest.y
  }

  const height = started ? y + PLAYLIST_PAD_BOTTOM : contentHeight(0, card)
  return { slots, height, width: frameWidth }
}

export function playlistCourseCount(playlist, byId) {
  const own = Array.isArray(playlist?.coursePaths) ? playlist.coursePaths.length : 0
  const childIds = Array.isArray(playlist?.childIds) ? playlist.childIds : []
  return childIds.reduce((total, childId) => {
    const child = byId?.get(childId)
    const nested = Array.isArray(child?.coursePaths) ? child.coursePaths.length : 0
    return total + nested
  }, own)
}

export function courseNodeY(index, cardHeight = PLAYLIST_CARD_H) {
  return PLAYLIST_HEADER + index * cardStride(cardHeight)
}

export function courseNodeId(playlistId, coursePath) {
  return `${playlistId}::${coursePath}`
}

export function withFittedHeight(playlist, cardHeight = PLAYLIST_CARD_H, byId) {
  const coursePaths = Array.isArray(playlist?.coursePaths) ? playlist.coursePaths : []
  const childIds = Array.isArray(playlist?.childIds) ? playlist.childIds : []
  const width = Math.min(
    PLAYLIST_MAX_W,
    Math.max(PLAYLIST_MIN_W, finite(playlist?.size?.width, PLAYLIST_DEFAULT_W))
  )
  const needed = playlist?.collapsed
    ? PLAYLIST_HEADER
    : frameSlots({ ...playlist, coursePaths, childIds, size: { width } }, byId, cardHeight).height
  return {
    ...playlist,
    coursePaths,
    position: {
      x: finite(playlist?.position?.x, 48),
      y: finite(playlist?.position?.y, 48)
    },
    size: { width, height: needed }
  }
}

/**
 * Drop index for a course dragged inside its playlist.
 * `y` is relative to the playlist frame. A cover grid also uses `layout.x`.
 */
export function reorderCoursePaths(
  coursePaths,
  coursePath,
  y,
  cardHeight = PLAYLIST_CARD_H,
  layout
) {
  const rest = coursePaths.filter((item) => item !== coursePath)
  const columns = layout?.columns || 1
  let index
  if (columns > 1) {
    const inset = layout.inset ?? PLAYLIST_PAD_X
    const inner = layout.innerWidth ?? columns * PLAYLIST_COVER_COL
    const cardWidth = coverCardWidth(inner, columns)
    const originY = finite(layout.originY, PLAYLIST_HEADER)
    const column = Math.max(
      0,
      Math.min(
        columns - 1,
        Math.round((finite(layout.x, inset) - inset) / (cardWidth + PLAYLIST_GAP))
      )
    )
    const row = Math.max(0, Math.round((finite(y, originY) - originY) / cardStride(cardHeight)))
    index = Math.max(0, Math.min(rest.length, row * columns + column))
  } else {
    const slot = Math.round((finite(y, PLAYLIST_HEADER) - PLAYLIST_HEADER) / cardStride(cardHeight))
    index = Math.max(0, Math.min(rest.length, slot))
  }
  const next = rest.slice()
  next.splice(index, 0, coursePath)
  return next
}

export function frameContains(playlist, point, byId, cardHeight = PLAYLIST_CARD_H) {
  const frame = withFittedHeight(playlist, cardHeight, byId)
  const { x, y } = frame.position
  const { width, height } = frame.size
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
}

export function boxesOverlap(a, b, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  )
}

function occupiedBox(playlist, cardHeight, byId) {
  const fitted = withFittedHeight(playlist, cardHeight, byId)
  return {
    x: fitted.position.x,
    y: fitted.position.y,
    width: fitted.size.width,
    height: fitted.size.height
  }
}

/**
 * Top-left for a new frame that does not cover an existing playlist.
 * Prefers `preferred` when it is free, then the nearest open slot.
 */
export function placeWithoutOverlap(playlists, size, preferred = { x: 48, y: 48 }, options = {}) {
  const gap = options.gap ?? PLAYLIST_PLACE_GAP
  const cardHeight = options.cardHeight
  const list = (Array.isArray(playlists) ? playlists : []).filter((playlist) => !playlist?.parentId)
  const byId = new Map(
    (Array.isArray(playlists) ? playlists : []).map((playlist) => [playlist.id, playlist])
  )
  const occupied = list.map((playlist) => occupiedBox(playlist, cardHeight, byId))
  const width = Math.min(
    PLAYLIST_MAX_W,
    Math.max(PLAYLIST_MIN_W, finite(size?.width, PLAYLIST_DEFAULT_W))
  )
  const height = Math.max(1, finite(size?.height, contentHeight(0, cardHeight)))
  const origin = {
    x: finite(preferred?.x, 48),
    y: finite(preferred?.y, 48)
  }
  const fits = (x, y) => {
    const box = { x, y, width, height }
    return !occupied.some((frame) => boxesOverlap(box, frame, gap))
  }

  if (fits(origin.x, origin.y)) return origin

  const candidates = []
  for (const frame of occupied) {
    candidates.push({ x: frame.x + frame.width + gap, y: frame.y })
    candidates.push({ x: frame.x, y: frame.y + frame.height + gap })
  }

  const stepX = width + gap
  const stepY = height + gap
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      candidates.push({ x: origin.x + col * stepX, y: origin.y + row * stepY })
    }
  }

  candidates.sort((a, b) => {
    const da = (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2
    const db = (b.x - origin.x) ** 2 + (b.y - origin.y) ** 2
    if (da !== db) return da - db
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })

  for (const candidate of candidates) {
    if (fits(candidate.x, candidate.y)) return { x: candidate.x, y: candidate.y }
  }

  const right = occupied.reduce((max, frame) => Math.max(max, frame.x + frame.width), origin.x)
  return { x: right + gap, y: origin.y }
}

function readingCompare(a, b) {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  if (a.position.x !== b.position.x) return a.position.x - b.position.x
  return String(a.id).localeCompare(String(b.id))
}

function titleCompare(a, b) {
  const byTitle = String(a.title || '').localeCompare(String(b.title || ''), 'es', {
    sensitivity: 'base'
  })
  if (byTitle) return byTitle
  return String(a.id).localeCompare(String(b.id))
}

/**
 * Most common course theme on a lista, including nested lists.
 * Ties break toward the earlier theme name. Empty when no course has a theme.
 */
export function dominantTheme(playlist, byId, courseByPath) {
  const counts = new Map()
  const seen = new Set()
  const visit = (item) => {
    if (!item || seen.has(item.id)) return
    if (item.id) seen.add(item.id)
    for (const path of item.coursePaths || []) {
      const course = courseByPath?.get?.(path)
      const themes = Array.isArray(course?.theme) ? course.theme : []
      for (const theme of themes) {
        const label = String(theme || '').trim()
        if (!label) continue
        counts.set(label, (counts.get(label) || 0) + 1)
      }
    }
    for (const childId of item.childIds || []) visit(byId?.get?.(childId))
  }
  visit(playlist)
  let best = ''
  let bestCount = 0
  for (const [theme, count] of counts) {
    const earlier =
      count === bestCount && theme.localeCompare(best, 'es', { sensitivity: 'base' }) < 0
    if (count > bestCount || earlier) {
      best = theme
      bestCount = count
    }
  }
  return best
}

/**
 * Pack playlists into rows so their frames no longer overlap.
 * `mode` is `reading` (top to bottom, then left to right), `alpha` (title), or `topic`.
 * Topic mode starts a new row when the theme changes. Lists with no theme go last.
 */
export function orderPlaylists(playlists, options = {}) {
  const list = Array.isArray(playlists) ? playlists : []
  const gap = options.gap ?? PLAYLIST_PLACE_GAP
  const cardHeight = options.cardHeight
  const originX = finite(options.originX, 48)
  const originY = finite(options.originY, 48)
  const maxRowWidth = Math.max(PLAYLIST_DEFAULT_W, finite(options.maxRowWidth, 1280))
  const mode = options.mode || 'reading'
  const topicOf = typeof options.topicOf === 'function' ? options.topicOf : () => ''

  const roots = list.filter((playlist) => !playlist.parentId)
  const hidden = list.filter((playlist) => playlist.parentId)
  const byId = new Map(list.map((playlist) => [playlist.id, playlist]))
  const fitted = roots.map((playlist) => withFittedHeight(playlist, cardHeight, byId))
  const ordered = [...fitted].sort((a, b) => {
    if (mode === 'alpha') return titleCompare(a, b)
    if (mode === 'topic') {
      const topicA = String(topicOf(a) || '')
      const topicB = String(topicOf(b) || '')
      if (!topicA !== !topicB) return topicA ? -1 : 1
      const byTopic = topicA.localeCompare(topicB, 'es', { sensitivity: 'base' })
      if (byTopic) return byTopic
      return titleCompare(a, b)
    }
    return readingCompare(a, b)
  })

  let x = originX
  let y = originY
  let rowHeight = 0
  let previousTopic = null
  const positions = new Map()

  for (const playlist of ordered) {
    const { width, height } = playlist.size
    const topic = mode === 'topic' ? String(topicOf(playlist) || '') : null
    const topicBreak = mode === 'topic' && previousTopic !== null && topic !== previousTopic
    if (topicBreak || (x > originX && x + width > originX + maxRowWidth)) {
      x = originX
      y += rowHeight + (topicBreak ? gap * 2 : gap)
      rowHeight = 0
    }
    positions.set(playlist.id, { x, y })
    x += width + gap
    rowHeight = Math.max(rowHeight, height)
    previousTopic = topic
  }

  const placed = roots.map((playlist) => {
    const position = positions.get(playlist.id)
    if (!position) return playlist
    return { ...playlist, position }
  })
  return [...placed, ...hidden]
}

/**
 * Leave each lista where it is, and move only the ones that overlap.
 * Earlier frames (top, then left) keep their place. Nested listas stay hidden.
 */
export function separateOverlaps(playlists, options = {}) {
  const list = Array.isArray(playlists) ? playlists : []
  const gap = options.gap ?? PLAYLIST_PLACE_GAP
  const cardHeight = options.cardHeight
  const roots = list.filter((playlist) => !playlist.parentId)
  const hidden = list.filter((playlist) => playlist.parentId)
  const byId = new Map(list.map((playlist) => [playlist.id, playlist]))
  const ordered = roots
    .map((playlist) => withFittedHeight(playlist, cardHeight, byId))
    .sort(readingCompare)

  const placed = []
  const positions = new Map()
  for (const playlist of ordered) {
    const position = placeWithoutOverlap([...hidden, ...placed], playlist.size, playlist.position, {
      gap,
      cardHeight
    })
    placed.push({ ...playlist, position })
    positions.set(playlist.id, position)
  }

  return [
    ...roots.map((playlist) => {
      const position = positions.get(playlist.id)
      if (!position) return playlist
      return { ...playlist, position }
    }),
    ...hidden
  ]
}

export function playlistAtPoint(playlists, point, options = {}) {
  const list = Array.isArray(playlists) ? playlists : []
  const byId = new Map(list.map((playlist) => [playlist.id, playlist]))
  const ignoreId = options.ignoreId || ''
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const playlist = list[index]
    if (!playlist || playlist.id === ignoreId || playlist.parentId) continue
    if (frameContains(playlist, point, byId, options.cardHeight)) return playlist
  }
  return null
}

export function buildFlow(playlists, courseByPath, options = {}) {
  const cardHeight = options.cardHeight || PLAYLIST_CARD_H
  const bigCover = cardHeight !== PLAYLIST_CARD_H
  const coursesLocked = Boolean(options.coursesLocked)
  const fullById = options.fullById || null
  const list = Array.isArray(playlists) ? playlists : []
  const byId = new Map(list.map((playlist) => [playlist.id, playlist]))
  const roots = list.filter((playlist) => !playlist.parentId || !byId.has(playlist.parentId))
  const nodes = []
  const edges = []

  for (const raw of roots) {
    const playlist = withFittedHeight(raw, cardHeight, byId)
    const { width, height } = playlist.size
    const { slots } = frameSlots(playlist, byId, cardHeight)
    const courseSlots = slots.filter((slot) => slot.kind === 'course')
    const nests = slots
      .filter((slot) => slot.kind === 'nest')
      .map((slot) => {
        const fullChild = fullById?.get(slot.childId)
        const totalCount = Array.isArray(fullChild?.coursePaths)
          ? fullChild.coursePaths.length
          : slot.count
        return {
          childId: slot.childId,
          title: slot.title,
          why: slot.why,
          count: slot.count,
          totalCount,
          y: slot.y,
          height: slot.boxHeight,
          collapsed: Boolean(slot.collapsed)
        }
      })
    const fullPlaylist = fullById?.get(playlist.id) || playlist
    const count = playlistCourseCount(playlist, byId)
    const totalCount = fullById ? playlistCourseCount(fullPlaylist, fullById) : count

    nodes.push({
      id: playlist.id,
      type: 'playlist',
      position: playlist.position,
      zIndex: 0,
      width,
      height,
      initialWidth: width,
      initialHeight: height,
      style: { width, height },
      dragHandle: '.playlist-frame__drag',
      data: {
        title: playlist.title,
        why: playlist.why || '',
        count,
        totalCount,
        filtered: coursesLocked,
        collapsed: Boolean(playlist.collapsed),
        nests,
        minHeight: height
      }
    })

    for (const slot of courseSlots) {
      const owner = byId.get(slot.ownerId) || playlist
      const course = courseByPath.get(slot.coursePath) || null
      const id = courseNodeId(slot.ownerId, slot.coursePath)
      const inset = slot.inset ?? (slot.nested ? NEST_COURSE_X : PLAYLIST_PAD_X)
      const slotWidth = slot.width ?? width - inset * 2
      nodes.push({
        id,
        type: 'course',
        parentId: playlist.id,
        draggable: !coursesLocked,
        ...(bigCover ? {} : { extent: 'parent' }),
        zIndex: 10,
        position: { x: slot.x ?? inset, y: slot.y },
        width: slotWidth,
        height: cardHeight,
        style: { width: slotWidth, height: cardHeight },
        data: {
          playlistId: slot.ownerId,
          rootId: playlist.id,
          coursePath: slot.coursePath,
          title: course?.title || slot.coursePath,
          institution: course?.institution || '',
          hasCover: Boolean(course?.hasCover),
          coverStamp: course?.coverStamp || null,
          why: owner.courseWhys?.[slot.coursePath] || '',
          missing: !course,
          inProcess: Boolean(course?.isInProcess),
          percent: typeof course?.learning?.percent === 'number' ? course.learning.percent : null,
          continues: slot.continues,
          sectionTop: slot.sectionTop,
          nested: Boolean(slot.nested),
          bigCover,
          columns: slot.columns || 1,
          inset,
          innerWidth: slot.innerWidth
        }
      })
    }
  }

  return { nodes, edges }
}
