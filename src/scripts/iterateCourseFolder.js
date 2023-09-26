const fs = require('fs')
const path = require('path')
// const { shell } = require('electron')

// shell.openPath(`/Volumes/MacWin/Cursos/_All Courses/${extension}`)

// "/Volumes/MacWin/Cursos/21Draw - Digital Illustration for Beginners by Laia Lopez"
courseList().forEach((extension) => {
  const courseProps = {
    title: extension.split(' - ')[1].trim(),
    programs: [],
    institution: extension.split(' - ')[0].trim(),
    instructor: ''
  }
  const jsonString = JSON.stringify(courseProps)
  fs.writeFile(`/Volumes/MacWin/Cursos/_All Courses/${extension}/courseProps.json`, jsonString, (err) => {
    if (err) {
      console.log('Error writing file', err)
    } else {
      console.log('Successfully wrote file')
    }
  })
})

export default function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, '/Volumes/MacWin/Cursos/_All Courses/'))
  return results
}
