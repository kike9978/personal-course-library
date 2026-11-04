import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { scanCourseAt } from './courseOutline.js'

function write(root, relativePath, contents = '') {
  const abs = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, contents)
}

describe('scanCourseAt', () => {
  it('keeps each folder that contains lessons as its own section', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-outline-'))
    write(root, 'opening.mp4', 'video')
    write(root, 'Part 1/01- Introduction/01-Anyone.mp4', 'video')
    write(root, 'Part 1/01- Introduction/01-Anyone.srt', '1')
    write(root, 'Part 1/02- Terminology/02-Terms.mp4', 'video')
    write(root, 'EXTRA PRODUCTS/Pipeline/Entries/0-preview-1.mp4', 'video')
    write(root, 'EXTRA PRODUCTS/Pipeline/Entries/1-Introduction.mp4', 'video')
    write(root, 'EXTRA PRODUCTS/Pipeline/pack.zip', 'zip')
    write(root, 'EXTRA PRODUCTS/Smear Files/ballsmear.mov', 'video')
    write(root, 'Materials/notes.pdf', 'pdf')
    write(root, 'courseProps.json', '{}')

    const tree = await scanCourseAt(root, 'Demo')
    assert.equal(tree.coursePath, 'Demo')

    const titles = tree.sections.map((section) => section.title)
    assert.deepEqual(titles, ['Inicio', 'EXTRA PRODUCTS', 'Part 1'])

    assert.deepEqual(
      tree.sections[0].lessons.map((lesson) => lesson.title),
      ['opening']
    )

    const extra = tree.sections[1]
    assert.equal(extra.lessons.length, 0)
    assert.deepEqual(
      extra.sections.map((section) => section.title),
      ['Pipeline', 'Smear Files']
    )
    const entries = extra.sections[0].sections[0]
    assert.equal(entries.title, 'Entries')
    assert.deepEqual(
      entries.lessons.map((lesson) => lesson.title),
      ['preview-1', 'Introduction']
    )
    assert.equal(
      extra.sections[0].resources.some((res) => res.name === 'pack.zip'),
      true
    )
    assert.equal(
      extra.sections[1].lessons[0].relativePath,
      'EXTRA PRODUCTS/Smear Files/ballsmear.mov'
    )

    const part = tree.sections[2]
    assert.equal(part.lessons.length, 0)
    assert.equal(part.sections[0].title, 'Introduction')
    assert.equal(part.sections[0].lessons[0].resources[0].kind, 'subtitle')
    assert.equal(part.sections[1].title, 'Terminology')

    assert.equal(
      tree.courseResources.some((res) => res.relativePath === 'Materials/notes.pdf'),
      true
    )
    assert.equal(tree.flatLessons[0].title, 'opening')
    assert.equal(tree.summary.lessonCount, tree.flatLessons.length)

    fs.rmSync(root, { recursive: true, force: true })
  })
})
