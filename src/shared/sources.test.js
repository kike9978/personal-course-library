import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canonicalSourceUrl,
  findUrlInText,
  instagramShortcode,
  normalizeSource,
  parseHtmlMeta,
  parseYouTubeTime,
  isLoginUrl,
  instagramSessionMayLoad,
  instagramSessionViewer,
  INSTAGRAM_PARTITION,
  sourceKindForUrl,
  sourceViewer,
  splitInstagramTitle,
  viewerMayLoad,
  youTubeVideoId
} from './sources.js'
import {
  buildGlobalGraph,
  findingsForSource,
  normalizeAnchor,
  projectFinding
} from './knowledgeGraph.js'
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

describe('sourceViewer', () => {
  it('uses the no-cookie YouTube player with a referrer', () => {
    const plan = sourceViewer({
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    })
    assert.equal(plan.mode, 'youtube')
    assert.equal(plan.src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), true)
    assert.equal(plan.referrer, 'https://www.youtube-nocookie.com/')
  })

  it('uses the public embed for posts and reels, and nothing for stories', () => {
    assert.equal(
      sourceViewer({ kind: 'instagram', url: 'https://www.instagram.com/reel/C08-b3uM0U9/' }).src,
      'https://www.instagram.com/reel/C08-b3uM0U9/embed/captioned/'
    )
    assert.equal(
      sourceViewer({ kind: 'instagram', url: 'https://www.instagram.com/stories/someone/123/' })
        .mode,
      'none'
    )
    assert.equal(sourceViewer({ kind: 'article', url: 'https://example.com/a' }).mode, 'page')
  })

  it('keeps embedded pages on their own site and spots login pages', () => {
    assert.equal(viewerMayLoad('https://www.instagram.com/p/x/embed/', ''), true)
    // "Watch on Instagram" leaves the embed for the full page, which needs a login.
    assert.equal(
      viewerMayLoad('https://www.instagram.com/reel/x/', 'https://www.instagram.com/reel/x/'),
      false
    )
    assert.equal(viewerMayLoad('https://example.com/b', 'https://example.com/a'), true)
    assert.equal(viewerMayLoad('https://evil.test/', 'https://example.com/a'), false)
    assert.equal(viewerMayLoad('file:///etc/passwd', 'https://example.com/a'), false)
    assert.equal(isLoginUrl('https://www.instagram.com/accounts/login/?next=/p/x/'), true)
    assert.equal(isLoginUrl('https://accounts.google.com/ServiceLogin'), true)
    assert.equal(isLoginUrl('https://www.instagram.com/p/x/'), false)
  })
})

describe('graph', () => {
  it('draws a saved link as the place of its notes', () => {
    const graph = buildGlobalGraph({
      findings: [
        {
          id: 'n1',
          body: 'x',
          topicIds: [],
          anchors: [normalizeAnchor({ sourceId: 's1', sourceTitle: 'Video', timeSec: 3 })]
        }
      ]
    })
    const node = graph.nodes.find((item) => item.data.sourceId === 's1')
    assert.equal(node.data.kind, 'file')
    assert.equal(node.data.label, 'Video')
    assert.equal(
      graph.edges.some((edge) => edge.source === 'finding:n1' && edge.target === node.id),
      true
    )
    assert.equal(
      graph.nodes.some((item) => item.data.kind === 'course'),
      false
    )
  })
})

describe('splitInstagramTitle', () => {
  it('reads the account and caption in any language', () => {
    assert.deepEqual(
      splitInstagramTitle(
        'Travel | Venezia | Venice en Instagram: "Top 5 most viewed videos in 2023 ♥ Follow @improntavenezia . . #venezia #venice"'
      ),
      {
        author: 'Travel | Venezia | Venice',
        title: 'Top 5 most viewed videos in 2023 ♥ Follow @improntavenezia'
      }
    )
    assert.deepEqual(splitInstagramTitle('NASA on Instagram: "#space"'), {
      author: 'NASA',
      title: 'Publicación de NASA'
    })
    assert.deepEqual(splitInstagramTitle('Just a title'), { title: 'Just a title' })
  })
})

describe('Notion wire for links', async () => {
  const { sourceFromRow, sourceWire, sourceWireHash, wireHash } = await import('./notionSync.js')
  const source = {
    id: 's1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    kind: 'youtube',
    title: 'Video',
    author: 'Rick',
    siteName: 'YouTube',
    status: 'kept',
    topicIds: ['b', 'a'],
    startSec: 42,
    lastPositionSec: 100,
    thumbnailFile: 'x.jpg',
    captures: [{ file: 'c.png' }]
  }

  it('leaves out per-computer fields', () => {
    const local = sourceWireHash(wireHash, source)
    const moved = sourceWireHash(wireHash, {
      ...source,
      lastPositionSec: 5,
      thumbnailFile: null,
      captures: []
    })
    assert.equal(local, moved)
    assert.equal(JSON.parse(sourceWire(source).body).topicIds.join(), 'a,b')
  })

  it('reads a row back to the same hash', () => {
    const wire = sourceWire(source)
    const row = {
      title: wire.title,
      body: wire.body,
      url: wire.url,
      status: wire.status,
      topicIds: ['a', 'b']
    }
    assert.equal(sourceWireHash(wireHash, sourceFromRow(row)), sourceWireHash(wireHash, source))
  })

  it('lets the Status and URL columns win over the body', () => {
    const wire = sourceWire(source)
    const shape = sourceFromRow({
      title: 'Nuevo',
      body: wire.body,
      url: 'https://example.com/a',
      status: 'archived'
    })
    assert.equal(shape.url, 'https://example.com/a')
    assert.equal(shape.status, 'archived')
    assert.equal(shape.title, 'Nuevo')
  })

  it('accepts a row typed in Notion with only a URL', () => {
    const shape = sourceFromRow({ title: '', body: '', url: 'https://example.com/x' })
    assert.equal(shape.url, 'https://example.com/x')
    assert.equal(shape.status, 'inbox')
    assert.equal(sourceFromRow({ title: 'x', body: '' }), null)
  })
})

describe('opt-in Instagram session', () => {
  it('shows the real page for posts, reels and stories, only for Instagram links', () => {
    const reel = instagramSessionViewer({
      kind: 'instagram',
      url: 'https://www.instagram.com/reel/DfTDB71oXxu/'
    })
    assert.equal(reel.mode, 'instagram-session')
    assert.equal(reel.src, 'https://www.instagram.com/reel/DfTDB71oXxu/')
    assert.equal(reel.partition, INSTAGRAM_PARTITION)
    assert.equal(
      instagramSessionViewer({ kind: 'instagram', url: 'https://www.instagram.com/stories/a/1/' })
        .mode,
      'instagram-session'
    )
    assert.equal(instagramSessionViewer({ kind: 'youtube', url: 'https://youtu.be/x' }), null)
    assert.equal(instagramSessionViewer({ kind: 'instagram', url: 'https://evil.test/p/x/' }), null)
  })

  it('stays on instagram.com and never shows a login form', () => {
    assert.equal(instagramSessionMayLoad('https://www.instagram.com/reel/x/'), true)
    assert.equal(instagramSessionMayLoad('https://www.instagram.com/accounts/login/'), false)
    assert.equal(instagramSessionMayLoad('https://facebook.com/'), false)
    assert.equal(instagramSessionMayLoad('http://www.instagram.com/reel/x/'), false)
  })
})

describe('Phase 3 helpers', async () => {
  const { cleanReadable } = await import('./readable.js')
  const { cueIndexAt, parseJson3, pickCaptionTrack, timedtextInfo } = await import('./captions.js')
  const { linkCheckState } = await import('./sources.js')
  const words = (n) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')

  it('keeps readable blocks and drops labels', () => {
    const copy = cleanReadable(
      {
        title: 'Artículo',
        blocks: [
          { type: 'heading', level: 1, text: 'Título' },
          { type: 'paragraph', text: 'Compartir' },
          { type: 'paragraph', text: words(50) + '.' },
          { type: 'script', text: 'alert(1)' },
          { type: 'item', text: 'Un punto de la lista' }
        ]
      },
      { url: 'https://example.com/a', capturedAt: 1 }
    )
    assert.deepEqual(
      copy.blocks.map((block) => block.type),
      ['heading', 'paragraph', 'item']
    )
    assert.equal(copy.capturedAt, 1)
    assert.equal(cleanReadable({ blocks: [{ type: 'paragraph', text: 'Muy corto aquí.' }] }), null)
  })

  it('reads json3 captions, merging word-by-word events', () => {
    const cues = parseJson3(
      JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hola' }, { utf8: ' mundo' }] },
          { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'qué tal' }] },
          { tStartMs: 1500, segs: [{ utf8: '\n' }] },
          { tStartMs: 2000, dDurationMs: 500, segs: [{ utf8: 'Segunda' }] }
        ]
      })
    )
    assert.deepEqual(cues, [
      { start: 0, end: 1.5, text: 'Hola mundo qué tal' },
      { start: 2, end: 2.5, text: 'Segunda' }
    ])
    assert.equal(cueIndexAt(cues, 1.9), 0)
    assert.equal(cueIndexAt(cues, 2.1), 1)
    assert.equal(cueIndexAt(cues, -1), -1)
    assert.deepEqual(parseJson3('not json'), [])
  })

  it('reads timedtext urls and picks a track', () => {
    assert.deepEqual(
      timedtextInfo(
        'https://www.youtube-nocookie.com/api/timedtext?v=abc&lang=en&kind=asr&fmt=json3'
      ),
      { videoId: 'abc', lang: 'en', auto: true }
    )
    assert.equal(timedtextInfo('https://www.youtube-nocookie.com/embed/abc'), null)
    assert.equal(
      timedtextInfo('https://www.youtube-nocookie.com/api/timedtext?v=abc&lang=es&caps=asr').auto,
      false
    )
    const tracks = [
      { languageCode: 'en', kind: 'asr' },
      { languageCode: 'en', kind: '' },
      { languageCode: 'es-419', kind: '' }
    ]
    assert.equal(pickCaptionTrack(tracks).languageCode, 'es-419')
    assert.equal(pickCaptionTrack(tracks.slice(0, 2)).kind, '')
    assert.equal(pickCaptionTrack([]), null)
  })

  it('only calls 404 and 410 gone', () => {
    assert.equal(linkCheckState(404), 'gone')
    assert.equal(linkCheckState(410), 'gone')
    assert.equal(linkCheckState(200), 'ok')
    assert.equal(linkCheckState(301), 'ok')
    assert.equal(linkCheckState(403), 'unknown')
    assert.equal(linkCheckState(null), 'unknown')
  })
})
