import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPlaylistBrief,
  parsePlaylistBrief,
  selectedPlacement,
  statusLabel
} from './playlistBrief.js'

const courses = [
  {
    path: 'School - Storyboard Action',
    title: 'Storyboard Action',
    institution: 'School',
    theme: ['Storyboard'],
    isInProcess: true,
    description: { summary: 'Plan an action scene with boards and shots.' }
  },
  {
    path: 'School - Drawing People',
    title: 'Drawing People',
    institution: 'School',
    learning: { status: 'completed' }
  },
  {
    path: 'Studio - Product Lighting',
    title: 'Product Lighting',
    institution: 'Studio'
  }
]

function reply(lists, goal = 'armar un reel') {
  return JSON.stringify({ goal, lists })
}

describe('playlist brief', () => {
  it('gives the chat the whole catalog and asks it to filter', () => {
    const brief = buildPlaylistBrief({
      courses,
      goal: 'armar un reel',
      interests: ['Storyboard']
    })
    assert.match(brief, /ONLY JSON/)
    assert.match(brief, /Goal: armar un reel/)
    assert.match(brief, /Interests: Storyboard/)
    assert.match(brief, /Do not return a sample/)
    assert.match(brief, /One path per subject/)
    assert.match(brief, /Do not pad/)
    assert.doesNotMatch(brief, /One path is enough/)
    assert.doesNotMatch(brief, /up to \d+/)
    assert.match(brief, /School - Storyboard Action/)
    assert.match(brief, /School - Drawing People/)
    assert.match(brief, /Studio - Product Lighting/)
    assert.match(brief, /Catalog \(3 courses\)/)
    assert.doesNotMatch(brief, /not listed/)
    assert.match(brief, /"lists"/)
    assert.equal(statusLabel(courses[0]), 'en curso')
    assert.equal(statusLabel(courses[1]), 'terminado')
  })

  it('asks an extend brief to keep the current order', () => {
    const brief = buildPlaylistBrief({
      courses,
      mode: 'extend',
      existingPaths: ['School - Drawing People']
    })
    assert.match(brief, /Keep them/)
    assert.match(brief, /1\. School - Drawing People/)
    assert.match(brief, /"courses"/)
  })
})

describe('playlist paste', () => {
  it('keeps folders from the allow-list and drops the rest', () => {
    const parsed = parsePlaylistBrief(
      reply([
        {
          title: 'Personas y acción',
          why: 'Dibujar gente antes de montar una escena.',
          courses: [
            { folder: 'School - Drawing People', why: 'Figura primero.' },
            { folder: 'School - Storyboard Action', why: 'Luego la escena.' },
            { folder: 'No such course', why: 'Inventado.' }
          ]
        }
      ]),
      courses,
      { goal: 'armar un reel' }
    )
    assert.equal(parsed.ok, true)
    assert.deepEqual(parsed.lists[0].coursePaths, [
      'School - Drawing People',
      'School - Storyboard Action'
    ])
    assert.equal(parsed.lists[0].courseWhys['School - Drawing People'], 'Figura primero.')
    assert.equal(parsed.skips.length, 1)
  })

  it('refuses a reply written for another goal', () => {
    const parsed = parsePlaylistBrief(
      reply(
        [
          {
            title: 'Otra cosa',
            courses: [{ folder: 'School - Drawing People', why: 'Figura primero.' }]
          }
        ],
        'otra meta distinta'
      ),
      courses,
      { goal: 'armar un reel' }
    )
    assert.equal(parsed.ok, false)
    assert.equal(parsed.lists.length, 0)
  })

  it('appends only courses that are not already on the lista', () => {
    const parsed = parsePlaylistBrief(
      JSON.stringify({
        goal: 'armar un reel',
        courses: [
          { folder: 'School - Drawing People', why: 'Ya estaba.' },
          { folder: 'School - Storyboard Action', why: 'Siguiente escena.' }
        ]
      }),
      courses,
      { goal: 'armar un reel', mode: 'extend', existingPaths: ['School - Drawing People'] }
    )
    assert.equal(parsed.ok, true)
    assert.deepEqual(parsed.lists[0].coursePaths, ['School - Storyboard Action'])
    assert.equal(parsed.skips[0].reason.includes('Ya está'), true)
  })

  it('flattens a path that has only one nested lista', () => {
    const parsed = parsePlaylistBrief(
      reply([
        {
          title: 'Piano',
          why: 'Música.',
          lists: [
            {
              title: 'Teclado',
              why: 'Empieza aquí.',
              courses: [{ folder: 'School - Drawing People', why: 'Lectura de partitura.' }]
            }
          ]
        }
      ]),
      courses,
      { goal: 'armar un reel' }
    )
    assert.equal(parsed.ok, true)
    assert.equal(parsed.lists[0].title, 'Piano')
    assert.deepEqual(parsed.lists[0].children, [])
    assert.deepEqual(parsed.lists[0].coursePaths, ['School - Drawing People'])
  })

  it('keeps nested listas inside the path', () => {
    const parsed = parsePlaylistBrief(
      reply([
        {
          title: 'Reel',
          why: 'De la figura a la escena.',
          lists: [
            {
              title: 'Figura',
              why: '',
              courses: [{ folder: 'School - Drawing People', why: 'Gente primero.' }]
            },
            {
              title: 'Escena',
              why: '',
              courses: [{ folder: 'School - Storyboard Action', why: 'Luego la acción.' }]
            }
          ]
        }
      ]),
      courses,
      { goal: 'armar un reel' }
    )
    assert.equal(parsed.ok, true)
    assert.equal(parsed.lists[0].children.length, 2)
    assert.deepEqual(parsed.lists[0].children[0].coursePaths, ['School - Drawing People'])
    assert.equal(parsed.lists[0].coursePaths.length, 0)
  })

  it('writes nothing when the reply is still the example', () => {
    const brief = buildPlaylistBrief({ courses, goal: 'armar un reel' })
    const parsed = parsePlaylistBrief(brief.slice(brief.indexOf('{')), courses, {
      goal: 'armar un reel'
    })
    assert.equal(parsed.ok, false)
    assert.equal(parsed.lists.length, 0)
  })
})

const board = [
  {
    id: 'path-draw',
    title: 'Dibujo',
    why: 'Figura.',
    parentId: '',
    childIds: ['step-people'],
    coursePaths: []
  },
  {
    id: 'step-people',
    title: 'Personas',
    why: '',
    parentId: 'path-draw',
    childIds: [],
    coursePaths: ['School - Drawing People']
  }
]

describe('playlist update', () => {
  it('sends the current tree and only the loose courses', () => {
    const brief = buildPlaylistBrief({
      courses,
      goal: 'armar un reel',
      mode: 'update',
      board
    })
    assert.match(brief, /Current listas/)
    assert.match(brief, /path-draw/)
    assert.match(brief, /step-people/)
    assert.match(brief, /Loose courses \(2\)/)
    assert.match(brief, /"add"/)
    assert.match(brief, /"create"/)
    const loose = brief.split('Loose courses')[1]
    assert.match(loose, /School - Storyboard Action/)
    assert.match(loose, /Studio - Product Lighting/)
    assert.doesNotMatch(loose, /School - Drawing People/)
  })

  it('places loose courses onto an existing lista and creates the rest', () => {
    const parsed = parsePlaylistBrief(
      JSON.stringify({
        goal: 'armar un reel',
        add: [
          {
            id: 'step-people',
            courses: [
              { folder: 'School - Storyboard Action', why: 'Siguiente.' },
              { folder: 'School - Drawing People', why: 'Ya estaba.' }
            ]
          },
          { id: 'missing', courses: [{ folder: 'Studio - Product Lighting', why: 'Luz.' }] }
        ],
        create: [
          {
            title: 'Luz',
            why: 'Producto.',
            courses: [{ folder: 'Studio - Product Lighting', why: 'Luz de producto.' }]
          }
        ]
      }),
      courses,
      { goal: 'armar un reel', mode: 'update', board }
    )
    assert.equal(parsed.ok, true)
    assert.equal(parsed.adds.length, 1)
    assert.equal(parsed.adds[0].id, 'step-people')
    assert.deepEqual(parsed.adds[0].coursePaths, ['School - Storyboard Action'])
    assert.deepEqual(parsed.lists[0].coursePaths, ['Studio - Product Lighting'])
    assert.equal(
      parsed.skips.some((skip) => skip.reason.includes('Ya está')),
      true
    )
    assert.equal(
      parsed.skips.some((skip) => skip.reason.includes('no está en el tablero')),
      true
    )
  })

  it('writes nothing when the update reply is still the example', () => {
    const brief = buildPlaylistBrief({ courses, goal: 'armar un reel', mode: 'update', board })
    assert.match(brief, /A short path toward the goal/)
    const parsed = parsePlaylistBrief(
      JSON.stringify({
        goal: 'armar un reel',
        add: [
          {
            id: 'step-people',
            courses: [
              {
                folder: 'School - Storyboard Action',
                why: 'Why this course is next, in one sentence.'
              }
            ]
          }
        ],
        create: [
          {
            title: 'A short path toward the goal',
            why: 'Why these courses belong together, in one sentence.',
            courses: [
              {
                folder: 'Studio - Product Lighting',
                why: 'Why this course is next, in one sentence.'
              }
            ]
          }
        ]
      }),
      courses,
      { goal: 'armar un reel', mode: 'update', board }
    )
    assert.equal(parsed.ok, false)
    assert.equal(parsed.adds.length, 0)
    assert.equal(parsed.lists.length, 0)
  })

  it('keeps only the courses that stay checked', () => {
    const parsed = parsePlaylistBrief(
      JSON.stringify({
        add: [
          {
            id: 'step-people',
            courses: [{ folder: 'School - Storyboard Action', why: 'Siguiente.' }]
          }
        ],
        create: [
          {
            title: 'Luz',
            why: 'Producto.',
            courses: [{ folder: 'Studio - Product Lighting', why: 'Luz de producto.' }]
          }
        ]
      }),
      courses,
      { mode: 'update', board }
    )
    const chosen = selectedPlacement(
      parsed,
      new Set(['add:step-people:School - Storyboard Action'])
    )
    assert.deepEqual(chosen.adds[0].coursePaths, ['School - Storyboard Action'])
    assert.equal(chosen.lists.length, 0)
  })
})
