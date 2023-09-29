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

const institutionList = [
  '21Draw',
  'Juice',
  'AJ & SMART and JAKE KNAPP',
  'Alive!',
  'Art Challenge',
  'Art-Wod',
  'ArtOfSteveAhn',
  'ArtStation',
  'Artstation',
  'Awwwards',
  'Building a Second Brain',
  'CGCookie',
  'CGMA',
  'Character Creation in Blender',
  'Cineversity',
  'Class101',
  'Creative Shrimp',
  'Domestika',
  'Fireship-io',
  'Foundation Patreon',
  'Greyscalegorilla Plus',
  'Gumroad',
  'Holdframe + School of Motion',
  'James Douglas (moderndayjames)',
  'Learn Squared',
  'Masterclass',
  'Meds Map',
  'MedsMap',
  'Mograph Mentor',
  'Motion Design School',
  'New Master Academy',
  'Phlearn',
  'Pluralsight',
  'Polygon Runway',
  'Project City',
  'Proko',
  'Rad How To Class',
  'Rad How to Class',
  'Ross Draws Bootcamp',
  'School of Motion',
  'Schoolism',
  'Second Brain',
  'SkillShare',
  'Skillshare',
  'Stylized Station',
  'SuperHi',
  'Test',
  'The Futur',
  'The Gnomon Workshop',
  'Udemy',
  'Watts Atelier',
  'Wingfox'
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
    instructor: '',
    isIncomplete: false,
    isInProcess: false,
    rate: 0
  }
  const jsonString = JSON.stringify(courseProps)
  fs.writeFileSync(`${extensions.macos}${extension}/courseProps.json`, jsonString, (err) => {
    if (err) {
      console.log('Error writing file', err)
    } else {
      console.log('Successfully wrote file')
    }
  })
})
export function readJSON(extension) {
  const letData = fs.readFileSync(`${extensions.macos}${extension}/courseProps.json`)
  let props = JSON.parse(letData)
  return props
}

export default function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, `${extensions.macos}`))
  return results
}

// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez
