/**
 * Fuentes: saved links (YouTube, Instagram, articles). Pure helpers shared by
 * the main process and the renderer. No network here.
 */

export const SOURCE_KINDS = ['youtube', 'instagram', 'article', 'other']
export const SOURCE_STATUSES = ['inbox', 'kept', 'archived']

const TRACKING_PARAMS = new Set([
  'si',
  'igsh',
  'igshid',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'feature',
  'ref_src',
  'pp'
])

const YOUTUBE_ID = /^[\w-]{11}$/

function parseUrl(input) {
  let text = String(input || '').trim()
  if (!text) return null
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(text)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(text)) return null
    text = `https://${text}`
  }
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

function hostOf(url) {
  return url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '')
}

/** Seconds from a YouTube `t` / `start` value such as `252`, `252s`, or `4m12s`. */
export function parseYouTubeTime(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d+s?$/.test(text)) return Number(text.replace(/s$/, ''))
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match || !match[0]) return null
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)
}

/** Video id for watch, youtu.be, shorts, live, and embed links. */
export function youTubeVideoId(input) {
  const url = input instanceof URL ? input : parseUrl(input)
  if (!url) return null
  const host = hostOf(url)
  let id = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1]
  else if (
    host === 'youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'music.youtube.com'
  ) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const match = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/)
      if (match) id = match[1]
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

/** Post or reel code for instagram.com/p/<code>, /reel/<code>, /tv/<code>. */
export function instagramShortcode(input) {
  const url = input instanceof URL ? input : parseUrl(input)
  if (!url || hostOf(url) !== 'instagram.com') return null
  const match = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/)
  return match ? match[2] : null
}

export function sourceKindForUrl(input) {
  const url = input instanceof URL ? input : parseUrl(input)
  if (!url) return 'other'
  const host = hostOf(url)
  if (youTubeVideoId(url)) return 'youtube'
  if (host === 'instagram.com') return 'instagram'
  if (host === 'youtube.com' || host === 'youtu.be') return 'other'
  return 'article'
}

/**
 * One form per link so the same video or post is only saved once.
 * Tracking parameters are dropped. A YouTube start time is returned apart,
 * because it is a place in the video, not part of which video it is.
 *
 * @returns {{ url: string, kind: string, startSec: number|null } | null}
 */
export function canonicalSourceUrl(input) {
  const url = parseUrl(input)
  if (!url) return null
  const kind = sourceKindForUrl(url)

  if (kind === 'youtube') {
    const id = youTubeVideoId(url)
    const startSec = parseYouTubeTime(url.searchParams.get('t') || url.searchParams.get('start'))
    return { url: `https://www.youtube.com/watch?v=${id}`, kind, startSec }
  }

  if (kind === 'instagram') {
    const code = instagramShortcode(url)
    const type = url.pathname.match(/\/(reel|reels|tv)\//) ? 'reel' : 'p'
    if (code) return { url: `https://www.instagram.com/${type}/${code}/`, kind, startSec: null }
  }

  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key)
    }
  }
  let href = url.href
  if (url.pathname !== '/' && href.endsWith('/') && !url.search) href = href.slice(0, -1)
  return { url: href, kind, startSec: null }
}

/** First http(s) link in pasted text, or null. */
export function findUrlInText(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i)
  if (match) return match[0].replace(/[),.;!?]+$/, '')
  const bare = String(text || '').trim()
  return /^[\w-]+(\.[\w-]+)+\/\S*$/.test(bare) ? bare : null
}

export function sourceKindLabel(kind) {
  if (kind === 'youtube') return 'YouTube'
  if (kind === 'instagram') return 'Instagram'
  if (kind === 'article') return 'Artículo'
  return 'Enlace'
}

/** Title used when the page gave none. */
export function fallbackSourceTitle(kind, url) {
  if (kind === 'instagram') return 'Publicación de Instagram'
  if (kind === 'youtube') return 'Video de YouTube'
  const parsed = parseUrl(url)
  return parsed ? hostOf(parsed) : 'Enlace'
}

function cleanText(value, max = 300) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Stored shape. Unknown fields are dropped; `existing` supplies what the patch leaves out. */
export function normalizeSource(input = {}, existing = null) {
  const base = existing || {}
  const pick = (key) => (input[key] !== undefined ? input[key] : base[key])
  const kind = SOURCE_KINDS.includes(pick('kind')) ? pick('kind') : 'other'
  const status = SOURCE_STATUSES.includes(pick('status')) ? pick('status') : 'inbox'
  const url = String(pick('url') || '')
  const duration = Number(pick('durationSec'))
  const now = Date.now()
  return {
    id: String(pick('id') || ''),
    url,
    kind,
    title: cleanText(pick('title')) || fallbackSourceTitle(kind, url),
    author: cleanText(pick('author'), 160) || null,
    siteName: cleanText(pick('siteName'), 80) || null,
    thumbnail: pick('thumbnail') ? String(pick('thumbnail')) : null,
    thumbnailFile: pick('thumbnailFile') ? String(pick('thumbnailFile')) : null,
    durationSec: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    publishedAt: pick('publishedAt') ? String(pick('publishedAt')) : null,
    startSec:
      typeof pick('startSec') === 'number' && pick('startSec') >= 0 ? pick('startSec') : null,
    topicIds: Array.isArray(pick('topicIds')) ? [...new Set(pick('topicIds').filter(Boolean))] : [],
    status,
    snapshot: pick('snapshot') ?? null,
    // Notion sync cursor (pageId, ackedHash, conflict…), owned by notionSync.js.
    notion: pick('notion') ?? null,
    lastPositionSec:
      typeof pick('lastPositionSec') === 'number' && pick('lastPositionSec') >= 0
        ? pick('lastPositionSec')
        : null,
    lastOpenedAt: Number(pick('lastOpenedAt')) || null,
    // Last link check: { state: 'ok' | 'gone' | 'unknown', code, checkedAt }. Per computer.
    linkCheck: pick('linkCheck') ?? null,
    captures: Array.isArray(pick('captures'))
      ? pick('captures')
          .filter((item) => item && typeof item.file === 'string')
          .map((item) => ({ file: item.file, addedAt: Number(item.addedAt) || now }))
      : [],
    addedAt: Number(base.addedAt || input.addedAt) || now,
    updatedAt: now
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(text) {
  return String(text || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? '') : null
}

/**
 * Title, image, site, author and date from a page's <head>: Open Graph first,
 * then Twitter cards and plain tags. Relative image urls resolve against `baseUrl`.
 */
export function parseHtmlMeta(html, baseUrl = '') {
  const head = String(html || '').slice(0, 600_000)
  const meta = new Map()
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop') || '')
      .trim()
      .toLowerCase()
    const content = attr(tag, 'content')
    if (key && content && !meta.has(key)) meta.set(key, content.trim())
  }
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const first = (...keys) => keys.map((key) => meta.get(key)).find(Boolean) || null
  let image = first(
    'og:image:secure_url',
    'og:image',
    'og:image:url',
    'twitter:image',
    'twitter:image:src'
  )
  if (image && baseUrl) {
    try {
      image = new URL(image, baseUrl).href
    } catch {
      image = null
    }
  }
  return {
    title:
      first('og:title', 'twitter:title') ||
      (titleTag ? decodeEntities(titleTag[1]).replace(/\s+/g, ' ').trim() : null) ||
      null,
    image: image && /^https?:/i.test(image) ? image : null,
    siteName: first('og:site_name', 'application-name'),
    author: first('article:author', 'author', 'twitter:creator', 'parsely-author'),
    publishedAt: first('article:published_time', 'datepublished', 'date', 'pubdate'),
    description: first('og:description', 'description', 'twitter:description')
  }
}

const EMBED_HOSTS = new Set(['www.youtube-nocookie.com', 'www.instagram.com'])

/**
 * What the in-app viewer shows for a link, without any account.
 * `mode` is 'youtube' (embedded player), 'instagram' (public embed page),
 * 'page' (the live page), or 'none' (nothing can be shown without signing in).
 */
export function sourceViewer(source) {
  const url = String(source?.url || '')
  if (source?.kind === 'youtube') {
    const id = youTubeVideoId(url)
    if (id) {
      return {
        mode: 'youtube',
        src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`,
        referrer: 'https://www.youtube-nocookie.com/'
      }
    }
  }
  if (source?.kind === 'instagram') {
    const code = instagramShortcode(url)
    if (!code) return { mode: 'none', reason: 'story' }
    const type = /\/(reel|reels|tv)\//.test(url) ? 'reel' : 'p'
    return { mode: 'instagram', src: `https://www.instagram.com/${type}/${code}/embed/captioned/` }
  }
  if (/^https?:\/\//i.test(url)) return { mode: 'page', src: url }
  return { mode: 'none', reason: 'url' }
}

/** Partition of the opt-in Instagram session (Phase 2b). Kept apart from everything else. */
export const INSTAGRAM_PARTITION = 'persist:instagram'

/**
 * The viewer for an Instagram link when the person signed in to Instagram in the app:
 * the real post, reel, or story page in the Instagram session, or null for other links.
 */
export function instagramSessionViewer(source) {
  if (source?.kind !== 'instagram') return null
  let url
  try {
    url = new URL(String(source.url || ''))
  } catch {
    return null
  }
  if (!/(^|\.)instagram\.com$/.test(url.hostname)) return null
  return { mode: 'instagram-session', src: url.href, partition: INSTAGRAM_PARTITION }
}

/** Inside the Instagram session the viewer may move around instagram.com, never to a login page. */
export function instagramSessionMayLoad(target) {
  try {
    const url = new URL(String(target || ''))
    return url.protocol === 'https:' && /(^|\.)instagram\.com$/.test(url.hostname) && !isLoginUrl(target)
  } catch {
    return false
  }
}

/** True when an embedded page may load this url (the viewer's own hosts, or the link's own page). */
export function viewerMayLoad(target, sourceUrl) {
  let url
  try {
    url = new URL(String(target || ''))
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  // On Instagram only the public embed pages work without an account; the rest is a login wall.
  if (/(^|\.)instagram\.com$/.test(url.hostname)) return /\/embed(\/|$)/.test(url.pathname)
  if (EMBED_HOSTS.has(url.hostname)) return true
  try {
    return Boolean(sourceUrl) && new URL(sourceUrl).hostname === url.hostname
  } catch {
    return false
  }
}

/** A page that asks the visitor to sign in (Instagram, YouTube, Google). */
export function isLoginUrl(target) {
  try {
    const url = new URL(String(target || ''))
    return (
      (/(^|\.)instagram\.com$/.test(url.hostname) &&
        /^\/(accounts\/login|challenge)/.test(url.pathname)) ||
      url.hostname === 'accounts.google.com'
    )
  } catch {
    return false
  }
}

/**
 * Instagram's og:title reads `Name on Instagram: "caption"`, in the page's language
 * ("en Instagram", "auf Instagram"…). Split it into the account and a short title
 * taken from the caption before its hashtags.
 */
export function splitInstagramTitle(title) {
  const text = String(title || '').trim()
  const match = text.match(/^(.+?)\s+\S+\s+Instagram\s*:\s*["“]?([\s\S]*?)["”]?\s*$/i)
  if (!match) return { title: text || null }
  const author = match[1].trim()
  const caption = match[2]
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[\s.·•]+$/, '')
    .trim()
  const short = caption.length > 120 ? `${caption.slice(0, 119)}…` : caption
  return { author, title: short || `Publicación de ${author}` }
}

/**
 * What a link check found. Only 404 and 410 mean the page is gone; anything else (a timeout,
 * a 403 from a site that blocks scripts, a server error) says nothing about the page itself.
 */
export function linkCheckState(code) {
  if (code === 404 || code === 410) return 'gone'
  if (typeof code === 'number' && code >= 200 && code < 400) return 'ok'
  return 'unknown'
}

/**
 * A stable image address for an Instagram post or reel. Instagram answers it, without a login,
 * with a redirect to the current image, so unlike the page's own image links it does not expire.
 */
export function instagramThumbnailUrl(input) {
  const code = instagramShortcode(input)
  return code ? `https://www.instagram.com/p/${code}/media/?size=l` : null
}
