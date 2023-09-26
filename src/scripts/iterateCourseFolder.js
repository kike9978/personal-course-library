const fs = require('fs')
const path = require('path')

courseList().forEach((extension) => {
  const courseProps = {
    title: extension.split(' - ')[1].trim(),
    programs: [],
    institution: extension.split(' - ')[0].trim(),
    instructor: ''
  }
  const jsonString = JSON.stringify(courseProps)
  fs.writeFileSync(
    `/Volumes/MacWin/Cursos/_All Courses/${extension}/courseProps.json`,
    jsonString,
    (err) => {
      if (err) {
        console.log('Error writing file', err)
      } else {
        console.log('Successfully wrote file')
      }
    }
  )
})
export function readJSON(extension) {
  const letData = fs.readFileSync(
    `/Volumes/MacWin/Cursos/_All Courses/${extension}/courseProps.json`
  )
  let props = JSON.parse(letData)
  return props
}

export default function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, '/Volumes/MacWin/Cursos/_All Courses/'))
  return results
}


// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez