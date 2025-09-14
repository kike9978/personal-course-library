const fs = require('fs').promises
const fsSync = require('fs')
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

// File cache with LRU-like behavior (simple Map for now)
const fileCache = new Map()
const CACHE_SIZE = 100

function addToCache(key, value) {
  if (fileCache.size >= CACHE_SIZE) {
    // Remove oldest entry (simple FIFO)
    const firstKey = fileCache.keys().next().value
    fileCache.delete(firstKey)
  }
  fileCache.set(key, value)
}

export async function readJSONAsync(courseDir) {
  try {
    const filePath = path.join(basePath, courseDir, 'courseProps.json')
    const cacheKey = filePath

    // Check cache first
    if (fileCache.has(cacheKey)) {
      return fileCache.get(cacheKey)
    }

    console.log(`Attempting to read JSON from: ${filePath}`) // Debug log
    if (!fsSync.existsSync(filePath)) {
      throw new Error(`Course config not found: ${filePath}`)
    }

    const rawData = await fs.readFile(filePath, 'utf8')
    const parsedData = JSON.parse(rawData)

    // Cache the result
    addToCache(cacheKey, parsedData)

    return parsedData
  } catch (error) {
    throw new Error(`Failed to read course data for ${courseDir}: ${error.message}`)
  }
}

// Keep sync version for backward compatibility, but use cache
export function readJSON(courseDir) {
  try {
    const filePath = path.join(basePath, courseDir, 'courseProps.json')
    const cacheKey = filePath

    // Check cache first
    if (fileCache.has(cacheKey)) {
      return fileCache.get(cacheKey)
    }

    console.log(`Attempting to read JSON from: ${filePath}`) // Debug log
    if (!fsSync.existsSync(filePath)) {
      throw new Error(`Course config not found: ${filePath}`)
    }

    const rawData = fsSync.readFileSync(filePath, 'utf8')
    const parsedData = JSON.parse(rawData)

    // Cache the result
    addToCache(cacheKey, parsedData)

    return parsedData
  } catch (error) {
    throw new Error(`Failed to read course data for ${courseDir}: ${error.message}`)
  }
}

export async function courseListAsync() {
  try {
    console.log(`Checking courses directory at: ${basePath}`)
    if (!fsSync.existsSync(basePath)) {
      throw new Error(`Courses directory not found: ${basePath}`)
    }

    const dirs = await fs.readdir(basePath)
    console.log(`Found ${dirs.length} items in directory: ${dirs.join(', ')}`) // Debug log

    const filteredDirs = []
    for (const dir of dirs) {
      const fullPath = path.join(basePath, dir)
      try {
        const stat = await fs.stat(fullPath)
        const isDir = stat.isDirectory()
        console.log(`Checking ${fullPath}: ${isDir ? 'Directory' : 'File'}`) // Debug log
        if (isDir) {
          filteredDirs.push(dir)
        }
      } catch (error) {
        console.warn(`Error accessing ${dir}: ${error.message}`)
        // Continue with other directories
      }
    }

    return filteredDirs
  } catch (error) {
    throw new Error(`Failed to list courses: ${error.message}`)
  }
}

// Keep sync version for backward compatibility
export function courseList() {
  try {
    console.log(`Checking courses directory at: ${basePath}`)
    if (!fsSync.existsSync(basePath)) {
      throw new Error(`Courses directory not found: ${basePath}`)
    }

    const dirs = fsSync.readdirSync(basePath)
    console.log(`Found ${dirs.length} items in directory: ${dirs.join(', ')}`) // Debug log

    return dirs.filter((dir) => {
      const fullPath = path.join(basePath, dir)
      try {
        const isDir = fsSync.statSync(fullPath).isDirectory()
        console.log(`Checking ${fullPath}: ${isDir ? 'Directory' : 'File'}`) // Debug log
        return isDir
      } catch (error) {
        console.warn(`Error accessing ${dir}: ${error.message}`)
        return false
      }
    })
  } catch (error) {
    throw new Error(`Failed to list courses: ${error.message}`)
  }
}

export function iterateCourseFolder() {
  // Return an empty array or implement your logic to return an array of course names
  return [] // Placeholder for now
}
