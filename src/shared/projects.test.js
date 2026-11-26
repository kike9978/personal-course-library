import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  completedAt,
  groupByCompletionMonth,
  isStale,
  sortColumn,
  sortIndexBetween,
  statusEnteredAt
} from './projects.js'

const DAY = 24 * 60 * 60 * 1000

test('sortColumn puts hand-ordered cards by index and others newest first', () => {
  const a = { id: 'a', updatedAt: 100 }
  const b = { id: 'b', updatedAt: 300 }
  const c = { id: 'c', updatedAt: 200 }
  assert.deepEqual(
    sortColumn([a, b, c]).map((p) => p.id),
    ['b', 'c', 'a']
  )
  const pinned = { id: 'p', updatedAt: 1, sortIndex: -1000 }
  assert.equal(sortColumn([a, b, pinned])[0].id, 'p')
})

test('sortIndexBetween lands strictly between neighbours', () => {
  const before = { sortIndex: 1 }
  const after = { sortIndex: 2 }
  assert.equal(sortIndexBetween(before, after), 1.5)
  assert.equal(sortIndexBetween(null, after), 1)
  assert.equal(sortIndexBetween(before, null), 2)
  assert.equal(sortIndexBetween(null, null), 0)
  const older = { updatedAt: 100 }
  const newer = { updatedAt: 300 }
  const between = sortIndexBetween(newer, older)
  const sorted = sortColumn([older, newer, { id: 'x', sortIndex: between }])
  assert.equal(sorted[1].id, 'x')
})

test('statusEnteredAt and completedAt read the latest matching history entry', () => {
  const project = {
    status: 'done',
    updatedAt: 999,
    statusHistory: [
      { status: 'todo', at: 1 },
      { status: 'done', at: 5 },
      { status: 'in_progress', at: 6 },
      { status: 'done', at: 9 }
    ]
  }
  assert.equal(statusEnteredAt(project), 9)
  assert.equal(statusEnteredAt(project, 'in_progress'), 6)
  assert.equal(completedAt(project), 9)
  assert.equal(completedAt({ updatedAt: 42 }), 42)
})

test('isStale only flags en curso projects idle for two weeks', () => {
  const now = 100 * DAY
  assert.equal(isStale({ status: 'in_progress', updatedAt: now - 15 * DAY }, now), true)
  assert.equal(isStale({ status: 'in_progress', updatedAt: now - 2 * DAY }, now), false)
  assert.equal(isStale({ status: 'todo', updatedAt: now - 40 * DAY }, now), false)
})

test('groupByCompletionMonth groups newest month first', () => {
  const now = new Date(2026, 10, 20).getTime()
  const groups = groupByCompletionMonth(
    [
      { id: 'oct', statusHistory: [{ status: 'done', at: new Date(2026, 9, 3).getTime() }] },
      { id: 'nov1', statusHistory: [{ status: 'done', at: new Date(2026, 10, 2).getTime() }] },
      { id: 'nov2', statusHistory: [{ status: 'done', at: new Date(2026, 10, 15).getTime() }] },
      { id: 'old', statusHistory: [{ status: 'done', at: new Date(2025, 0, 1).getTime() }] }
    ],
    now
  )
  assert.deepEqual(
    groups.map((g) => g.key),
    ['2026-11', '2026-10', '2025-01']
  )
  assert.deepEqual(
    groups[0].items.map((p) => p.id),
    ['nov2', 'nov1']
  )
  assert.match(groups[2].label, /2025/)
  assert.doesNotMatch(groups[0].label, /2026/)
})
