import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cierreSubjectKey,
  findCierreForSubject,
  flattenOutline,
  normalizeCierreInput,
  normalizeCommentBody
} from './cierres.js'

describe('normalizeCierreInput', () => {
  it('requires a course, a subject, and what was learned', () => {
    assert.throws(() => normalizeCierreInput({ title: 'Pieza', learned: 'Vi la luz' }), /curso/)
    assert.throws(
      () => normalizeCierreInput({ coursePath: 'curso', title: 'Pieza', learned: 'Vi la luz' }),
      /proyecto o una lección/
    )
    assert.throws(
      () =>
        normalizeCierreInput({
          coursePath: 'curso',
          projectId: 'p1',
          title: 'Pieza',
          learned: '   '
        }),
      /aprendiste/
    )
  })

  it('keeps a project cierre and an optional lesson anchor', () => {
    const next = normalizeCierreInput({
      coursePath: 'library/Motion',
      projectId: 'p1',
      projectTitle: 'Cartel',
      lessonRelativePath: 'week-1/shot.mp4',
      title: 'Cartel final',
      learned: 'El contraste manda.',
      differently: 'Menos texto.',
      coverUrl: 'https://example.com/nope.png',
      sectionId: 'week-1',
      sectionTitle: 'Semana 1'
    })
    assert.equal(next.coursePath, 'Motion')
    assert.equal(next.projectId, 'p1')
    assert.equal(next.lessonRelativePath, 'week-1/shot.mp4')
    assert.equal(next.differently, 'Menos texto.')
    assert.equal(next.coverUrl, null)
    assert.equal(next.sectionTitle, 'Semana 1')
  })

  it('rejects a lesson path that leaves the course', () => {
    assert.throws(
      () =>
        normalizeCierreInput({
          coursePath: 'curso',
          lessonRelativePath: '../secret.mp4',
          title: 'Pieza',
          learned: 'Algo'
        }),
      /proyecto o una lección/
    )
  })

  it('accepts a note-media cover', () => {
    const next = normalizeCierreInput({
      coursePath: 'curso',
      lessonRelativePath: 'a.mp4',
      title: 'Pieza',
      learned: 'Algo',
      coverUrl: 'course-media://note/?file=abc.png'
    })
    assert.equal(next.coverUrl, 'course-media://note/?file=abc.png')
  })
})

describe('findCierreForSubject', () => {
  const cierres = [
    { coursePath: 'Motion', projectId: 'p1', lessonRelativePath: 'a.mp4' },
    { coursePath: 'Motion', projectId: null, lessonRelativePath: 'b.mp4' }
  ]

  it('matches a project even when a lesson path is also stored', () => {
    const found = findCierreForSubject(cierres, { coursePath: 'Motion', projectId: 'p1' })
    assert.equal(found.projectId, 'p1')
  })

  it('matches a lesson cierre only when it is not a project', () => {
    assert.equal(
      findCierreForSubject(cierres, { coursePath: 'Motion', lessonRelativePath: 'a.mp4' }),
      null
    )
    assert.equal(
      findCierreForSubject(cierres, { coursePath: 'Motion', lessonRelativePath: 'b.mp4' })
        .lessonRelativePath,
      'b.mp4'
    )
  })

  it('builds a stable subject key', () => {
    assert.equal(
      cierreSubjectKey({ coursePath: 'Motion', projectId: 'p1', lessonRelativePath: 'a.mp4' }),
      'Motion\0project\0p1'
    )
  })
})

describe('normalizeCommentBody', () => {
  it('rejects an empty follow-up', () => {
    assert.throws(() => normalizeCommentBody('   '), /vacío/)
  })
})

describe('flattenOutline', () => {
  it('skips the root bucket and keeps nested weeks', () => {
    const rows = flattenOutline([
      { id: '__root__', title: 'Inicio', sections: [] },
      {
        id: 'w1',
        title: 'Semana 1',
        sections: [{ id: 'w1b', title: 'Forma', sections: [] }]
      }
    ])
    assert.deepEqual(
      rows.map((row) => row.label),
      ['Semana 1', 'Semana 1 / Forma']
    )
  })
})
