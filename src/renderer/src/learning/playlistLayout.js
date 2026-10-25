export const PLAYLIST_PAD_X = 16
export const PLAYLIST_HEADER = 56
export const PLAYLIST_CARD_H = 76
export const PLAYLIST_COVER_H = 210
export const PLAYLIST_GAP = 28
export const PLAYLIST_PAD_BOTTOM = 16
export const PLAYLIST_MIN_W = 280
export const PLAYLIST_MAX_W = 960
export const PLAYLIST_DEFAULT_W = 320

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

export function courseNodeY(index, cardHeight = PLAYLIST_CARD_H) {
  return PLAYLIST_HEADER + index * cardStride(cardHeight)
}

export function courseNodeId(playlistId, coursePath) {
  return `${playlistId}::${coursePath}`
}

export function withFittedHeight(playlist, cardHeight = PLAYLIST_CARD_H) {
  const coursePaths = Array.isArray(playlist?.coursePaths) ? playlist.coursePaths : []
  const needed = contentHeight(coursePaths.length, cardHeight)
  const width = Math.min(
    PLAYLIST_MAX_W,
    Math.max(PLAYLIST_MIN_W, finite(playlist?.size?.width, PLAYLIST_DEFAULT_W))
  )
  const height = Math.max(needed, finite(playlist?.size?.height, needed))
  return {
    ...playlist,
    coursePaths,
    position: {
      x: finite(playlist?.position?.x, 48),
      y: finite(playlist?.position?.y, 48)
    },
    size: { width, height }
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

export function frameContains(playlist, point) {
  const frame = withFittedHeight(playlist)
  const { x, y } = frame.position
  const { width, height } = frame.size
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
}

export function playlistAtPoint(playlists, point) {
  for (let index = playlists.length - 1; index >= 0; index -= 1) {
    if (frameContains(playlists[index], point)) return playlists[index]
  }
  return null
}

export function buildFlow(playlists, courseByPath, options = {}) {
  const cardHeight = options.cardHeight || PLAYLIST_CARD_H
  const bigCover = cardHeight !== PLAYLIST_CARD_H
  const nodes = []
  const edges = []

  for (const raw of playlists) {
    const playlist = withFittedHeight(raw, cardHeight)
    const { width, height } = playlist.size
    const cardWidth = width - PLAYLIST_PAD_X * 2

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
        count: playlist.coursePaths.length,
        minHeight: contentHeight(playlist.coursePaths.length, cardHeight)
      }
    })

    playlist.coursePaths.forEach((coursePath, index) => {
      const course = courseByPath.get(coursePath) || null
      const id = courseNodeId(playlist.id, coursePath)
      nodes.push({
        id,
        type: 'course',
        parentId: playlist.id,
        extent: 'parent',
        zIndex: 10,
        position: { x: PLAYLIST_PAD_X, y: courseNodeY(index, cardHeight) },
        width: cardWidth,
        height: cardHeight,
        style: { width: cardWidth, height: cardHeight },
        data: {
          playlistId: playlist.id,
          coursePath,
          title: course?.title || coursePath,
          institution: course?.institution || '',
          hasCover: Boolean(course?.hasCover),
          coverStamp: course?.coverStamp || null,
          missing: !course,
          inProcess: Boolean(course?.isInProcess),
          percent: typeof course?.learning?.percent === 'number' ? course.learning.percent : null,
          continues: index < playlist.coursePaths.length - 1,
          bigCover
        }
      })
    })
  }

  return { nodes, edges }
}
