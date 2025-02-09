const fs = require('fs')
const path = require('path')

// Remove platform-specific paths and use dynamic detection
export const basePath = process.platform === 'darwin' 
  ? '/Volumes/MacWin/Cursos/_All Courses/'
  : 'E:\\Cursos\\_All Courses\\'

export function readJSON(courseDir) {
  const filePath = path.join(basePath, courseDir, 'courseProps.json')
  const rawData = fs.readFileSync(filePath)
  return JSON.parse(rawData)
}

export default function courseList() {
  return fs.readdirSync(basePath).filter(dir => {
    // Filter out system files and ensure it's a directory
    return fs.statSync(path.join(basePath, dir)).isDirectory()
  })
}

// /Volumes/MacWin/Cursos/_All Courses/21Draw - Digital Illustration for Beginners by Laia Lopez
