const fs = require('fs')
const path = require('path')

export const extensions = {
  windows: 'E:\\Cursos\\_All Courses\\',
  macos: `/Volumes/MacWin/Cursos/_All Courses/`
}

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

function addProgramsToObject(extension) {
  const programsList = []
  possiblePrograms.forEach((program) => {
    if (extension.toLowerCase().includes(program.toLowerCase())) {
      programsList.push(program)
    }
  })
  return programsList
}

courseList().forEach((extension) => {
  const courseProps = {
    title: extension.split(' - ')[1].trim(),
    programs: addProgramsToObject(extension),
    theme: [],
    institution: extension.split(' - ')[0].trim(),
    instructor: ''
  }
  const jsonString = JSON.stringify(courseProps)
  fs.writeFileSync(`'${extensions.windows}${extension}/courseProps.json'`, jsonString, (err) => {
    if (err) {
      console.log('Error writing file', err)
    } else {
      console.log('Successfully wrote file')
    }
  })
})
export function readJSON(extension) {
  const letData = fs.readFileSync(`'${extensions.windows}${extension}/courseProps.json'`)
  let props = JSON.parse(letData)
  return props
}

export default function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, `'${extensions.windows}'`))
  return results
}

// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez
