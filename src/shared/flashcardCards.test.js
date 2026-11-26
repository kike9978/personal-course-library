import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  brokenCloze,
  cardAnswerText,
  cardKey,
  checkCardFields,
  clozeNumbers,
  clozeParts,
  clozePlain,
  cleanCardText,
  formatClock,
  hasCode,
  parseClock,
  sourceSupport,
  textSegments
} from './flashcardCards.js'

describe('flashcard cards', () => {
  it('reads cloze numbers, parts and the plain sentence', () => {
    const text = 'La luz {{c1::de recorte}} va {{c2::detrás::dónde}} del {{c1::objeto}}.'
    assert.deepEqual(clozeNumbers(text), [1, 2])
    assert.equal(clozePlain(text), 'La luz de recorte va detrás del objeto.')
    const hidden = clozeParts(text, 2)
    assert.equal(hidden.find((p) => p.n === 2).blank, true)
    assert.equal(hidden.find((p) => p.n === 2).hint, 'dónde')
    assert.equal(hidden.find((p) => p.n === 1).blank, false)
    assert.equal(brokenCloze('Roto {{c1::abierto.'), true)
    assert.equal(brokenCloze(text), false)
  })

  it('checks fields per type', () => {
    assert.equal(checkCardFields({ type: 'basic', front: '¿Qué?', back: 'Esto' }).ok, true)
    assert.equal(checkCardFields({ type: 'basic', front: '¿Qué?', back: '' }).ok, false)
    assert.equal(checkCardFields({ type: 'cloze', front: 'Una {{c1::cosa}}.', back: '' }).ok, true)
    assert.equal(checkCardFields({ type: 'cloze', front: 'Sin huecos', back: '' }).ok, false)
    assert.equal(
      checkCardFields({ type: 'typein', front: '¿Qué?', back: 'x'.repeat(61) }).ok,
      false
    )
    assert.equal(checkCardFields({ type: 'weird', front: 'a', back: 'b' }).card.type, 'basic')
  })

  it('makes the same key for the same card with different punctuation and accents', () => {
    assert.equal(cardKey({ front: '¿Qué hace la luz?' }), cardKey({ front: 'que hace la LUZ' }))
    assert.equal(
      cardKey({ type: 'cloze', front: 'La {{c1::luz}} va.' }),
      cardKey({ type: 'basic', front: 'La luz va' })
    )
  })

  it('reads and writes clocks', () => {
    assert.equal(parseClock('12:34'), 754)
    assert.equal(parseClock('1:02:03'), 3723)
    assert.equal(parseClock('12:99'), null)
    assert.equal(parseClock('nope'), null)
    assert.equal(formatClock(754), '12:34')
    assert.equal(formatClock(3723), '1:02:03')
  })

  it('scores how much of the answer the source says', () => {
    const source = 'La luz de relleno suaviza las sombras del lado opuesto al key light.'
    const good = { type: 'basic', back: 'Suaviza las sombras del lado opuesto.' }
    const bad = {
      type: 'basic',
      back: 'Aumenta saturación cromática mediante filtros polarizados.'
    }
    assert.ok(sourceSupport(good, source) > 0.6)
    assert.ok(sourceSupport(bad, source) < 0.4)
    assert.equal(sourceSupport({ back: 'Sí' }, source), null)
    assert.match(
      cardAnswerText({ type: 'cloze', front: 'La {{c1::luz}} va.', back: 'extra' }),
      /luz extra/
    )
  })
})

describe('code on cards', () => {
  const code = 'if (a) {\n  b = {x: 1}}\n}'

  it('splits prose from code blocks and keeps code lines', () => {
    const parts = textSegments('Mira:\n```js\n' + code + '\n```\nfin')
    assert.deepEqual(
      parts.map((part) => [part.code, part.text]),
      [
        [false, 'Mira:\n'],
        [true, code],
        [false, '\nfin']
      ]
    )
    assert.equal(parts[1].lang, 'js')
    assert.equal(hasCode('sin código'), false)
    assert.equal(
      cleanCardText('  Mira   esto:\n```js\n' + code + '   \n\n```\n  fin  '),
      'Mira esto:\n```js\n' + code + '\n```\nfin'
    )
  })

  it('accepts code braces in a cloze and longer fields with code', () => {
    const cloze = '```\n{{c1::if}} (a) {\n  b = {x: 1}}\n}\n```'
    assert.equal(brokenCloze(cloze), false)
    assert.equal(brokenCloze('Prosa con }} suelto {{c1::x}}'), true)
    const long = '```\n' + 'x = 1;\n'.repeat(70) + '```'
    assert.equal(checkCardFields({ type: 'basic', front: 'Escribe el loop', back: long }).ok, true)
    assert.equal(checkCardFields({ type: 'basic', front: 'Q', back: 'x'.repeat(500) }).ok, false)
  })
})
