import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ANKI_MODELS,
  ankiDeckName,
  ankiHtml,
  ankiNotesForDeck,
  ankiSourceQuery,
  ankiTag,
  ankiTagsForCard,
  ankiTextExport,
  mergeAnkiTags
} from './ankiDeck.js'

const deck = {
  id: 'deck-1',
  title: 'Luz :: y peso',
  cards: [
    {
      id: 'card-a',
      coursePath: '/cursos/Studio - Product Lighting',
      source: 'Studio - Product Lighting · Key light',
      front: '¿Qué hace la <luz> de recorte?',
      back: 'Separa el objeto\tdel fondo.',
      image: { file: 'abc-123.png', alt: 'Recorte "fuerte"' }
    },
    { id: 'card-b', coursePath: '', front: '¿Peso?', back: 'Pie de atrás.', image: null },
    { id: 'card-c', front: '', back: 'Sin pregunta' }
  ]
}

describe('anki deck', () => {
  it('nests the deck under the parent and flattens ::', () => {
    assert.equal(ankiDeckName('Luz :: y peso'), 'Cursos::Luz - y peso')
    assert.equal(ankiDeckName('Solo', ''), 'Solo')
    assert.equal(ankiDeckName(''), 'Cursos::Tarjetas')
  })

  it('maps cards to escaped notes keyed by card id, with the image as media', () => {
    const notes = ankiNotesForDeck(deck)
    assert.equal(notes.length, 2)
    const [first, second] = notes
    assert.equal(first.cardId, 'card-a')
    assert.equal(first.fields.SourceId, 'card-a')
    assert.match(first.fields.Front, /&lt;luz&gt;/)
    assert.equal(first.media.name, 'pcl-abc-123.png')
    assert.match(first.fields.Image, /src="pcl-abc-123.png"/)
    assert.match(first.fields.Image, /alt="Recorte &quot;fuerte&quot;"/)
    assert.deepEqual(first.tags, ['course-library', 'pcl::studio-product-lighting'])
    assert.equal(first.modelName, 'Course Library Card')
    assert.equal(second.media, null)
    assert.equal(second.fields.Image, '')
  })

  it('writes an Anki text file with guids and lists the images to copy', () => {
    const { text, media } = ankiTextExport(deck)
    const lines = text.trim().split('\n')
    assert.ok(lines.includes('#guid column:1'))
    assert.ok(lines.includes('#notetype column:2'))
    assert.ok(lines.includes('#deck:Cursos::Luz - y peso'))
    const rows = lines.filter((line) => !line.startsWith('#'))
    assert.equal(rows.length, 2)
    assert.equal(rows[0].split('\t').length, 5)
    assert.match(rows[0], /^pcl-card-a\tBasic\t/)
    assert.match(rows[0], /Separa el objeto del fondo/)
    assert.deepEqual(media, [{ file: 'abc-123.png', name: 'pcl-abc-123.png' }])
  })

  it('builds a search for our note type and card ids', () => {
    const query = ankiSourceQuery(['a', 'b"c'])
    for (const model of Object.values(ANKI_MODELS))
      assert.ok(query.includes(`"note:${model.name}"`))
    assert.ok(query.endsWith('("SourceId:a" or "SourceId:bc")'))
    assert.equal(ankiSourceQuery([]), '')
  })

  it('makes tags without spaces or accents', () => {
    assert.equal(ankiTag('Diseño de Luz'), 'diseno-de-luz')
  })

  it('maps each card type to its note type and fields', () => {
    const notes = ankiNotesForDeck({
      title: 'Tipos',
      cards: [
        { id: 'r', type: 'reverse', front: 'Término', back: 'Definición' },
        { id: 't', type: 'typein', front: '¿Pie?', back: 'Atrás' },
        { id: 'c', type: 'cloze', front: 'La {{c1::luz}} <va>.', back: '' }
      ]
    })
    assert.deepEqual(
      notes.map((note) => note.modelName),
      ['Course Library Reverse', 'Course Library Type-in', 'Course Library Cloze']
    )
    assert.equal(notes[2].fields.Text, 'La {{c1::luz}} &lt;va&gt;.')
    assert.equal(notes[2].fields.Extra, '')
    const { text } = ankiTextExport({
      title: 'Tipos',
      cards: [{ id: 'c', type: 'cloze', front: 'La {{c1::luz}}.', back: 'x' }]
    })
    assert.match(text, /pcl-c\tCloze\tLa \{\{c1::luz\}\}\.\tx/)
  })

  it('nests tags by course and lesson and keeps the person own tags', () => {
    assert.deepEqual(
      ankiTagsForCard({ coursePath: '/c/Studio Lighting', lesson: 'Luz de relleno' }),
      ['course-library', 'pcl::studio-lighting::luz-de-relleno']
    )
    assert.deepEqual(
      mergeAnkiTags(
        ['marked', 'course-library', 'studio-lighting', 'pcl::old'],
        ['course-library', 'pcl::studio-lighting::x'],
        ['studio-lighting']
      ),
      ['marked', 'course-library', 'pcl::studio-lighting::x']
    )
  })
})

describe('anki code', () => {
  it('turns code blocks into <pre> and keeps cloze markers inside', () => {
    const html = ankiHtml('Escribe:\n```\nt = {{c1::time % loopTime}};\nif (a < b) x()\n```')
    assert.match(html, /^Escribe:<br><pre style="[^"]+"><code>/)
    assert.match(html, /t = \{\{c1::time % loopTime\}\};<br>if \(a &lt; b\) x\(\)<\/code><\/pre>/)
    assert.match(ankiHtml('Usa `linear()`'), /Usa <code style="[^"]+">linear\(\)<\/code>/)
    const { text } = ankiTextExport({
      id: 'd',
      title: 'Code',
      cards: [{ id: 'c1', type: 'basic', front: 'Loop?', back: '```\na\nb\n```' }]
    })
    assert.equal(
      text
        .trim()
        .split('\n')
        .filter((line) => !line.startsWith('#')).length,
      1
    )
  })
})
