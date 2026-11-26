import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DECK_DATA_TITLE,
  deckBlocks,
  deckDataBlocks,
  deckFromData,
  deckImageFiles,
  deckNotionHash
} from './notionDeck.js'

const deck = {
  id: 'd1',
  title: 'Expresiones',
  cards: [
    {
      id: 'a',
      type: 'basic',
      front: 'Why use `t - loopTime`?',
      back: 'So the second wiggle matches the first at the loop point.',
      image: { file: 'abc-1.png', alt: 'Captura en 0:42' },
      source: 'Expressions Trip · Wiggle & Controllers'
    },
    {
      id: 'b',
      type: 'reverse',
      front: 'Repeater',
      back: 'Duplicates shapes into lines or arrays.'
    },
    {
      id: 'c',
      type: 'cloze',
      front: 'A seamless loop uses t = time % {{c1::loopTime}}.',
      back: 'loopTime is the loop length in seconds.'
    },
    {
      id: 'd',
      type: 'basic',
      front: 'What does this do?\n```\nt = time % loopTime;\n```',
      back: 'Restarts time every loop.'
    }
  ]
}

const text = (rich) => rich.map((item) => item.text.content).join('')

describe('notion deck page', () => {
  it('starts with a note that the page is written by the app, then one toggle per card', () => {
    const blocks = deckBlocks(deck, new Map([['abc-1.png', 'upload-1']]))
    assert.equal(blocks[0].type, 'callout')
    assert.match(text(blocks[0].callout.rich_text), /4 tarjetas/)
    assert.equal(blocks.length, 6)
    assert.ok(blocks.slice(1).every((block) => block.type === 'toggle'))
    assert.equal(text(blocks.at(-1).toggle.rich_text), DECK_DATA_TITLE)
  })

  it('ends with the deck as JSON that reads back the same, without study marks', () => {
    const marked = { ...deck, cards: deck.cards.map((card) => ({ ...card, known: true })) }
    const data = deckDataBlocks(marked)
    const back = deckFromData(data.map((block) => text(block.code.rich_text)).join(''))
    assert.equal(back.id, 'd1')
    assert.equal(back.title, 'Expresiones')
    assert.deepEqual(
      back.cards.map((card) => card.id),
      deck.cards.map((card) => card.id)
    )
    assert.ok(back.cards.every((card) => card.known === undefined))
    assert.deepEqual(back.cards[0].image, deck.cards[0].image)
    assert.equal(deckNotionHash(back), deckNotionHash(deck))
  })

  it('splits a long deck over several code blocks and refuses broken data', () => {
    const long = {
      id: 'd2',
      title: 'Largo',
      cards: Array.from({ length: 400 }, (_, index) => ({
        id: `c${index}`,
        type: 'basic',
        front: `Pregunta ${index} ${'x'.repeat(400)}`,
        back: 'Respuesta'
      }))
    }
    const data = deckDataBlocks(long)
    assert.ok(data.length > 1)
    assert.ok(data.every((block) => block.code.rich_text.length <= 100))
    const back = deckFromData(data.map((block) => text(block.code.rich_text)).join(''))
    assert.equal(back.cards.length, 400)
    assert.equal(deckFromData('{"v":1'), null)
    assert.equal(deckFromData('{"v":9,"id":"x","cards":[]}'), null)
  })

  it('puts the answer, image and source inside the toggle and inline code in the title', () => {
    const [, basic] = deckBlocks(deck, new Map([['abc-1.png', 'upload-1']]))
    const title = basic.toggle.rich_text
    assert.equal(text(title), 'Why use t - loopTime?')
    assert.equal(title.find((item) => item.text.content === 't - loopTime').annotations.code, true)
    const kids = basic.toggle.children
    assert.match(text(kids[0].paragraph.rich_text), /matches the first/)
    assert.equal(kids[1].type, 'image')
    assert.equal(kids[1].image.file_upload.id, 'upload-1')
    assert.equal(kids[2].paragraph.color, 'gray')
  })

  it('leaves out an image that did not upload', () => {
    const [, basic] = deckBlocks(deck, new Map())
    assert.ok(basic.toggle.children.every((block) => block.type !== 'image'))
  })

  it('marks reverse cards, hides cloze blanks in the title and shows them inside', () => {
    const blocks = deckBlocks(deck)
    assert.equal(text(blocks[2].toggle.rich_text), '↔ Repeater')
    assert.equal(text(blocks[3].toggle.rich_text), 'A seamless loop uses t = time % […].')
    const inside = blocks[3].toggle.children[0].paragraph.rich_text
    const answer = inside.find((item) => item.text.content === 'loopTime')
    assert.equal(answer.annotations.bold, true)
  })

  it('puts the question code in a code block inside the toggle, before the answer', () => {
    const card = deckBlocks(deck)[4]
    assert.equal(text(card.toggle.rich_text), 'What does this do?')
    const [code, divider, answer] = card.toggle.children
    assert.equal(code.type, 'code')
    assert.equal(code.code.language, 'javascript')
    assert.equal(text(code.code.rich_text).trim(), 't = time % loopTime;')
    assert.equal(divider.type, 'divider')
    assert.match(text(answer.paragraph.rich_text), /Restarts time/)
  })

  it('changes the hash on content edits but not on study marks', () => {
    const base = deckNotionHash(deck)
    const studied = { ...deck, cards: deck.cards.map((card) => ({ ...card, known: true })) }
    assert.equal(deckNotionHash(studied), base)
    const edited = {
      ...deck,
      cards: [{ ...deck.cards[0], back: 'Changed.' }, ...deck.cards.slice(1)]
    }
    assert.notEqual(deckNotionHash(edited), base)
    assert.notEqual(deckNotionHash({ ...deck, title: 'Otro' }), base)
  })

  it('lists each image file once', () => {
    const twice = { cards: [...deck.cards, { ...deck.cards[0], id: 'z' }] }
    assert.deepEqual(deckImageFiles(twice), ['abc-1.png'])
  })
})
