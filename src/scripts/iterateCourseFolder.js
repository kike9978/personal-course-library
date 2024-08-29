
const fs = require('fs')
const path = require('path')


export const extensions = {
  windows: 'E:\\Cursos\\_All Courses\\',
  macos: `/Volumes/MacWin/Cursos/_All Courses/`
}

export function readJSON(folderPath) {
  const letData = fs.readFileSync(path.join(folderPath, "courseProps.json"))
  let props = JSON.parse(letData)
  return props
}

export function getCourseInfo(extension) {
  const folderPath = path.join(extensions.windows, extension)
  const props = { ...getCourseInfo(folderPath), addedDate: getCourseDate(folderPath) }
  return props
}

function getCourseDate(folderPath) {
  fs.stat(folderPath, (err, stats) => {
    if (err) {
      console.error(err.message)
    }
    return stats.mtime
  })
}
export default function courseList() {
  const results = fs.readdirSync(path.resolve(`${extensions.windows}`))
  console.log(results)
  return results
}

// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez
