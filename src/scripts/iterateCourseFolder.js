import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')
const path = require('path')

export const extensions = {
  windows: 'E:\\Cursos\\_All Courses\\',
  macos: `/Volumes/MacWin/Cursos/_All Courses/`
}

export function readJSON(extension) {
  const letData = fs.readFileSync(`${extensions.macos}${extension}/courseProps.json`)
  let props = JSON.parse(letData)
  return props
}

export function courseList() {
  const results = fs.readdirSync(path.resolve(`${extensions.macos}`))
  return results
}

// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez
