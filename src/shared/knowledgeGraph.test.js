import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildLocalGraph,
  findingFromLegacyNote,
  findingsForCourse,
  groupFindingsByTopic,
  parseMentions,
  relatedFindings
} from './knowledgeGraph.js'

describe('knowledge graph', () => {
  it('reads topic mentions from a note body', () => {
    const mentions = parseMentions('See @[topic|Appeal](topic-1) and @[lesson|Intro](01.mp4)')
    assert.equal(mentions.length, 2)
    assert.equal(mentions[0].type, 'topic')
    assert.equal(mentions[0].id, 'topic-1')
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
    const related = relatedFindings(findings[0], findings, topics)
    assert.equal(related.length, 1)
    assert.equal(related[0].finding.id, 'b')
  })

  it('centers the local graph on a shared topic', () => {
    const topics = [{ id: 'appeal', title: 'Appeal' }]
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
        topicIds: ['appeal'],
        anchors: [{ coursePath: 'course-b' }]
      }
    ]
    const graph = buildLocalGraph({
      focusType: 'topic',
      focusId: 'appeal',
      findings,
      topics,
      courseTitles: { 'course-a': 'Course A', 'course-b': 'Course B' },
      depth: 2
    })
    const ids = graph.nodes.map((node) => node.id).sort()
    assert.deepEqual(ids, [
      'course:course-a',
      'course:course-b',
      'finding:a',
      'finding:b',
      'topic:appeal'
    ])
    assert.equal(graph.edges.length, 4)
  })
})
