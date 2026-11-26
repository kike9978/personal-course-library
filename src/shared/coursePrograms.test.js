import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildProgramsBrief,
  coursesForProgramBatch,
  defaultPicks,
  fileHints,
  mergePrograms,
  parseProgramsReply,
  pickKey,
  programKey,
  programVocabulary
} from './coursePrograms.js'

const blender = {
  path: 'School - Grease Pencil',
  title: 'Grease Pencil in Blender',
  institution: 'School',
  programs: [],
  theme: ['Animation'],
  learning: { notes: 'SECRET_NOTE_BODY' },
  description: { summary: 'Draw in 3D space with Grease Pencil.', outcomes: ['Rig a 2D character'] }
}
const comp = {
  path: 'Studio - Compositing',
  title: 'Compositing',
  programs: ['Cinema4D']
}

const outline = {
  sections: [
    {
      title: 'Setup',
      lessons: [
        { title: 'Interface', resources: [{ name: 'scene.blend' }, { name: 'intro.srt' }] }
      ],
      resources: [{ name: 'brushes.zip' }]
    }
  ],
  courseResources: [{ name: 'final.blend' }, { name: 'notes.pdf' }]
}

describe('programKey', () => {
  it('treats spacing and case as the same program', () => {
    assert.equal(programKey('Cinema 4D'), programKey('cinema4d'))
    assert.equal(programKey('After-Effects'), programKey('after effects'))
    assert.notEqual(programKey('C#'), programKey('C'))
  })
})

describe('programVocabulary', () => {
  it('orders by use and keeps the first spelling', () => {
    const vocab = programVocabulary(
      [{ programs: ['Blender'] }, { programs: ['blender', 'Maya'] }],
      ['ZBrush']
    )
    assert.deepEqual(vocab, ['Blender', 'Maya', 'ZBrush'])
  })
})

describe('fileHints', () => {
  it('counts project file types and ignores media and docs', () => {
    const hints = fileHints(outline)
    assert.deepEqual(hints.exts, ['.blend ×2', '.zip ×1'])
    assert.ok(hints.samples.includes('scene.blend'))
    assert.ok(!hints.samples.includes('notes.pdf'))
  })
})

describe('coursesForProgramBatch', () => {
  it('puts untagged courses first', () => {
    const list = coursesForProgramBatch([comp, blender])
    assert.deepEqual(
      list.map((c) => c.path),
      [blender.path, comp.path]
    )
  })
})

describe('buildProgramsBrief', () => {
  it('includes the evidence and leaves out notes', () => {
    const text = buildProgramsBrief([{ course: blender, outline }], { vocabulary: ['Blender'] })
    assert.match(text, /Folder: School - Grease Pencil/)
    assert.match(text, /Project files on disk: \.blend ×2/)
    assert.match(text, /Interface/)
    assert.match(text, /already uses.*Blender/)
    assert.match(text, /Programs already tagged: \(none\)/)
    assert.doesNotMatch(text, /SECRET_NOTE_BODY/)
  })
})

describe('parseProgramsReply', () => {
  const courses = [blender, comp]
  const vocabulary = ['Blender', 'Cinema4D', 'After Effects']

  it('reads rows, canonicalizes names and drops programs already tagged', () => {
    const reply = JSON.stringify({
      programs: [
        {
          folder: 'School - Grease Pencil',
          programs: [
            { name: 'blender', confidence: 'high', evidence: '.blend files' },
            { name: 'Krita', confidence: 'low', evidence: 'texturing' }
          ]
        },
        {
          folder: 'Studio - Compositing',
          programs: [
            { name: 'Cinema 4D', confidence: 'high' },
            { name: 'after effects', confidence: 'medium' }
          ]
        }
      ]
    })
    const parsed = parseProgramsReply(reply, courses, { vocabulary })
    assert.equal(parsed.ok, true)
    assert.equal(parsed.items.length, 2)
    const [first, second] = parsed.items
    assert.deepEqual(
      first.suggestions.map((s) => [s.name, s.known, s.confidence]),
      [
        ['Blender', true, 'high'],
        ['Krita', false, 'low']
      ]
    )
    assert.deepEqual(
      second.suggestions.map((s) => s.name),
      ['After Effects']
    )
    const picks = defaultPicks(parsed.items)
    assert.ok(picks.has(pickKey(blender.path, 'Blender')))
    assert.ok(!picks.has(pickKey(blender.path, 'Krita')))
  })

  it('reports courses missing from the reply and unknown folders', () => {
    const reply = JSON.stringify({
      programs: [
        { folder: 'School - Grease Pencil', programs: ['Blender'] },
        { folder: 'Nope', programs: ['Maya'] }
      ]
    })
    const parsed = parseProgramsReply(reply, courses, { vocabulary })
    assert.equal(parsed.ok, true)
    const reasons = parsed.skips.map((s) => s.title + ':' + s.reason)
    assert.ok(reasons.some((r) => r.startsWith('Compositing:No vino')))
    assert.ok(reasons.some((r) => r.startsWith('Nope:')))
  })

  it('rejects the example and broken text', () => {
    const example = buildProgramsBrief([{ course: blender, outline }])
    const json = example.slice(example.lastIndexOf('{\n  "programs"'))
    assert.equal(parseProgramsReply(json, courses).ok, false)
    assert.equal(parseProgramsReply('nope', courses).ok, false)
  })
})

describe('mergePrograms', () => {
  it('appends without duplicates', () => {
    assert.deepEqual(mergePrograms(['Blender'], ['blender', 'Maya']), ['Blender', 'Maya'])
  })
})
