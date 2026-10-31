/**
 * One-shot CLI to generate courseProps.json for each course folder.
 * Usage: node src/scripts/jsonGenerator.js "/path/to/_All Courses"
 */
const fs = require('fs')
const path = require('path')

const possiblePrograms = [
  'Photoshop',
  'Cinema4D',
  'illustrator',
  'After Effects',
  'Blender',
  'Maya',
  'DaVinci Resolve',
  'ZBrush',
  'VS Code'
]

const libraryPath = process.argv[2]

if (!libraryPath) {
  console.error('Usage: node src/scripts/jsonGenerator.js "/path/to/courses"')
  process.exit(1)
}

if (!fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
  console.error(`Not a directory: ${libraryPath}`)
  process.exit(1)
}

function addProgramsToObject(extension) {
  return possiblePrograms.filter((program) =>
    extension.toLowerCase().includes(program.toLowerCase())
  )
}

const dirs = fs
  .readdirSync(libraryPath)
  .filter((name) => fs.statSync(path.join(libraryPath, name)).isDirectory())

dirs.forEach((extension) => {
  const parts = extension.split(' - ')
  const courseProps = {
    title: (parts[1] || extension).trim(),
    programs: addProgramsToObject(extension),
    theme: [],
    institution: (parts[0] || '').trim(),
    instructor: '',
    isIncomplete: false,
    isInProcess: false,
    hide: false,
    rate: 0,
    description: null
  }
  const outputPath = path.join(libraryPath, extension, 'courseProps.json')
  if (fs.existsSync(outputPath)) {
    console.log(`Skip (exists): ${extension}`)
    return
  }
  fs.writeFileSync(outputPath, JSON.stringify(courseProps, null, 2), 'utf8')
  console.log(`Wrote: ${outputPath}`)
})
