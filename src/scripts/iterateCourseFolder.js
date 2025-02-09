const fs = require('fs')
const path = require('path')

// Set base path based on platform
export const basePath = (() => {
  if (process.platform === 'darwin') {
    return '/Volumes/MacWin/Cursos/_All Courses/'
  } else if (process.platform === 'win32') {
    return 'E:\\Cursos\\_All Courses\\'
  } else {
    // WSL2/Linux path
    return '/mnt/e/Cursos/_All Courses/'
  }
})()

console.log(`Base path used: ${basePath}`) // Log the base path

export function readJSON(courseDir) {
  try {
    const filePath = path.join(basePath, courseDir, 'courseProps.json')
    console.log(`Attempting to read JSON from: ${filePath}`) // Debug log
    if (!fs.existsSync(filePath)) {
      throw new Error(`Course config not found: ${filePath}`)
    }
    const rawData = fs.readFileSync(filePath)
    return JSON.parse(rawData)
  } catch (error) {
    throw new Error(`Failed to read course data for ${courseDir}: ${error.message}`)
  }
}

export function courseList() {
  try {
    console.log(`Checking courses directory at: ${basePath}`)
    if (!fs.existsSync(basePath)) {
      throw new Error(`Courses directory not found: ${basePath}`)
    }
    
    const dirs = fs.readdirSync(basePath)
    console.log(`Found ${dirs.length} items in directory: ${dirs.join(', ')}`) // Debug log
    
    return dirs.filter(dir => {
      const fullPath = path.join(basePath, dir)
      try {
        const isDir = fs.statSync(fullPath).isDirectory()
        console.log(`Checking ${fullPath}: ${isDir ? 'Directory' : 'File'}`) // Debug log
        return isDir
      } catch (error) {
        throw new Error(`Error accessing ${dir}: ${error.message}`)
      }
    })
  } catch (error) {
    throw new Error(`Failed to list courses: ${error.message}`)
  }
}

export function iterateCourseFolder() {
  // Return an empty array or implement your logic to return an array of course names
  return []; // Placeholder for now
}
