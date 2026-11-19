import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildProgressPage,
  currentStreak,
  keepWatchedSec,
  levelFromCompleted,
  longestStreak,
  watchedDelta
} from './progress.js'

const now = new Date(2026, 10, 19, 12)

describe('watched playback', () => {
  it('counts normal playback and double speed, and ignores seeks and pauses', () => {
    assert.equal(watchedDelta(10, 11, { playing: true, rate: 1 }), 1)
    assert.equal(watchedDelta(0, 3.5, { playing: true, rate: 2 }), 3.5)
    assert.equal(watchedDelta(0, 4.5, { playing: true, rate: 2 }), 0)
    assert.equal(watchedDelta(10, 14, { playing: true, rate: 1 }), 0)
    assert.equal(watchedDelta(10, 11, { playing: false, rate: 1 }), 0)
    assert.equal(watchedDelta(10, 11, { playing: true, seeking: true }), 0)
    assert.equal(watchedDelta(10, 11, { playing: true, scrubbing: true }), 0)
    assert.equal(watchedDelta(null, 1, { playing: true }), 0)
  })
})

describe('watch time across a lesson patch', () => {
  it('keeps local seconds when the incoming lesson has no watchedSec', () => {
    const incoming = { completed: true, positionSec: 10, durationSec: 10 }
    assert.equal(keepWatchedSec({ watchedSec: 40 }, incoming), 40)
    assert.equal(keepWatchedSec({ watchedSec: 40 }, { ...incoming, watchedSec: 0 }), 0)
    assert.equal(keepWatchedSec(undefined, incoming), 0)
  })
})

describe('progress page', () => {
  it('breaks the streak when today is missing and keeps the longest run', () => {
    assert.equal(currentStreak(['2026-11-18'], now), 0)
    assert.equal(currentStreak(['2026-11-18', '2026-11-19'], now), 2)
    assert.equal(longestStreak(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-21']), 3)
  })

  it('steps through the lesson thresholds', () => {
    assert.equal(levelFromCompleted(0).name, 'Beginner')
    assert.equal(levelFromCompleted(24).lessonsToNext, 1)
    assert.equal(levelFromCompleted(25).name, 'Explorer')
    assert.equal(levelFromCompleted(150).name, 'Achiever')
    assert.equal(levelFromCompleted(500).name, 'Master')
    assert.equal(levelFromCompleted(500).lessonsToNext, 0)
  })

  it('builds a year of weeks ending this week', () => {
    const page = buildProgressPage([], ['2026-11-19'], now)
    const { weeks } = page.heatmap
    assert.equal(weeks.length, 53)
    assert.equal(weeks[0].length, 7)
    const today = weeks.flat().find((day) => day.date === '2026-11-19')
    const tomorrow = weeks.flat().find((day) => day.date === '2026-11-20')
    assert.equal(today.active, true)
    assert.equal(tomorrow.future, true)
    assert.equal(tomorrow.active, false)
    assert.equal(page.heatmap.months.length, weeks.length)
  })

  it('counts a course in each of its themes and ignores lessons outside the playable list', () => {
    const page = buildProgressPage(
      [
        {
          path: 'draw',
          title: 'Draw',
          theme: ['Design', 'Art'],
          learning: {
            status: 'in_progress',
            playableLessons: [{ relativePath: 'a.mp4' }, { relativePath: 'b.mp4' }],
            lessons: {
              'a.mp4': { completed: true, watchedSec: 90 },
              'old.mp4': { completed: true, watchedSec: 500 }
            }
          }
        },
        {
          path: 'misc',
          title: 'Misc',
          theme: [],
          learning: {
            status: 'not_started',
            playableLessons: [{ relativePath: 'c.mp4' }],
            lessons: {}
          }
        }
      ],
      [],
      now
    )
    assert.equal(page.stats.completedLessons, 1)
    assert.equal(page.stats.totalLessons, 3)
    assert.equal(page.stats.watchedSec, 90)
    assert.equal(page.stats.watch.value, '2')
    assert.equal(page.stats.inProgressCourses, 1)
    const design = page.themes.find((theme) => theme.theme === 'Design')
    const art = page.themes.find((theme) => theme.theme === 'Art')
    const other = page.themes.find((theme) => theme.theme === 'Otros')
    assert.equal(design.completedLessons, 1)
    assert.equal(design.totalLessons, 2)
    assert.equal(art.courses, 1)
    assert.equal(other.totalLessons, 1)
    assert.equal(other.completedLessons, 0)
  })
})
