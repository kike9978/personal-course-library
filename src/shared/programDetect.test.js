import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NO_CLUES,
  buildLibraryPriors,
  detectCoursePrograms,
  detectProgramsBatch,
  outlineDigest
} from './programDetect.js'

const empty = { sections: [], lessons: [], files: [] }
const names = (list) => list.map((s) => `${s.name}:${s.confidence}`)

describe('detectCoursePrograms', () => {
  it('trusts project files, more of them more', () => {
    const out = detectCoursePrograms(
      { path: 'X - Course', title: 'Course' },
      { ...empty, files: ['a.blend', 'b.blend', 'c.blend', 'scene.aep', 'clip.mp4', 'sheet.xlsx'] }
    )
    assert.deepEqual(names(out), ['Blender:high', 'After Effects:medium'])
    assert.match(out[0].evidence, /3 archivos \.blend/)
  })

  it('does not read a library tag that is also a verb as the program', () => {
    const out = detectCoursePrograms(
      { path: 'S - How to animate an illustration', title: 'How to animate an illustration' },
      { ...empty, lessons: ['From Thumbnail to Sketch'] },
      { vocabulary: ['Animate', 'Notion'] }
    )
    assert.deepEqual(out, [])
  })

  it('maps library spellings onto the catalog', () => {
    const out = detectCoursePrograms(
      { path: 'S - Frame by frame', title: 'Frame by frame', programs: [] },
      { ...empty, lessons: ['Introducing Adobe Animate CC'], files: ['a.fla', 'b.fla', 'c.fla'] },
      { vocabulary: ['Animate'] }
    )
    assert.deepEqual(
      out.map((s) => [s.name, s.known, s.confidence]),
      [['Animate', true, 'high']]
    )
  })

  it('reads names and short forms in the title, lessons and description', () => {
    const out = detectCoursePrograms(
      {
        path: 'School - C4D Basics',
        title: 'C4D Basics',
        description: { summary: 'Render with Octane render.', outcomes: [] }
      },
      { ...empty, lessons: ['Intro to ZBrush', 'Export to Substance Painter'] }
    )
    assert.deepEqual(names(out), [
      'Cinema4D:high',
      'Octane:high',
      'Substance Painter:medium',
      'ZBrush:medium'
    ])
  })

  it('does not read words inside other words or lowercase short forms', () => {
    const out = detectCoursePrograms(
      { path: 'P - Painting', title: 'Blenders and aerial paintings' },
      empty
    )
    assert.deepEqual(out, [])
  })

  it('downgrades words that are also ordinary words', () => {
    const out = detectCoursePrograms(
      { path: 'S - Become an illustrator', title: 'Become an illustrator' },
      empty
    )
    assert.deepEqual(names(out), ['Illustrator:low'])
  })

  it('skips programs already tagged and uses the library spelling', () => {
    const out = detectCoursePrograms(
      { path: 'S - Cinema 4D and Blender', title: 'Cinema 4D and Blender', programs: ['Blender'] },
      empty,
      { vocabulary: ['Cinema4D'] }
    )
    assert.deepEqual(
      out.map((s) => [s.name, s.known]),
      [['Cinema4D', true]]
    )
  })

  it('learns from the instructor and school, leaving the course itself out', () => {
    const library = [
      { path: 'a', instructor: 'Ben', institution: 'Sch', programs: ['After Effects'] },
      {
        path: 'b',
        instructor: 'Ben',
        institution: 'Sch',
        programs: ['After Effects', 'Illustrator']
      },
      { path: 'c', institution: 'Sch', programs: ['After Effects'] },
      { path: 'self', instructor: 'Ben', institution: 'Sch', programs: ['Figma'] }
    ]
    const priors = buildLibraryPriors(library)
    const out = detectCoursePrograms(
      { path: 'self', title: 'Motion', instructor: 'Ben', institution: 'Sch', programs: [] },
      empty,
      { priors }
    )
    assert.deepEqual(names(out), ['After Effects:medium', 'Illustrator:medium'])
    assert.match(out[0].evidence, /2 de 2 cursos de Ben/)
  })
})

describe('outlineDigest', () => {
  it('collects section and lesson titles and every file name', () => {
    const digest = outlineDigest({
      sections: [
        {
          title: 'Setup',
          lessons: [
            { title: 'Intro', relativePath: 'Setup/01 Intro.mp4', resources: [{ name: 'x.psd' }] }
          ],
          resources: [{ relativePath: 'Setup/brushes.abr' }],
          sections: [{ title: 'Deep', lessons: [] }]
        }
      ],
      courseResources: [{ name: 'final.blend' }]
    })
    assert.deepEqual(digest.sections, ['Setup', 'Deep'])
    assert.deepEqual(digest.lessons, ['Intro'])
    assert.deepEqual(digest.files.sort(), ['01 Intro.mp4', 'brushes.abr', 'final.blend', 'x.psd'])
  })
})

describe('detectProgramsBatch', () => {
  it('splits found courses from those with no clues', () => {
    const result = detectProgramsBatch([
      { course: { path: 'a', title: 'Blender basics' }, digest: empty },
      { course: { path: 'b', title: 'Gesture drawing' }, digest: empty },
      { course: { path: 'c', title: 'Broken' }, error: 'No se pudo leer la carpeta.' }
    ])
    assert.deepEqual(
      result.items.map((i) => i.path),
      ['a']
    )
    assert.deepEqual(
      result.skips.map((s) => [s.path, s.reason]),
      [
        ['b', NO_CLUES],
        ['c', 'No se pudo leer la carpeta.']
      ]
    )
  })
})

describe('media detection', () => {
  const opts = { field: 'media' }

  it('finds traditional media in English and Spanish', () => {
    const out = detectCoursePrograms(
      { path: 'D - Acuarela botánica', title: 'Acuarela botánica' },
      { ...empty, lessons: ['Materiales: gouache y tinta china', 'Capas de gouache'] },
      opts
    )
    assert.deepEqual(names(out), ['Gouache:high', 'Watercolor:high', 'Ink:medium'])
  })

  it('treats words with a digital meaning as guesses', () => {
    const out = detectCoursePrograms(
      { path: 'S - Inking comics', title: 'Inking comics with pastel colors' },
      empty,
      opts
    )
    assert.deepEqual(names(out), ['Ink:low', 'Pastel:low'])
  })

  it('lowers media found in a course that already uses programs', () => {
    const out = detectCoursePrograms(
      {
        path: 'S - Watercolor in Procreate',
        title: 'Watercolor in Procreate',
        programs: ['Procreate']
      },
      empty,
      opts
    )
    assert.deepEqual(names(out), ['Watercolor:medium'])
    assert.match(out[0].evidence, /curso digital/)
  })

  it('reads media priors from the media field, not programs', () => {
    const library = [
      { path: 'a', instructor: 'Ana', programs: ['Photoshop'], media: ['Gouache'] },
      { path: 'b', instructor: 'Ana', programs: [], media: ['Gouache'] }
    ]
    const result = detectProgramsBatch(
      [{ course: { path: 'c', title: 'Paisajes', instructor: 'Ana' }, digest: empty }],
      { library, field: 'media' }
    )
    assert.deepEqual(names(result.items[0].suggestions), ['Gouache:medium'])
  })
})

describe('media in digital courses', () => {
  it('ignores tool names like Grease Pencil and treats iPad courses as digital', () => {
    assert.deepEqual(
      detectCoursePrograms({ path: 'S - Grease Pencil', title: '2D to 3D Grease Pencil' }, empty, {
        field: 'media'
      }),
      []
    )
    const ipad = detectCoursePrograms(
      { path: 'S - Watercolor on iPad', title: 'Watercolor on iPad' },
      empty,
      { field: 'media' }
    )
    assert.deepEqual(names(ipad), ['Watercolor:medium'])
    const blend = detectCoursePrograms(
      { path: 'S - Paintings in 3D', title: 'Paintings in 3D' },
      { ...empty, lessons: ['oil paint render'], files: ['a.blend', 'b.blend', 'c.blend'] },
      { field: 'media' }
    )
    assert.deepEqual(names(blend), ['Oil:low'])
  })
})

describe('photography as a medium', () => {
  const opts = { field: 'media' }

  it('keeps photography sure in a course that also uses Lightroom', () => {
    const out = detectCoursePrograms(
      {
        path: 'D - Food photography',
        title: 'Professional Food Photography',
        programs: ['Lightroom']
      },
      empty,
      opts
    )
    assert.deepEqual(names(out), ['Photography:high'])
  })

  it('prefers film photography over the general tag', () => {
    const out = detectCoursePrograms(
      { path: 'D - Fotografía analógica', title: 'Introducción a la fotografía analógica' },
      { ...empty, lessons: ['El cuarto oscuro'] },
      opts
    )
    assert.deepEqual(names(out), ['Film Photography:high'])
  })

  it('does not read photo references or a 3D camera as photography', () => {
    assert.deepEqual(
      detectCoursePrograms(
        { path: 'C - Photo References', title: 'Drawing Landscapes from Photo References' },
        empty,
        opts
      ),
      []
    )
    const cam = detectCoursePrograms(
      { path: 'B - Camera moves', title: 'Camera moves in Blender', programs: ['Blender'] },
      empty,
      opts
    )
    assert.deepEqual(names(cam), ['Photography:low'])
  })
})

describe('photography mentioned only in a digital course description', () => {
  it('is probable, not sure', () => {
    const out = detectCoursePrograms(
      {
        path: 'C - Cinematic Lighting',
        title: 'Cinematic Lighting in Blender',
        programs: ['Blender'],
        description: {
          summary: 'Lighting lessons borrowed from film and photography for 3D scenes.'
        }
      },
      empty,
      { field: 'media' }
    )
    assert.deepEqual(names(out), ['Photography:medium'])
  })
})
