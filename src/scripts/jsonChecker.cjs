// import {courseList, extensions} from "./iterateCourseFolder"
const fs = require('fs')
const path = require('path')
const extensions = {
  windows: 'E:\\Cursos\\_All Courses\\',
  macos: `/Volumes/MacWin/Cursos/_All Courses/`
}

function courseList() {
  const results = fs.readdirSync(path.resolve(__dirname, `${extensions.macos}`))
  return results
}

courseList().forEach((extension) => {
  console.log(fs.existsSync(`${extensions.macos}${extension}/courseProps.json`))
  // console.log(fs.exists(`${extensions.macos}${extension}/courseProps.json`))
})
