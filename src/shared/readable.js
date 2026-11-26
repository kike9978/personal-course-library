/**
 * Readable copy of an article (Fuentes, Phase 3). `READABLE_SCRIPT` runs inside the page;
 * the helpers here clean and size what it returns. Text only: images and embeds are left out,
 * so a saved copy never loads anything from the network when it is read.
 */

export const READABLE_LIMIT = 200_000

/**
 * Runs in the article's own page. Removes chrome (menus, footers, forms, embeds), picks the
 * container with the most paragraph text, and returns its headings, paragraphs, list items,
 * quotes and code as plain-text blocks.
 */
export const READABLE_SCRIPT = `(() => {
  const root = document.cloneNode(true)
  root.querySelectorAll([
    'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed',
    'nav', 'header', 'footer', 'aside', 'form', 'button', 'dialog',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
    '[aria-hidden="true"]', '[hidden]',
    '.share', '.social', '.newsletter', '.related', '.comments', '#comments', '.advert', '.ad'
  ].join(',')).forEach((node) => node.remove())
  const textOf = (node) => (node.textContent || '').replace(/\\s+/g, ' ').trim()
  const score = (node) =>
    [...node.querySelectorAll('p')].reduce((sum, p) => sum + textOf(p).length, 0)
  const candidates = [
    ...root.querySelectorAll('article, main, [role="main"], [itemprop="articleBody"], .post-content, .entry-content, .article-body, #content')
  ]
  let best = root.body || root.documentElement
  let bestScore = score(best) * 0.6
  for (const node of candidates) {
    const value = score(node)
    if (value > bestScore) { best = node; bestScore = value }
  }
  const blocks = []
  const seen = new Set()
  for (const node of best.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre')) {
    if (node.closest('li, blockquote, pre') && node.closest('li, blockquote, pre') !== node) continue
    const text = node.tagName === 'PRE' ? (node.textContent || '').trim() : textOf(node)
    if (!text || seen.has(text)) continue
    seen.add(text)
    const tag = node.tagName.toLowerCase()
    const type = /^h[1-4]$/.test(tag) ? 'heading' : tag === 'li' ? 'item' : tag === 'blockquote' ? 'quote' : tag === 'pre' ? 'code' : 'paragraph'
    blocks.push({ type, level: type === 'heading' ? Number(tag[1]) : undefined, text })
  }
  const meta = (name) => document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]')?.getAttribute('content') || ''
  return {
    title: meta('og:title') || document.title || '',
    byline: meta('author') || meta('article:author') || '',
    lang: document.documentElement.lang || '',
    blocks
  }
})()`

const TYPES = new Set(['heading', 'paragraph', 'item', 'quote', 'code'])

/**
 * Clean what the page returned: known block types only, trimmed text, short boilerplate lines
 * dropped, capped at READABLE_LIMIT characters. Null when nothing readable is left.
 */
export function cleanReadable(raw, { url = '', capturedAt = Date.now() } = {}) {
  if (!raw || !Array.isArray(raw.blocks)) return null
  const blocks = []
  let size = 0
  for (const block of raw.blocks) {
    if (!block || !TYPES.has(block.type)) continue
    const text = String(block.text || '').trim()
    if (!text) continue
    // One- or two-word paragraphs are usually labels ("Share", "Advertisement").
    if (block.type === 'paragraph' && text.split(/\s+/).length < 3 && !/[.!?:]$/.test(text))
      continue
    if (size + text.length > READABLE_LIMIT) break
    size += text.length
    const level = Number(block.level)
    blocks.push(
      block.type === 'heading'
        ? { type: 'heading', level: level >= 1 && level <= 4 ? level : 2, text }
        : { type: block.type, text }
    )
  }
  const words = blocks.reduce((sum, block) => sum + block.text.split(/\s+/).length, 0)
  if (words < 40) return null
  return {
    url: String(url || ''),
    title: String(raw.title || '')
      .trim()
      .slice(0, 300),
    byline: String(raw.byline || '')
      .trim()
      .slice(0, 160),
    lang: String(raw.lang || '').slice(0, 20),
    capturedAt,
    wordCount: words,
    blocks
  }
}
