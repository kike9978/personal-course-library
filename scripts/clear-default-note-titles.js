import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  clearDefaultNoteTitles,
  isDefaultNoteTitle,
  noteTextTitle
} from '../src/shared/knowledgeGraph.js'

/**
 * Drop stored "new note" titles from learning-store.json.
 * The clock stays on the note. The name comes from the words in the body.
 *
 *   bun scripts/clear-default-note-titles.js
 *   bun scripts/clear-default-note-titles.js --dry-run
 *   bun scripts/clear-default-note-titles.js --path /path/to/learning-store.json
 */

function discoverStores() {
  const found = []
  const add = (file) => {
    if (file && fs.existsSync(file)) found.push(path.resolve(file))
  }
  add(path.join(os.homedir(), '.config', 'personal-course-library', 'learning-store.json'))
  if (process.env.APPDATA) {
    add(path.join(process.env.APPDATA, 'personal-course-library', 'learning-store.json'))
  }
  const users = '/mnt/c/Users'
  if (fs.existsSync(users)) {
    for (const name of fs.readdirSync(users)) {
      if (name.startsWith('.') || ['Public', 'Default', 'Default User', 'All Users'].includes(name)) {
        continue
      }
      add(
        path.join(users, name, 'AppData', 'Roaming', 'personal-course-library', 'learning-store.json')
      )
    }
  }
  return [...new Set(found)]
}

function backupPath(file) {
  const bak = `${file}.bak`
  if (!fs.existsSync(bak)) return bak
  return `${file}.bak-${Date.now()}`
}

function rewrite(file, { dryRun }) {
  const store = JSON.parse(fs.readFileSync(file, 'utf8'))
  const findings = Array.isArray(store.findings) ? store.findings : []
  const planned = findings.filter((note) => isDefaultNoteTitle(note?.title))
  console.log(file)
  if (!planned.length) {
    console.log('  no placeholder titles')
    return 0
  }
  for (const note of planned) {
    const next = noteTextTitle(note) || '(sin texto)'
    console.log(`  ${note.title} → ${next}`)
  }
  if (dryRun) {
    console.log(`  dry run, ${planned.length} left in place`)
    return planned.length
  }
  const changed = clearDefaultNoteTitles(findings)
  const bak = backupPath(file)
  fs.copyFileSync(file, bak)
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`)
  console.log(`  cleared ${changed}, backup ${bak}`)
  return changed
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const pathFlag = args.indexOf('--path')
const files = pathFlag >= 0 ? [args[pathFlag + 1]].filter(Boolean) : discoverStores()

if (!files.length) {
  console.error('No learning-store.json found. Pass --path.')
  process.exit(1)
}

let total = 0
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}`)
    process.exit(1)
  }
  total += rewrite(file, { dryRun })
}
console.log(dryRun ? `Would clear ${total}` : `Cleared ${total}`)
