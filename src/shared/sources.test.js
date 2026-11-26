import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canonicalSourceUrl,
  findUrlInText,
  instagramShortcode,
  normalizeSource,
  parseHtmlMeta,
  parseYouTubeTime,
  sourceKindForUrl,
  youTubeVideoId
} from './sources.js'
import { findingsForSource, normalizeAnchor, projectFinding } from './knowledgeGraph.js'
import { anchorFromNotion, filePageMarker, noteAnchorsWire, notionPlace } from './notionSync.js'

describe('canonicalSourceUrl', () => {
  it('folds every YouTube link form into one url and keeps the start apart', () => {
    const forms = [
      'https://youtu.be/dQw4w9WgXcQ?si=abc&t=252',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4m12s&feature=share',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
      'youtube.com/watch?v=dQw4w9WgXcQ'
    ]
    for (const form of forms) {
      assert.equal(canonicalSourceUrl(form).url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      assert.equal(canonicalSourceUrl(form).kind, 'youtube')
    }
    assert.equal(canonicalSourceUrl(forms[0]).startSec, 252)
    assert.equal(canonicalSourceUrl(forms[1]).startSec, 252)
    assert.equal(canonicalSourceUrl(forms[2]).startSec, null)
  })

  it('reduces Instagram posts and reels to their code', () => {
    assert.deepEqual(canonicalSourceUrl('https://www.instagram.com/p/C1a2B3c4D5e/?igsh=xyz'), {
      url: 'https://www.instagram.com/p/C1a2B3c4D5e/',
      kind: 'instagram',
      startSec: null
    })
    assert.equal(
      canonicalSourceUrl('https://instagram.com/someone/reel/C9z8Y7x6W5v/').url,
      'https://www.instagram.com/reel/C9z8Y7x6W5v/'
    )
  })

  it('drops tracking parameters and the fragment from articles', () => {
    const result = canonicalSourceUrl(
      'https://Example.com/blog/post/?utm_source=x&utm_medium=y&id=7&fbclid=1#top'
    )
    assert.equal(result.url, 'https://example.com/blog/post/?id=7')
    assert.equal(result.kind, 'article')
    assert.equal(canonicalSourceUrl('https://example.com/a/').url, 'https://example.com/a')
  })

  it('rejects things that are not web links', () => {
    assert.equal(canonicalSourceUrl('javascript:alert(1)'), null)
    assert.equal(canonicalSourceUrl('file:///etc/passwd'), null)
    assert.equal(canonicalSourceUrl('hola'), null)
    assert.equal(canonicalSourceUrl(''), null)
  })
})

describe('link helpers', () => {
  it('reads YouTube times', () => {
    assert.equal(parseYouTubeTime('90'), 90)
    assert.equal(parseYouTubeTime('1h2m3s'), 3723)
    assert.equal(parseYouTubeTime('abc'), null)
  })

  it('finds ids and kinds', () => {
    assert.equal(youTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
    assert.equal(youTubeVideoId('https://www.youtube.com/@channel'), null)
    assert.equal(instagramShortcode('https://www.instagram.com/explore/'), null)
    assert.equal(sourceKindForUrl('https://www.youtube.com/@channel'), 'other')
    assert.equal(sourceKindForUrl('https://www.instagram.com/someone/'), 'instagram')
  })

  it('pulls the first link out of pasted text', () => {
    assert.equal(
      findUrlInText('mira esto: https://example.com/a?b=1). genial'),
      'https://example.com/a?b=1'
    )
    assert.equal(findUrlInText('sin enlace'), null)
  })
})

describe('parseHtmlMeta', () => {
  it('prefers Open Graph and resolves relative images', () => {
    const html = `<html><head>
      <title>Plain &amp; title</title>
      <meta property="og:title" content="Rim light &#8212; a breakdown">
      <meta content="/img/cover.jpg" property="og:image" />
      <meta name="author" content='Ana Pérez'>
      <meta property="og:site_name" content="Blog">
      <meta property="article:published_time" content="2026-10-01T10:00:00Z">
    </head></html>`
    const meta = parseHtmlMeta(html, 'https://example.com/post/1')
    assert.equal(meta.title, 'Rim light — a breakdown')
    assert.equal(meta.image, 'https://example.com/img/cover.jpg')
    assert.equal(meta.author, 'Ana Pérez')
    assert.equal(meta.siteName, 'Blog')
    assert.equal(meta.publishedAt, '2026-10-01T10:00:00Z')
  })

  it('falls back to <title> and ignores non-web images', () => {
    const meta = parseHtmlMeta(
      '<title> Only  title </title><meta property="og:image" content="data:image/png;base64,AA">'
    )
    assert.equal(meta.title, 'Only title')
    assert.equal(meta.image, null)
  })
})

describe('normalizeSource', () => {
  it('fills a title, keeps known kinds and statuses, and keeps addedAt on update', () => {
    const first = normalizeSource({
      id: 'a',
      url: 'https://www.instagram.com/p/X/',
      kind: 'instagram'
    })
    assert.equal(first.title, 'Publicación de Instagram')
    assert.equal(first.status, 'inbox')
    const next = normalizeSource({ status: 'kept', kind: 'nope' }, first)
    assert.equal(next.status, 'kept')
    assert.equal(next.kind, 'other')
    assert.equal(next.addedAt, first.addedAt)
    assert.equal(next.url, first.url)
  })
})

describe('source anchors', () => {
  const finding = {
    id: 'f1',
    body: 'nota',
    topicIds: [],
    anchors: [
      normalizeAnchor({ sourceId: 's1', sourceTitle: 'Video', coursePath: 'X', timeSec: 12 })
    ]
  }

  it('drop course fields and keep the time', () => {
    assert.deepEqual(finding.anchors[0], {
      coursePath: null,
      lessonRelativePath: null,
      lessonTitle: null,
      timeSec: 12,
      projectId: null,
      projectTitle: null,
      sourceId: 's1',
      sourceTitle: 'Video'
    })
  })

  it('leave lesson anchors with their old shape', () => {
    assert.equal('sourceId' in normalizeAnchor({ lessonRelativePath: 'a.mp4' }, 'C'), false)
    assert.equal('sourceId' in noteAnchorsWire([{ coursePath: 'C' }])[0], false)
  })

  it('show up in source and flat note lists', () => {
    assert.equal(projectFinding(finding).sourceId, 's1')
    const [item] = findingsForSource([finding, { id: 'f2', anchors: [] }], 's1')
    assert.equal(item.id, 'f1')
    assert.equal(item.timeSec, 12)
    assert.equal(findingsForSource([finding], 'other').length, 0)
  })

  it('round-trip through the Notion place', () => {
    const place = notionPlace(finding)
    assert.equal(place.courseTitle, 'Fuentes')
    assert.equal(place.fileTitle, 'Video')
    const anchor = anchorFromNotion({
      courseMarker: `node:${place.courseKey}`,
      fileMarker: filePageMarker(place),
      fileTitle: 'Video',
      timeSec: 12
    })
    assert.equal(anchor.sourceId, 's1')
    assert.equal(anchor.sourceTitle, 'Video')
    assert.equal(anchor.coursePath, null)
    assert.equal(anchor.timeSec, 12)
  })
})
