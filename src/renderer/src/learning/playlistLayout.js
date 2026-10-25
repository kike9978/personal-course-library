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
export const PLAYLIST_MAX_W = 960
export const PLAYLIST_DEFAULT_W = 320
export const PLAYLIST_PLACE_GAP = 32

function finite(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function cardStride(cardHeight = PLAYLIST_CARD_H) {
  return cardHeight + PLAYLIST_GAP
}

export function contentHeight(count, cardHeight = PLAYLIST_CARD_H) {
  const total = Number(count) || 0
  const card = cardHeight || PLAYLIST_CARD_H
  if (total <= 0) return PLAYLIST_HEADER + 108
  return PLAYLIST_HEADER + total * card + (total - 1) * PLAYLIST_GAP + PLAYLIST_PAD_BOTTOM
}

/**
 * Vertical slots for a lista and the listas nested inside it.
 * Own courses come first. Each nested lista is a header plus its courses.
 */
export function frameSlots(playlist, byId, cardHeight = PLAYLIST_CARD_H) {
  const card = cardHeight || PLAYLIST_CARD_H
  const slots = []
  let y = PLAYLIST_HEADER
  let started = false

  const gap = () => {
    if (started) y += PLAYLIST_GAP
    started = true
  }

  const own = Array.isArray(playlist?.coursePaths) ? playlist.coursePaths : []
  own.forEach((coursePath, index) => {
    gap()
    slots.push({
      kind: 'course',
      y,
      height: card,
      coursePath,
      ownerId: playlist.id,
      sectionTop: PLAYLIST_HEADER,
      continues: index < own.length - 1
    })
    y += card
  })

  const childIds = Array.isArray(playlist?.childIds) ? playlist.childIds : []
  for (const childId of childIds) {
    const child = byId?.get(childId)
    if (!child) continue
    gap()
    const paths = Array.isArray(child.coursePaths) ? child.coursePaths : []
    const nest = {
      kind: 'nest',
      y,
      height: NEST_HEAD,
      boxHeight: NEST_HEAD,
      childId,
      title: child.title || 'Lista',
      why: child.why || '',
      count: paths.length
    }
    slots.push(nest)
    y += NEST_HEAD
    const sectionTop = y + (paths.length ? PLAYLIST_GAP : 0)
    paths.forEach((coursePath, index) => {
      y += PLAYLIST_GAP
      slots.push({
        kind: 'course',
        y,
        height: card,
        coursePath,
        ownerId: child.id,
        sectionTop,
        nested: true,
        continues: index < paths.length - 1
      })
      y += card
    })
    if (paths.length) y += NEST_PAD_BOTTOM
    nest.boxHeight = y - nest.y
  }

  const height = started ? y + PLAYLIST_PAD_BOTTOM : contentHeight(0, card)
  return { slots, height }
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
  const needed =
    byId && childIds.length
      ? frameSlots(playlist, byId, cardHeight).height
      : contentHeight(coursePaths.length, cardHeight)
  const width = Math.min(
    PLAYLIST_MAX_W,
    Math.max(PLAYLIST_MIN_W, finite(playlist?.size?.width, PLAYLIST_DEFAULT_W))
  )
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
 * Drop index for a course dragged to a vertical offset inside its playlist.
 * `y` is relative to the playlist frame.
 */
export function reorderCoursePaths(coursePaths, coursePath, y, cardHeight = PLAYLIST_CARD_H) {
  const rest = coursePaths.filter((item) => item !== coursePath)
  const slot = Math.round((finite(y, PLAYLIST_HEADER) - PLAYLIST_HEADER) / cardStride(cardHeight))
  const index = Math.max(0, Math.min(rest.length, slot))
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

/**
 * Pack playlists into rows so their frames no longer overlap.
 * Keeps the current reading order (top to bottom, then left to right).
 */
export function orderPlaylists(playlists, options = {}) {
  const list = Array.isArray(playlists) ? playlists : []
  const gap = options.gap ?? PLAYLIST_PLACE_GAP
  const cardHeight = options.cardHeight
  const originX = finite(options.originX, 48)
  const originY = finite(options.originY, 48)
  const maxRowWidth = Math.max(PLAYLIST_DEFAULT_W, finite(options.maxRowWidth, 1280))

  const roots = list.filter((playlist) => !playlist.parentId)
  const hidden = list.filter((playlist) => playlist.parentId)
  const byId = new Map(list.map((playlist) => [playlist.id, playlist]))
  const fitted = roots.map((playlist) => withFittedHeight(playlist, cardHeight, byId))
  const ordered = [...fitted].sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y
    if (a.position.x !== b.position.x) return a.position.x - b.position.x
    return String(a.id).localeCompare(String(b.id))
  })

  let x = originX
  let y = originY
  let rowHeight = 0
  const positions = new Map()

  for (const playlist of ordered) {
    const { width, height } = playlist.size
    if (x > originX && x + width > originX + maxRowWidth) {
      x = originX
      y += rowHeight + gap
      rowHeight = 0
    }
    positions.set(playlist.id, { x, y })
    x += width + gap
    rowHeight = Math.max(rowHeight, height)
  }

  const placed = roots.map((playlist) => {
    const position = positions.get(playlist.id)
    if (!position) return playlist
    return { ...playlist, position }
  })
  return [...placed, ...hidden]
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
      .map((slot) => ({
        childId: slot.childId,
        title: slot.title,
        why: slot.why,
        count: slot.count,
        y: slot.y,
        height: slot.boxHeight
      }))

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
        count: courseSlots.length,
        nests,
        minHeight: height
      }
    })

    for (const slot of courseSlots) {
      const owner = byId.get(slot.ownerId) || playlist
      const course = courseByPath.get(slot.coursePath) || null
      const id = courseNodeId(slot.ownerId, slot.coursePath)
      const inset = slot.nested ? NEST_COURSE_X : PLAYLIST_PAD_X
      const slotWidth = width - inset * 2
      nodes.push({
        id,
        type: 'course',
        parentId: playlist.id,
        extent: 'parent',
        zIndex: 10,
        position: { x: inset, y: slot.y },
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
          bigCover
        }
      })
    }
  }

  return { nodes, edges }
}
