import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCourseCatalogDocument, stringifyCourseCatalog } from './courseExport.js'

describe('course catalog export', () => {
  it('writes course metadata and a compact progress snapshot', () => {
    const doc = buildCourseCatalogDocument(
      [
        {
          path: 'School - Lighting',
          title: 'Lighting',
          institution: 'School',
          instructor: 'Ada',
          programs: ['Blender', ''],
          theme: ['Lighting'],
          rate: 4.2,
          isInProcess: true,
          isIncomplete: false,
          hasCover: true,
          hasProps: true,
          missingProps: false,
          addedAt: Date.parse('2026-01-02T00:00:00.000Z'),
          folderMtimeMs: Date.parse('2026-02-03T00:00:00.000Z'),
          isNew: false,
          notesSearchText: 'should not leak',
          learning: {
            status: 'in_progress',
            percent: 40,
            completedCount: 2,
            playableCount: 5,
            lastLessonTitle: 'Key light',
            lastViewedAt: Date.parse('2026-03-04T00:00:00.000Z'),
            noteCount: 3,
            lessons: { huge: true },
            notes: [{ body: 'should not leak' }]
          }
        }
      ],
      { exportedAt: '2026-10-24T00:00:00.000Z' }
    )

    assert.equal(doc.exportedAt, '2026-10-24T00:00:00.000Z')
    assert.equal(doc.count, 1)
    assert.deepEqual(doc.courses[0], {
      folder: 'School - Lighting',
      title: 'Lighting',
      institution: 'School',
      instructor: 'Ada',
      programs: ['Blender'],
      theme: ['Lighting'],
      rate: 4,
      isInProcess: true,
      isIncomplete: false,
      hasCover: true,
      hasProps: true,
      addedAt: '2026-01-02T00:00:00.000Z',
      modifiedAt: '2026-02-03T00:00:00.000Z',
      isNew: false,
      progress: {
        status: 'in_progress',
        percent: 40,
        completedCount: 2,
        playableCount: 5,
        lastLessonTitle: 'Key light',
        lastViewedAt: '2026-03-04T00:00:00.000Z',
        noteCount: 3
      }
    })
    assert.equal('notesSearchText' in doc.courses[0], false)
    assert.equal('lessons' in doc.courses[0].progress, false)
    assert.equal('notes' in doc.courses[0].progress, false)
  })

  it('keeps a folder that has no courseProps file', () => {
    const doc = buildCourseCatalogDocument(
      [
        {
          path: 'Academia - Titulo',
          title: 'Titulo',
          institution: 'Academia',
          missingProps: true,
          hasProps: false,
          learning: null
        }
      ],
      { exportedAt: '2026-10-24T00:00:00.000Z' }
    )

    assert.equal(doc.courses[0].hasProps, false)
    assert.equal(doc.courses[0].title, 'Titulo')
    assert.equal(doc.courses[0].progress, null)
    assert.equal(doc.courses[0].addedAt, null)
  })

  it('stringifies pretty JSON with a trailing newline', () => {
    const text = stringifyCourseCatalog([], { exportedAt: '2026-10-24T00:00:00.000Z' })
    assert.equal(text.endsWith('\n'), true)
    assert.deepEqual(JSON.parse(text), {
      exportedAt: '2026-10-24T00:00:00.000Z',
      count: 0,
      courses: []
    })
  })
})
