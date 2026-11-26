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
  it('numbers lessons split into parts that share a title', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-outline-'))
    write(root, 'S/10-1. Blocking out the Face.mp4', 'v')
    write(root, 'S/10-2. Blocking out the Face.mp4', 'v')
    write(root, 'S/10-3. Blocking out the Face.mp4', 'v')
    write(root, 'S/11-1. Polishing the Face.mp4', 'v')
    write(root, 'S/11-2. Polishing the Face.mp4', 'v')
    write(root, 'S/14. Finalizing the Hair.mp4', 'v')

    const tree = await scanCourseAt(root, 'Demo')
    assert.deepEqual(
      tree.sections[0].lessons.map((lesson) => lesson.title),
      [
        'Blocking out the Face (Parte 1/3)',
        'Blocking out the Face (Parte 2/3)',
        'Blocking out the Face (Parte 3/3)',
        'Polishing the Face (Parte 1/2)',
        'Polishing the Face (Parte 2/2)',
        'Finalizing the Hair'
      ]
    )
  })

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
    assert.equal(part.sections[0].title, '01- Introduction')
    assert.equal(part.sections[0].lessons[0].resources[0].kind, 'subtitle')
    assert.equal(part.sections[1].title, '02- Terminology')

    const materials = tree.courseResourceSections.find((section) => section.title === 'Materials')
    assert.equal(materials.resources[0].relativePath, 'Materials/notes.pdf')
    assert.equal(
      tree.courseResources.some((res) => res.relativePath === 'Materials/notes.pdf'),
      false
    )
    assert.equal(tree.flatLessons[0].title, 'opening')
    assert.equal(tree.summary.lessonCount, tree.flatLessons.length)

    fs.rmSync(root, { recursive: true, force: true })
  })

  it('attaches subtitles whose basename adds a language suffix', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-outline-'))
    write(root, '01-Anyone.mp4', 'video')
    write(root, '01-Anyone.en.srt', '1')
    write(root, 'Chapter/02-Terms.mp4', 'video')
    write(root, 'Chapter/Subtitles/02-Terms.es-419.vtt', 'WEBVTT')
    write(root, 'Chapter/Subtitles/02-Terms.pt-BR.srt', '1')
    write(root, '03-Exact.mp4', 'video')
    write(root, '03-Exact.en.mp4', 'video')
    write(root, '03-Exact.en.srt', '1')

    const tree = await scanCourseAt(root, 'Demo')
    const byPath = new Map(tree.flatLessons.map((lesson) => [lesson.relativePath, lesson]))

    assert.deepEqual(
      byPath.get('01-Anyone.mp4').resources.map((res) => res.name),
      ['01-Anyone.en.srt']
    )
    assert.deepEqual(
      byPath
        .get('Chapter/02-Terms.mp4')
        .resources.map((res) => res.name)
        .sort(),
      ['02-Terms.es-419.vtt', '02-Terms.pt-BR.srt']
    )
    assert.deepEqual(
      byPath.get('03-Exact.en.mp4').resources.map((res) => res.name),
      ['03-Exact.en.srt']
    )
    assert.equal(byPath.get('03-Exact.mp4').resources.length, 0)

    fs.rmSync(root, { recursive: true, force: true })
  })

  it('attaches numbered language packs and keeps folder labels', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-outline-'))
    write(root, '01. Chapter/01. Intro.mp4', 'video')
    write(root, '02. Chapter/01. Next.mp4', 'video')
    write(root, '03. Chapter/03. Clip.mp4', 'video')
    write(root, '04. Outro/04.mp4', 'video')
    write(root, '04. Outro/04-ko.srt', '1')
    write(root, 'Subtitles/Korean (Original)/01. Intro.srt', '1')
    write(root, 'Subtitles/Korean (Original)/01. Next.srt', '1')
    write(root, 'Subtitles/Korean (Original)/03.srt', '1')
    write(root, 'Subtitles/English (Machine Translated)/01_en.srt', '1')
    write(root, 'Subtitles/English (Machine Translated)/02_en.srt', '1')
    write(root, 'Subtitles/English (Machine Translated)/03_en.srt', '1')

    const tree = await scanCourseAt(root, 'Coloso')
    const byPath = new Map(tree.flatLessons.map((lesson) => [lesson.relativePath, lesson]))

    const intro = byPath.get('01. Chapter/01. Intro.mp4').resources
    assert.deepEqual(
      intro.map((res) => [res.name, res.lang, res.label]).sort(),
      [
        ['01. Intro.srt', 'ko', 'Korean (Original)'],
        ['01_en.srt', 'en', 'English (Machine Translated)']
      ]
    )

    const next = byPath.get('02. Chapter/01. Next.mp4').resources
    assert.deepEqual(
      next.map((res) => [res.name, res.lang, res.label]).sort(),
      [
        ['01. Next.srt', 'ko', 'Korean (Original)'],
        ['02_en.srt', 'en', 'English (Machine Translated)']
      ]
    )

    const clip = byPath.get('03. Chapter/03. Clip.mp4').resources
    assert.deepEqual(
      clip.map((res) => res.name).sort(),
      ['03.srt', '03_en.srt']
    )
    assert.equal(clip.find((res) => res.name === '03.srt').lang, 'ko')
    assert.equal(clip.find((res) => res.name === '03_en.srt').label, 'English (Machine Translated)')

    assert.deepEqual(
      byPath.get('04. Outro/04.mp4').resources.map((res) => [res.name, res.lang, res.label]),
      [['04-ko.srt', 'ko', 'Korean']]
    )

    fs.rmSync(root, { recursive: true, force: true })
  })

  it('keeps folder names and nests resource-only folders', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-outline-'))
    write(root, '1. Expressions Basics/lesson.mp4', 'video')
    write(root, '1. Expressions Basics/Expr_LS01/notes.pdf', 'pdf')
    write(root, '11. Scripting. Part 1/clip.mp4', 'video')
    write(root, '0. Introduction/intro.txt', 'txt')
    write(root, '0. Introduction/Motion Tools 2/script_instruction.pdf', 'pdf')
    write(root, 'loose.txt', 'txt')

    const tree = await scanCourseAt(root, 'Demo')
    const titles = tree.sections.map((section) => section.title)
    assert.deepEqual(titles, ['1. Expressions Basics', '11. Scripting. Part 1'])

    const basics = tree.sections[0]
    assert.equal(basics.sections.length, 0)
    assert.equal(
      basics.resources.some((res) => res.relativePath === '1. Expressions Basics/Expr_LS01/notes.pdf'),
      true
    )

    assert.equal(tree.courseResourceSections.length, 1)
    const intro = tree.courseResourceSections[0]
    assert.equal(intro.title, '0. Introduction')
    assert.deepEqual(
      intro.resources.map((res) => res.relativePath),
      ['0. Introduction/intro.txt']
    )
    assert.equal(intro.sections[0].title, 'Motion Tools 2')
    assert.equal(intro.sections[0].resources[0].name, 'script_instruction.pdf')
    assert.deepEqual(
      tree.courseResources.map((res) => res.relativePath),
      ['loose.txt']
    )

    fs.rmSync(root, { recursive: true, force: true })
  })
})
