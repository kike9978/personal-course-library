import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCurriculumPack, parsePlaylistPack, parseResearchPack } from './courseCoach.js'

const known = ['blender-fundamentals', 'maya-lighting']

describe('course coach paste', () => {
  it('reads JSON wrapped in prose and a fence', () => {
    const wrapped = parseResearchPack(
      'Aquí va el resultado:\n```json\n{"courses":[{"id":"blender-fundamentals","summary":"Modelado base","unverified":false}]}\n```\nListo.',
      known
    )
    assert.equal(wrapped.error, undefined)
    assert.deepEqual(wrapped.courses, [
      { id: 'blender-fundamentals', summary: 'Modelado base', unverified: false }
    ])
  })

  it('drops an unknown course id and keeps a known one', () => {
    const parsed = parseResearchPack(
      JSON.stringify({
        courses: [
          { id: 'not-in-the-library', summary: 'Inventado' },
          { id: 'maya-lighting', summary: 'Luces en escenas', unverified: true }
        ]
      }),
      known
    )
    assert.equal(parsed.error, undefined)
    assert.deepEqual(parsed.courses, [
      { id: 'maya-lighting', summary: 'Luces en escenas', unverified: true }
    ])
  })

  it('returns an error and no rows when nothing known survives', () => {
    const parsed = parsePlaylistPack(
      JSON.stringify({
        playlists: [{ title: 'Otra cosa', why: 'No está', courseIds: ['missing-course'] }]
      }),
      known
    )
    assert.match(parsed.error, /No se importó nada/)
    assert.deepEqual(parsed.playlists, [])

    const broken = parseResearchPack('esto no es json', known)
    assert.match(broken.error, /No se importó nada/)
    assert.deepEqual(broken.courses, [])
  })

  it('collapses duplicate ids inside a playlist', () => {
    const parsed = parsePlaylistPack(
      JSON.stringify({
        playlists: [
          {
            title: 'Luces',
            why: 'Misma materia',
            courseIds: ['maya-lighting', 'maya-lighting', 'blender-fundamentals', 'maya-lighting']
          }
        ]
      }),
      known
    )
    assert.equal(parsed.error, undefined)
    assert.deepEqual(parsed.playlists[0].courseIds, ['maya-lighting', 'blender-fundamentals'])
  })

  it('refuses a curriculum whose start is not in the path', () => {
    const parsed = parseCurriculumPack(
      JSON.stringify({
        title: 'Ruta de luces',
        why: 'Empezar por Maya',
        courseIds: ['blender-fundamentals', 'missing-course'],
        startId: 'maya-lighting',
        pace: 'Dos horas'
      }),
      known
    )
    assert.match(parsed.error, /El inicio no está en la ruta/)
    assert.equal(parsed.path, undefined)
  })
})
