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
  picksWhere,
  programTally,
  programKey,
  programVocabulary,
  randomCourseSample
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

describe('programTally and picksWhere', () => {
  const items = [
    {
      path: 'a',
      suggestions: [
        { name: 'Blender', confidence: 'high' },
        { name: 'Krita', confidence: 'low' }
      ]
    },
    { path: 'b', suggestions: [{ name: 'blender', confidence: 'medium' }] }
  ]
  it('counts each program across courses', () => {
    assert.deepEqual(
      programTally(items).map((row) => [row.name, row.count]),
      [
        ['Blender', 2],
        ['Krita', 1]
      ]
    )
  })
  it('selects by program or confidence', () => {
    const blender = picksWhere(items, (s) => programKey(s.name) === programKey('Blender'))
    assert.deepEqual([...blender], [pickKey('a', 'Blender'), pickKey('b', 'blender')])
    assert.equal(picksWhere(items, (s) => s.confidence === 'high').size, 1)
  })
})

describe('randomCourseSample', () => {
  const pool = [
    { path: 'a', programs: ['Blender'] },
    { path: 'b', programs: [] },
    { path: 'c' },
    { path: 'd', programs: ['Maya'] }
  ]
  it('takes untagged courses first and caps at count', () => {
    const two = randomCourseSample(pool, 2)
    assert.deepEqual([...two].sort(), ['b', 'c'])
    const three = randomCourseSample(pool, 3)
    assert.equal(three.length, 3)
    assert.ok(three.includes('b') && three.includes('c'))
  })
  it('handles counts larger than the pool and bad input', () => {
    assert.equal(randomCourseSample(pool, 99).length, 4)
    assert.deepEqual(randomCourseSample(pool, 'x'), [])
  })
})

describe('web sources', () => {
  it('asks the chat to search the web and keeps https sources', () => {
    const text = buildProgramsBrief([{ course: blender, outline }])
    assert.match(text, /Search the web/)
    assert.match(text, /source/)
    const reply = JSON.stringify({
      programs: [
        {
          folder: blender.path,
          programs: [
            { name: 'Blender', confidence: 'high', source: 'https://school.com/grease' },
            { name: 'Krita', confidence: 'low', source: 'javascript:alert(1)' }
          ]
        }
      ]
    })
    const parsed = parseProgramsReply(reply, [blender])
    assert.equal(parsed.items[0].suggestions[0].source, 'https://school.com/grease')
    assert.equal(parsed.items[0].suggestions[1].source, undefined)
  })
})

describe('media brief and reply', () => {
  it('asks for materials and reads a media reply', () => {
    const text = buildProgramsBrief([{ course: { ...blender, media: [] }, outline }], {
      field: 'media'
    })
    assert.match(text, /traditional media/)
    assert.match(text, /Materiales/)
    assert.match(text, /"media": \[/)
    const reply = JSON.stringify({
      media: [{ folder: blender.path, media: [{ name: 'Gouache', confidence: 'medium' }] }]
    })
    const parsed = parseProgramsReply(reply, [{ ...blender, media: [] }], { field: 'media' })
    assert.equal(parsed.ok, true)
    assert.deepEqual(
      parsed.items[0].suggestions.map((s) => s.name),
      ['Gouache']
    )
  })
})
