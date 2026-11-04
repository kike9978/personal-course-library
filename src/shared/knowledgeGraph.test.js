import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hashtagTitlesFromBody,
  buildGlobalGraph,
  clampDepth,
  clampLabelZoom,
  clampLinkDistance,
  findingFromLegacyNote,
  findingsForCourse,
  groupFindingsByTopic,
  parseMentions,
  backlinksTo,
  visibleGraph
} from './knowledgeGraph.js'

describe('knowledge graph', () => {
  it('reads topic mentions from a note body', () => {
    const mentions = parseMentions(
      'See [[topic|Appeal|topic-1]] and @[lesson|Intro](01.mp4) and [[note|Other|n2]]'
    )
    assert.equal(mentions.length, 3)
    assert.equal(mentions[0].type, 'topic')
    assert.equal(mentions[0].id, 'topic-1')
    assert.equal(mentions[2].type, 'note')
    assert.equal(mentions[2].id, 'n2')
    assert.deepEqual(hashtagTitlesFromBody('Idea #appeal and #appeal again\n# Heading\n`#skip`'), [
      'appeal'
    ])
  })

  it('turns a course note into a finding with one anchor', () => {
    const finding = findingFromLegacyNote(
      {
        id: 'n1',
        title: 'Appeal',
        body: 'Same idea @[topic|Appeal](topic-1)',
        lessonRelativePath: '01.mp4',
        lessonTitle: 'Intro',
        timeSec: 12,
        createdAt: 10,
        updatedAt: 11
      },
      'course-a'
    )
    assert.equal(finding.anchors.length, 1)
    assert.equal(finding.anchors[0].coursePath, 'course-a')
    assert.equal(finding.anchors[0].timeSec, 12)
    assert.deepEqual(finding.topicIds, ['topic-1'])
  })

  it('lists a finding under every course it is anchored to', () => {
    const findings = [
      {
        id: 'f1',
        title: 'Appeal',
        body: '',
        topicIds: ['topic-1'],
        anchors: [
          { coursePath: 'course-a', lessonRelativePath: '01.mp4', timeSec: 4 },
          { coursePath: 'course-b', projectId: 'p1', projectTitle: 'Final' }
        ]
      }
    ]
    const inA = findingsForCourse(findings, 'course-a')
    const inB = findingsForCourse(findings, 'course-b')
    assert.equal(inA.length, 1)
    assert.equal(inA[0].timeSec, 4)
    assert.equal(inB[0].projectId, 'p1')
    assert.equal(inB[0].timeSec, null)
  })

  it('groups overlapping topics across courses and hides single-course ones', () => {
    const topics = [
      { id: 'appeal', title: 'Appeal' },
      { id: 'local', title: 'Solo aquí' }
    ]
    const findings = [
      {
        id: 'a',
        title: 'From A',
        topicIds: ['appeal'],
        anchors: [{ coursePath: 'course-a' }]
      },
      {
        id: 'b',
        title: 'From B',
        topicIds: ['appeal', 'local'],
        anchors: [{ coursePath: 'course-b' }]
      }
    ]
    const overlap = groupFindingsByTopic(findings, topics, { overlapOnly: true })
    assert.equal(overlap.length, 1)
    assert.equal(overlap[0].title, 'Appeal')
    assert.equal(overlap[0].courseCount, 2)
    assert.equal(overlap[0].items.length, 2)
    const linked = backlinksTo(
      { id: 'a' },
      [
        { id: 'a', body: '' },
        { id: 'b', body: 'See [[note|From A|a]]', topicIds: ['appeal'] },
        { id: 'c', body: 'Same tag only', topicIds: ['appeal'] }
      ]
    )
    assert.deepEqual(linked.map((item) => item.id), ['b'])
  })

  it('draws a link from a note to the note it mentions', () => {
    const graph = buildGlobalGraph({
      viewMode: 'topics',
      topics: [
        { id: 'test', title: 'test' },
        { id: 'appeal', title: 'appeal' }
      ],
      findings: [
        { id: 'n2', title: 'test note 2', topicIds: ['test'], body: 'See [[note|adios|adios]]' },
        { id: 'adios', title: 'adios', topicIds: ['appeal'], body: '' }
      ]
    })
    const link = graph.edges.find((edge) => edge.edgeType === 'link')
    assert.equal(link.source, 'finding:n2')
    assert.equal(link.target, 'finding:adios')
  })

  it('builds a topics graph of tags and the notes that use them', () => {
    const graph = buildGlobalGraph({
      viewMode: 'topics',
      topics: [
        { id: 'appeal', title: 'Appeal' },
        { id: 'unused', title: 'Unused' }
      ],
      findings: [
        {
          id: 'a',
          title: 'From A',
          topicIds: ['appeal'],
          anchors: [{ coursePath: 'course-a', lessonRelativePath: '01.mp4' }]
        },
        {
          id: 'b',
          title: 'From B',
          topicIds: ['appeal'],
          anchors: [{ coursePath: 'course-a', lessonRelativePath: '01.mp4' }]
        },
        {
          id: 'plain',
          title: 'No topic',
          topicIds: [],
          anchors: [{ coursePath: 'course-a' }]
        }
      ]
    })
    assert.deepEqual(graph.nodes.map((node) => node.id).sort(), [
      'course:course-a',
      'file:lesson:course-a:01.mp4',
      'finding:a',
      'finding:b',
      'finding:plain',
      'topic:appeal'
    ])
    assert.equal(graph.nodes.find((node) => node.id === 'finding:plain').data.orphan, true)
    assert.equal(graph.nodes.find((node) => node.id === 'finding:a').data.orphan, undefined)
    const topicEdge = graph.edges.find((edge) => edge.edgeType === 'topic' && edge.source === 'finding:a')
    assert.equal(topicEdge.target, 'topic:appeal')
    assert.equal(topicEdge.label, '')
    const fileNode = graph.nodes.find((node) => node.data.kind === 'file')
    assert.equal(fileNode.data.fullLabel, '01.mp4')
    const fileEdges = graph.edges.filter((edge) => edge.edgeType === 'file')
    assert.equal(fileEdges.length, 2)
    assert.deepEqual(fileEdges.map((edge) => edge.source).sort(), ['finding:a', 'finding:b'])
    const courseEdges = graph.edges.filter((edge) => edge.edgeType === 'course')
    assert.deepEqual(courseEdges.map((edge) => edge.source).sort(), ['finding:a', 'finding:b', 'finding:plain'])
    assert.equal(courseEdges[0].target, 'course:course-a')
    assert.equal(graph.edges.some((edge) => edge.edgeType === 'same-file'), false)
    const overview = visibleGraph({ ...graph, viewMode: 'topics' })
    assert.equal(overview.highlightIds, null)
    const focused = visibleGraph({ ...graph, selectedId: 'topic:appeal', depth: 1, viewMode: 'topics' })
    assert.deepEqual(focused.highlightIds.sort(), ['finding:a', 'finding:b', 'topic:appeal'])
  })

  it('keeps a note with no tag an orphan even when it shares a course or file', () => {
    const graph = buildGlobalGraph({
      viewMode: 'topics',
      topics: [{ id: 'appeal', title: 'Appeal' }],
      findings: [
        { id: 'tagged', title: 'Tagged', topicIds: ['appeal'], anchors: [{ coursePath: 'course-a' }] },
        {
          id: 'shared-file',
          title: 'Shared file',
          topicIds: [],
          anchors: [{ coursePath: 'course-a', lessonRelativePath: '01.mp4' }]
        },
        {
          id: 'also-file',
          title: 'Also file',
          topicIds: [],
          anchors: [{ coursePath: 'course-a', lessonRelativePath: '01.mp4' }]
        },
        {
          id: 'loose',
          title: 'Loose',
          topicIds: [],
          anchors: [{ coursePath: 'course-b', lessonRelativePath: '09.mp4' }]
        },
        { id: 'empty', title: 'Empty', topicIds: [] }
      ]
    })
    const tagged = graph.nodes.find((node) => node.id === 'finding:tagged')
    const shared = graph.nodes.find((node) => node.id === 'finding:shared-file')
    const loose = graph.nodes.find((node) => node.id === 'finding:loose')
    const empty = graph.nodes.find((node) => node.id === 'finding:empty')
    assert.equal(shared.data.orphan, true)
    assert.equal(graph.nodes.find((node) => node.id === 'finding:also-file').data.orphan, true)
    assert.equal(tagged.data.orphan, undefined)
    assert.equal(loose.data.orphan, true)
    assert.equal(empty.data.orphan, true)
    assert.ok(Math.hypot(loose.x, loose.y) > Math.hypot(tagged.x, tagged.y))
    assert.ok(Math.hypot(shared.x, shared.y) < Math.hypot(loose.x, loose.y))
    assert.ok(graph.edges.some((edge) => edge.source === 'finding:loose' && edge.target === 'course:course-b'))
    assert.equal(graph.edges.some((edge) => edge.source === 'finding:empty' || edge.target === 'finding:empty'), false)
  })

  it('highlights a budget of notes around a selected tag and keeps the rest on screen', () => {
    const findings = Array.from({ length: 25 }, (_, index) => ({
      id: `f${String(index + 1).padStart(2, '0')}`,
      title: `Note ${index + 1}`,
      topicIds: ['appeal'],
      anchors: [{ coursePath: 'course-a', lessonRelativePath: `${index}.mp4` }]
    }))
    const graph = buildGlobalGraph({
      viewMode: 'topics',
      topics: [{ id: 'appeal', title: 'Appeal' }],
      findings
    })
    const focused = visibleGraph({ ...graph, selectedId: 'topic:appeal', depth: 1, viewMode: 'topics' })
    assert.equal(focused.truncated, true)
    assert.equal(focused.highlightIds.length, 25)
    assert.equal(focused.highlightIds.includes('finding:f25'), false)
    assert.equal(focused.highlightIds.includes('finding:f24'), true)
  })

  it('connects notes on the same lesson through a file node', () => {
    const graph = buildGlobalGraph({
      viewMode: 'topics',
      topics: [
        { id: 'appeal', title: 'Appeal' },
        { id: 'other', title: 'Other' }
      ],
      findings: [
        {
          id: 'a',
          title: 'A',
          topicIds: ['appeal'],
          anchors: [{ coursePath: 'course-a', lessonRelativePath: '01.mp4' }]
        },
        {
          id: 'b',
          title: 'B',
          topicIds: ['appeal'],
          anchors: [{ coursePath: 'course-b', lessonRelativePath: '02.mp4' }]
        },
        {
          id: 'c',
          title: 'C',
          topicIds: ['other'],
          anchors: [{ coursePath: 'course-a', lessonRelativePath: '01.mp4' }]
        }
      ]
    })
    const near = visibleGraph({ ...graph, selectedId: 'finding:a', depth: 1, viewMode: 'topics' })
    assert.deepEqual(near.highlightIds.sort(), [
      'course:course-a',
      'file:lesson:course-a:01.mp4',
      'finding:a',
      'topic:appeal'
    ])
    const far = visibleGraph({ ...graph, selectedId: 'finding:a', depth: 2, viewMode: 'topics' })
    assert.equal(far.highlightIds.includes('finding:b'), true)
    assert.equal(far.highlightIds.includes('finding:c'), true)
  })

  it('labels a course node with the course title, not the folder path', () => {
    const folder = 'Rad How To Class - Concept Art and World Building for Animation'
    const graph = buildGlobalGraph({
      viewMode: 'courses',
      findings: [
        {
          id: 'a',
          title: 'Red',
          topicIds: ['appeal'],
          anchors: [{ coursePath: `E:/Courses/${folder}` }]
        }
      ],
      topics: [{ id: 'appeal', title: 'Appeal' }],
      courseTitles: { [folder]: 'Concept Art and World Building for Animation' }
    })
    const course = graph.nodes.find((node) => node.data.kind === 'course')
    assert.equal(course.data.fullLabel, 'Concept Art and World Building for Animation')
    assert.equal(graph.nodes.length, 1)
    assert.equal(graph.edges.length, 0)
  })

  it('links courses that share a topic and parks the others farther out', () => {
    const graph = buildGlobalGraph({
      viewMode: 'courses',
      topics: [
        { id: 'appeal', title: 'Appeal' },
        { id: 'color', title: 'Color' }
      ],
      courseTitles: { 'course-a': 'Course A', 'course-b': 'Course B', 'course-c': 'Course C' },
      findings: [
        {
          id: 'shared',
          title: 'Shared',
          topicIds: ['appeal', 'color'],
          anchors: [{ coursePath: 'course-a' }, { coursePath: 'course-b' }]
        },
        {
          id: 'solo',
          title: 'Solo',
          topicIds: ['appeal'],
          anchors: [{ coursePath: 'course-c' }]
        }
      ]
    })
    assert.deepEqual(graph.nodes.map((node) => node.id).sort(), [
      'course:course-a',
      'course:course-b',
      'course:course-c'
    ])
    assert.equal(graph.edges.length, 1)
    assert.equal(graph.edges[0].edgeType, 'shared-topic')
    assert.equal(graph.edges[0].label, '2 temas')
    const linked = graph.nodes.find((node) => node.id === 'course:course-a')
    const loose = graph.nodes.find((node) => node.id === 'course:course-c')
    assert.ok(Math.hypot(loose.x, loose.y) > Math.hypot(linked.x, linked.y))
    const highlight = visibleGraph({ ...graph, selectedId: 'course:course-a', depth: 1, viewMode: 'courses' })
    assert.deepEqual(highlight.highlightIds.sort(), ['course:course-a', 'course:course-b'])
  })

  it('names a course link after the single shared topic', () => {
    const graph = buildGlobalGraph({
      viewMode: 'courses',
      topics: [{ id: 'appeal', title: 'Appeal' }],
      findings: [
        {
          id: 'shared',
          title: 'Shared',
          topicIds: ['appeal'],
          anchors: [{ coursePath: 'course-a' }, { coursePath: 'course-b' }]
        }
      ]
    })
    assert.equal(graph.edges[0].label, 'Appeal')
    assert.equal(graph.edges[0].edgeType, 'shared-topic')
  })

  it('clamps depth and link distance', () => {
    assert.equal(clampDepth(0), 1)
    assert.equal(clampDepth(9), 5)
    assert.equal(clampDepth('3'), 3)
    assert.equal(clampLinkDistance(1), 36)
    assert.equal(clampLinkDistance(400), 180)
    assert.equal(clampLinkDistance('nope'), 72)
    assert.equal(clampLabelZoom(0), 0.35)
    assert.equal(clampLabelZoom(9), 2.4)
    assert.equal(clampLabelZoom('1.2'), 1.2)
    assert.equal(clampLabelZoom('nope'), 1.15)
  })

})
