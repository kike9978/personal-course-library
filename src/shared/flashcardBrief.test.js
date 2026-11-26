import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildFlashcardBrief,
  existingBySource,
  noteImagesForCards,
  numberSources,
  parseConceptReply,
  noteCodeBlocks,
  parseFlashcardBrief,
  planParts,
  sourcesFromLesson,
  sourcesFromNotes,
  uncoveredSources
} from './flashcardBrief.js'
import { cardKey } from './flashcardCards.js'

const notes = [
  {
    id: 'note-light',
    title: 'Luz de recorte',
    coursePath: 'Studio - Product Lighting',
    lessonTitle: 'Key light',
    lessonRelativePath: '01 Key light.mp4',
    timeSec: 95,
    body: 'La luz de recorte separa el objeto del fondo. Va detrás y a un lado.'
  },
  { id: 'note-empty', title: '', body: '![frame](course-media://shot.png)' },
  {
    id: 'note-draw',
    title: 'new note 1:23',
    coursePath: 'School - Drawing People',
    body: 'El peso cae en el pie de atrás cuando la figura empuja.'
  }
]

const lesson = sourcesFromLesson({
  coursePath: 'Studio - Product Lighting',
  lessonPath: '02 Fill.mp4',
  lesson: 'Fill light',
  section: 'Basics',
  chunks: [
    { start: 60, end: 300, text: '[1:00] La luz de relleno suaviza las sombras del lado opuesto.' }
  ]
})

function sources() {
  return numberSources([...sourcesFromNotes(notes).sources, ...lesson])
}

function reply(cards, extra = {}) {
  return JSON.stringify({ title: 'Luz', cards, ...extra })
}

describe('flashcard sources', () => {
  it('skips notes without words and numbers sources in order', () => {
    const prepared = sourcesFromNotes(notes)
    assert.equal(prepared.sources.length, 2)
    assert.equal(prepared.empty, 1)
    const list = sources()
    assert.deepEqual(
      list.map((s) => s.ref),
      ['S1', 'S2', 'S3']
    )
    assert.equal(list[2].kind, 'lesson')
  })

  it('splits sources into parts under the budget', () => {
    const big = numberSources(
      Array.from({ length: 6 }, (_, i) => ({
        kind: 'lesson',
        lesson: `L${i}`,
        text: 'x'.repeat(900),
        start: 0,
        end: 10,
        images: []
      }))
    )
    const parts = planParts(big, 2000)
    assert.ok(parts.length >= 3)
    assert.deepEqual(
      parts.flat(),
      big.map((s) => s.ref)
    )
  })
})

describe('flashcard brief', () => {
  it('lists sources with refs, marks notes as priority and explains the chosen types', () => {
    const brief = buildFlashcardBrief({
      sources: sources(),
      goal: 'recordar la luz',
      types: ['basic', 'cloze']
    })
    assert.match(brief, /ONLY JSON/)
    assert.match(brief, /Goal: recordar la luz/)
    assert.match(brief, /S1 · note the person wrote \(priority\)/)
    assert.match(brief, /S3 · lesson transcript 1:00–5:00/)
    assert.match(brief, /cloze: no front\/back/)
    assert.doesNotMatch(brief, /typein:/)
    assert.match(brief, /add "at" with the clock/)
    assert.match(brief, /Copy the goal exactly/)
    assert.doesNotMatch(brief, /note-empty/)
  })

  it('writes one part at a time and lists existing cards and concepts', () => {
    const list = sources()
    const brief = buildFlashcardBrief({
      sources: list,
      refs: ['S3'],
      part: 2,
      parts: 2,
      existing: ['¿Qué hace la luz de recorte?'],
      concepts: [{ name: 'Luz de relleno', sources: ['S3'] }]
    })
    assert.match(brief, /part 2 of 2/)
    assert.doesNotMatch(brief, /S1 ·/)
    assert.match(brief, /also has these cards/)
    assert.match(brief, /- Luz de relleno \(S3\)/)
  })

  it('asks for concepts in concept mode', () => {
    const brief = buildFlashcardBrief({ sources: sources(), mode: 'concepts' })
    assert.match(brief, /listing the key concepts/)
    assert.match(brief, /"concepts"/)
  })
})

describe('flashcard reply', () => {
  it('saves cards of each type with their source, time and label', () => {
    const parsed = parseFlashcardBrief(
      reply([
        {
          source: 'S1',
          type: 'basic',
          front: '¿Qué hace la luz de recorte?',
          back: 'Separa el objeto del fondo.'
        },
        {
          source: 's3',
          type: 'cloze',
          text: 'La luz de {{c1::relleno}} suaviza las sombras.',
          at: '2:10'
        },
        { source: 'S2', type: 'typein', front: '¿Qué pie carga el peso?', back: 'El de atrás' },
        {
          source: 'S3',
          type: 'reverse',
          front: 'Luz de relleno',
          back: 'Suaviza las sombras',
          at: '99:00'
        }
      ]),
      sources()
    )
    assert.equal(parsed.ok, true)
    const [basic, cloze, typein, reverse] = parsed.deck.cards
    assert.equal(basic.noteId, 'note-light')
    assert.equal(basic.timeSec, 95)
    assert.equal(cloze.type, 'cloze')
    assert.equal(cloze.lessonPath, '02 Fill.mp4')
    assert.equal(cloze.timeSec, 130)
    assert.match(cloze.source, /Fill light · 2:10/)
    assert.equal(typein.type, 'typein')
    assert.equal(reverse.timeSec, 60, 'a clock outside the chunk falls back to its start')
    assert.ok(basic.support > 0.5)
    assert.equal(cloze.support, null, 'one word is too short to judge')
  })

  it('accepts a cloze without type and the old note id field', () => {
    const parsed = parseFlashcardBrief(
      reply([
        { source: 'S3', text: 'Las sombras se {{c1::suavizan}}.' },
        { note: 'note-draw', front: '¿Dónde cae el peso?', back: 'En el pie de atrás.' }
      ]),
      sources()
    )
    assert.equal(parsed.deck.cards[0].type, 'cloze')
    assert.equal(parsed.deck.cards[1].noteId, 'note-draw')
  })

  it('skips unknown sources, types not asked for, broken cloze, repeats and existing cards', () => {
    const existing = [cardKey({ type: 'basic', front: '¿Ya existe?' })]
    const parsed = parseFlashcardBrief(
      reply([
        { source: 'S9', front: '¿Otra?', back: 'No.' },
        { source: 'S1', type: 'typein', front: '¿Pie?', back: 'Atrás' },
        { source: 'S3', type: 'cloze', text: 'Sin huecos aquí.' },
        { source: 'S3', type: 'cloze', text: 'Bien {{c1::x}} y roto {{c2::abierto.' },
        { source: 'S1', front: '¿Ya existe?', back: 'Sí.' },
        { source: 'S1', front: '¿Qué separa?', back: 'El objeto del fondo.' },
        { source: 'S1', front: '¿Qué separa?', back: 'Otra vez.' }
      ]),
      sources(),
      { types: ['basic', 'cloze'], existing }
    )
    assert.equal(parsed.ok, true)
    assert.equal(parsed.deck.cards.length, 1)
    assert.deepEqual(
      parsed.skips.map((skip) => skip.reason),
      [
        'Esa fuente no está en el encargo.',
        'Ese tipo de tarjeta no se pidió.',
        'No tiene huecos {{c1::…}}.',
        'Un hueco {{c1::…}} está mal cerrado.',
        'Ya está en el mazo.',
        'Esa tarjeta ya venía. Se usó la primera.'
      ]
    )
  })

  it('refuses the example printed in the brief', () => {
    const brief = buildFlashcardBrief({
      sources: sources(),
      goal: 'recordar la luz',
      types: ['basic', 'cloze']
    })
    const parsed = parseFlashcardBrief(brief.slice(brief.lastIndexOf('\n\n{') + 2), sources(), {
      goal: 'recordar la luz'
    })
    assert.equal(parsed.ok, false)
    assert.match(parsed.error, /ejemplo/)
  })

  it('refuses a reply for another goal but accepts one that leaves the goal out', () => {
    const cards = [{ source: 'S1', front: '¿Qué?', back: 'Esto.' }]
    const other = parseFlashcardBrief(reply(cards, { goal: 'otra meta' }), sources(), {
      goal: 'recordar la luz'
    })
    assert.match(other.error, /otra meta/)
    const missing = parseFlashcardBrief(reply(cards), sources(), { goal: 'recordar la luz' })
    assert.equal(
      missing.ok,
      true,
      'chats often drop "goal"; the source refs still tie it to the brief'
    )
  })

  it('reports sources that got no card', () => {
    const parsed = parseFlashcardBrief(
      reply([{ source: 'S1', front: '¿Qué separa?', back: 'El objeto del fondo.' }]),
      sources()
    )
    assert.deepEqual(
      uncoveredSources(sources(), parsed.deck.cards).map((s) => s.ref),
      ['S2', 'S3']
    )
  })
})

describe('concept reply', () => {
  it('keeps concepts with known sources and drops repeats', () => {
    const parsed = parseConceptReply(
      JSON.stringify({
        concepts: [
          { name: 'Luz de relleno', sources: ['S3', 'S7'], why: 'Controla el contraste.' },
          { name: 'luz de relleno', sources: ['S3'] },
          { name: 'Fantasma', sources: ['S9'] },
          { name: 'Luz de recorte', sources: 'S1' },
          { name: 'Ya listado', sources: ['S1'] }
        ]
      }),
      sources(),
      { existing: ['Ya listado'] }
    )
    assert.equal(parsed.ok, true)
    assert.deepEqual(
      parsed.concepts.map((c) => [c.name, c.sources]),
      [
        ['Luz de relleno', ['S3']],
        ['Luz de recorte', ['S1']]
      ]
    )
  })
})

describe('note images', () => {
  it('lists note images with their label and the words before them', () => {
    const body =
      'La luz de recorte separa el objeto.\n\n![contraluz](course-media://note/?file=a1-b2.png "Recorte fuerte")\n\n![](course-media://note/?file=draw-1.excalidraw)\n![otra](https://example.com/x.png)'
    const images = noteImagesForCards(body)
    assert.equal(images.length, 1)
    assert.equal(images[0].ref, 'img1')
    assert.equal(images[0].alt, 'Recorte fuerte')
    assert.match(images[0].near, /separa el objeto/)
    const list = numberSources(sourcesFromNotes([{ id: 'n1', title: 'Luz', body }]).sources)
    assert.match(buildFlashcardBrief({ sources: list }), /img1 · label "Recorte fuerte"/)
  })

  it('keeps an image only when the ref belongs to the card source', () => {
    const list = numberSources(
      sourcesFromNotes([
        ...notes,
        {
          id: 'n-img',
          title: 'Contraluz',
          body: 'Texto. ![x](course-media://note/?file=a1-b2.png)'
        }
      ]).sources
    )
    const parsed = parseFlashcardBrief(
      reply([
        { source: 'S3', front: '¿Contraluz?', back: 'Luz detrás.', image: 'IMG1' },
        { source: 'S1', front: '¿Recorte?', back: 'Separa.', image: 'img1' }
      ]),
      list
    )
    assert.deepEqual(parsed.deck.cards[0].image, { file: 'a1-b2.png', alt: 'x' })
    assert.equal(parsed.deck.cards[1].image, null)
  })
})

describe('cards that stand alone', () => {
  const real = numberSources(
    sourcesFromNotes([
      {
        id: 'n-wiggle',
        body: 'Wiggle loop\n\n```\nfreq = 1;\nloopTime = 3;\nt = time % loopTime;\nlinear(t, 0, loopTime, wiggle1, wiggle2);\n```'
      },
      {
        id: 'n-controls',
        body: '![image.png](course-media://note/?file=mwk2wkt6-2e9263371600.png)\n\nExpression controls\n\ndifferent types of controllers like sliders and angles'
      },
      {
        id: 'n-repeater',
        body: '![Captura en 18:30](course-media://note/?file=mwl1ame5-1b5208b0aa6b.png)\n\nUse a repeater modifier, very useful. Can create duplicates of shapes, build lines or even arrays'
      },
      { id: 'n-heading', body: 'Expression controls' }
    ]).sources
  )

  it('keeps code in the brief, marks heading-only notes and drops file-name image labels', () => {
    assert.deepEqual(noteCodeBlocks('```js\nx = 1;\n```'), ['x = 1;'])
    assert.match(real[0].code, /t = time % loopTime;/)
    assert.equal(real[0].thin, false, 'a note with code is not just a heading')
    assert.equal(real[3].thin, true)
    assert.equal(real[1].images[0].alt, '')
    assert.equal(real[2].images[0].alt, 'Captura en 18:30')
    assert.equal(real[2].timeSec, 1110, 'the screenshot caption gives the note a time')
    const brief = buildFlashcardBrief({ sources: real })
    assert.match(brief, /code:\n```\nfreq = 1;\nloopTime = 3;/)
    assert.match(brief, /only a heading/)
    assert.match(brief, /make sense on its own/)
    assert.doesNotMatch(brief, /label "image.png"/)
  })

  it('skips cards that ask about the note instead of the idea', () => {
    const parsed = parseFlashcardBrief(
      reply([
        {
          source: 'S2',
          type: 'typein',
          front: 'What does this note name?',
          back: 'Expression controls'
        },
        {
          source: 'S1',
          type: 'typein',
          front: 'What technique is named in this note?',
          back: 'Wiggle loop'
        },
        {
          source: 'S3',
          type: 'typein',
          front: 'What modifier is noted as very useful?',
          back: 'repeater modifier'
        },
        {
          source: 'S3',
          front: 'How do you merge shapes, according to the note?',
          back: 'Copy paste.'
        },
        { source: 'S2', front: '¿Qué dice esta nota?', back: 'Controles.' },
        {
          source: 'S3',
          type: 'typein',
          front: 'Which shape modifier duplicates shapes into lines or arrays?',
          back: 'Repeater'
        },
        {
          source: 'S1',
          type: 'cloze',
          text: 'A seamless wiggle loop uses t = time % {{c1::loopTime}}.'
        },
        { source: 'S2', front: 'What does the source text layer do?', back: 'It holds the text.' }
      ]),
      real
    )
    assert.equal(parsed.ok, true)
    assert.deepEqual(
      parsed.deck.cards.map((card) => card.front),
      [
        'Which shape modifier duplicates shapes into lines or arrays?',
        'A seamless wiggle loop uses t = time % {{c1::loopTime}}.',
        'What does the source text layer do?'
      ]
    )
    assert.equal(parsed.skips.filter((skip) => /No se entiende sola/.test(skip.reason)).length, 5)
  })

  it('attaches the note first image unless the card picks another or none', () => {
    const parsed = parseFlashcardBrief(
      reply([
        { source: 'S3', front: 'Which modifier duplicates shapes?', back: 'Repeater.' },
        {
          source: 'S2',
          front: 'Which controllers exist?',
          back: 'Sliders and angles.',
          image: 'none'
        },
        {
          source: 'S1',
          front: 'How do you loop a wiggle?',
          back: 'Blend two wiggles over loopTime.'
        }
      ]),
      real
    )
    const [auto, none, noImages] = parsed.deck.cards
    assert.equal(auto.image.file, 'mwl1ame5-1b5208b0aa6b.png')
    assert.equal(auto.imageAuto, true)
    assert.equal(none.image, null)
    assert.equal(noImages.image, null)
  })
})

describe('cards already in the deck', () => {
  it('lists existing cards under the source they came from', () => {
    const list = sources()
    const deckCards = [
      { type: 'basic', noteId: 'note-light', front: '¿Qué hace la luz de recorte?' },
      {
        type: 'cloze',
        lessonPath: '02 Fill.mp4',
        timeSec: 120,
        front: 'La luz de {{c1::relleno}} suaviza.'
      },
      { type: 'basic', lessonPath: '02 Fill.mp4', timeSec: 900, front: 'Fuera del fragmento' },
      {
        type: 'basic',
        noteId: 'other-note',
        coursePath: 'Studio - Product Lighting',
        front: 'Otra del curso'
      },
      { type: 'basic', noteId: 'far', coursePath: 'Another course', front: 'De otro curso' }
    ]
    const grouped = existingBySource(list, deckCards)
    assert.deepEqual(grouped.byRef.get('S1'), ['¿Qué hace la luz de recorte?'])
    assert.deepEqual(grouped.byRef.get('S3'), ['La luz de relleno suaviza.'])
    assert.equal(grouped.byRef.has('S2'), false)
    assert.equal(grouped.other.length, 3)

    const brief = buildFlashcardBrief({ sources: list, existing: deckCards })
    assert.match(brief, /S1 · note[\s\S]*already in the deck:\n {2}- ¿Qué hace la luz de recorte\?/)
    assert.match(brief, /Write cards only for what those cards miss/)
    assert.match(brief, /also has these cards[\s\S]*- Otra del curso/)
    assert.doesNotMatch(brief, /De otro curso/, 'cards from other courses stay out')
    const s2 = brief.slice(brief.indexOf('S2 ·'), brief.indexOf('S3 ·'))
    assert.doesNotMatch(s2, /already in the deck/)
  })

  it('lists only the existing cards of the sources in this part', () => {
    const list = sources()
    const brief = buildFlashcardBrief({
      sources: list,
      refs: ['S2'],
      part: 1,
      parts: 2,
      existing: [{ noteId: 'note-light', front: '¿Qué hace la luz de recorte?' }]
    })
    assert.doesNotMatch(brief, /luz de recorte\?/)
    assert.doesNotMatch(brief, /what those cards miss/)
  })
})

describe('code cards', () => {
  const WIGGLE =
    'freq = 1;\namp = 110;\nloopTime = 3;\nt = time % loopTime;\nwiggle1 = wiggle(freq, amp, 1, 0.5, t);\nwiggle2 = wiggle(freq, amp, 1, 0.5, t - loopTime);\nlinear(t, 0, loopTime, wiggle1, wiggle2);'
  const sources = numberSources(
    sourcesFromNotes([{ id: 'n-wiggle', title: 'Wiggle loop', body: '```\n' + WIGGLE + '\n```' }])
      .sources
  )

  it('asks for the whole code and for its parts, as the allowed types permit', () => {
    const all = buildFlashcardBrief({ sources, types: ['basic', 'cloze', 'typein'] })
    assert.match(all, /Whole code/)
    assert.match(all, /Parts of the code/)
    assert.match(all, /Why a part/)
    assert.match(all, /Exact names/)
    const basicOnly = buildFlashcardBrief({ sources, types: ['basic'] })
    assert.match(basicOnly, /Whole code/)
    assert.doesNotMatch(basicOnly, /Parts of the code/)
    assert.doesNotMatch(
      buildFlashcardBrief({ sources: numberSources(sourcesFromNotes(notes).sources) }),
      /Whole code/
    )
  })

  it('keeps code lines in pasted cards and lets one code block hold several clozes', () => {
    const cloze1 = WIGGLE.replace('time % loopTime', '{{c1::time % loopTime}}').replace(
      't - loopTime',
      '{{c2::t - loopTime}}'
    )
    const cloze2 = WIGGLE.replace('linear(', '{{c1::linear}}(')
    const parsed = parseFlashcardBrief(
      reply([
        {
          source: 'S1',
          type: 'basic',
          front: 'Write the expression that loops a wiggle every loopTime seconds.',
          back: '```js\n' + WIGGLE + '  \n```'
        },
        { source: 'S1', type: 'cloze', text: '```\n' + cloze1 + '\n```', extra: 'Wraps time.' },
        { source: 'S1', type: 'cloze', text: '```\n' + cloze2 + '\n```' },
        {
          source: 'S1',
          type: 'basic',
          front: 'In\n```\n' + WIGGLE + '\n```\nwhy does   `wiggle2` use `t - loopTime`?',
          back: 'So it  matches wiggle1 at the loop point.'
        }
      ]),
      sources
    )
    assert.equal(parsed.ok, true, parsed.error)
    assert.equal(parsed.skips.length, 0, JSON.stringify(parsed.skips))
    const [whole, parts, other, why] = parsed.deck.cards
    assert.equal(whole.back, '```js\n' + WIGGLE + '\n```')
    assert.ok(parts.front.includes('\nt = {{c1::time % loopTime}};\n'))
    assert.notEqual(cardKey(parts), cardKey(other))
    assert.equal(why.front, 'In\n```\n' + WIGGLE + '\n```\nwhy does `wiggle2` use `t - loopTime`?')
    assert.equal(why.back, 'So it matches wiggle1 at the loop point.')
  })
})
