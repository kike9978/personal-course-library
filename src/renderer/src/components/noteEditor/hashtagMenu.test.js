import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findHashtagMatch,
  hashTrigger,
  hashtagMenuItems,
  hashtagToken,
  matchHashtagExceptCaret
} from './hashtagMenu.js'

describe('hashtag menu', () => {
  it('opens on # and keeps the typed tag as the query', () => {
    assert.equal(hashTrigger('buenas noches'), null)
    assert.equal(hashTrigger('# Heading'), null)
    const typed = hashTrigger('#f')
    assert.equal(typed.matchingString, 'f')
    assert.equal(typed.replaceableString, '#f')
    assert.equal(typed.leadOffset, 0)
    const mid = hashTrigger('ver #ap')
    assert.equal(mid.matchingString, 'ap')
    assert.equal(mid.leadOffset, 4)
  })

  it('does not treat a markdown heading as a hashtag', () => {
    assert.equal(findHashtagMatch('# Heading'), null)
    assert.deepEqual(findHashtagMatch('Idea #appeal'), { start: 5, end: 12 })
  })

  it('leaves the hashtag under the caret as plain text', () => {
    const text = 'Idea #appeal'
    const match = findHashtagMatch(text)
    assert.equal(matchHashtagExceptCaret(text, { nodeText: text, offset: 12 }), null)
    assert.deepEqual(matchHashtagExceptCaret(text, { nodeText: text, offset: 4 }), match)
    assert.deepEqual(matchHashtagExceptCaret(text, null), match)
  })

  it('lists matching topics and offers to create a new one', () => {
    const items = [
      { type: 'topic', id: '1', title: 'appeal' },
      { type: 'topic', id: '2', title: 'hola' },
      { type: 'note', id: 'n', title: 'appeal note' },
      { type: 'topic', id: '3', title: 'Buenas noches' }
    ]
    const filtered = hashtagMenuItems(items, 'ap', { canCreate: true })
    assert.deepEqual(
      filtered.map((item) => item.title),
      ['appeal', 'ap']
    )
    assert.equal(filtered[1].subtitle, 'Crear tema')
    assert.equal(filtered[1].create, true)
    const exact = hashtagMenuItems(items, 'appeal', { canCreate: true })
    assert.deepEqual(
      exact.map((item) => item.title),
      ['appeal']
    )
    assert.equal(hashtagToken('appeal'), 'appeal')
    assert.equal(hashtagToken('Buenas noches'), '')
  })

  it('lists every program and skips names that are already topics', () => {
    const items = [{ type: 'topic', id: '1', title: 'appeal' }]
    const rows = hashtagMenuItems(items, '', {
      programs: ['appeal', 'Data Science', 'Python', 'Data Science']
    })
    assert.deepEqual(
      rows.map((item) => [item.title, item.subtitle]),
      [
        ['appeal', 'Tema'],
        ['Data Science', 'Programa'],
        ['Python', 'Programa']
      ]
    )
    const filtered = hashtagMenuItems(items, 'py', {
      canCreate: true,
      programs: ['Python', 'Data Science']
    })
    assert.deepEqual(
      filtered.map((item) => item.title),
      ['Python', 'py']
    )
    assert.equal(filtered[0].subtitle, 'Programa')
  })
})
