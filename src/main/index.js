import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join, extname } from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getLibraryPath, setLibraryPath, isLibraryPathValid } from './services/config.js'
import {
  listCourses,
  getCourse,
  updateCourse,
  updateCourseProperty,
  getCoverImageUrl,
  findCoverImagePath,
  openCourseFolder,
  clearCourseCache
} from './services/courses.js'
import {
  scanCourse,
  resolveCourseFile,
  getLessonMime
} from './services/courseScan.js'
import { getLessonMediaUrl } from './services/mediaUrls.js'
import {
  getCourseProgress,
  setLessonProgress,
  getLessonProgress,
  setCourseCurriculum,
  getAllCourseProgress
} from './services/learningStore.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'course-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

let mainWindow = null
let libraryWatcher = null
let watchDebounceTimer = null
const scanCache = new Map()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function notifyLibraryChanged() {
  clearCourseCache()
  scanCache.clear()
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('library-changed')
  })
}

function stopLibraryWatcher() {
  if (libraryWatcher) {
    libraryWatcher.close()
    libraryWatcher = null
  }
  if (watchDebounceTimer) {
    clearTimeout(watchDebounceTimer)
    watchDebounceTimer = null
  }
}

function startLibraryWatcher() {
  stopLibraryWatcher()
  const libraryPath = getLibraryPath()
  if (!isLibraryPathValid(libraryPath)) return

  try {
    libraryWatcher = fs.watch(libraryPath, { recursive: false }, () => {
      if (watchDebounceTimer) clearTimeout(watchDebounceTimer)
      watchDebounceTimer = setTimeout(() => {
        notifyLibraryChanged()
      }, 500)
    })
  } catch (error) {
    console.warn('Could not watch library folder:', error.message)
  }
}

const COVER_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}

function nodeStreamToWeb(nodeStream) {
  return Readable.toWeb(nodeStream)
}

async function serveFileWithRanges(request, filePath, mime) {
  const stat = await fsPromises.stat(filePath)
  const fileSize = stat.size
  const rangeHeader = request.headers.get('Range') || request.headers.get('range')

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
    if (!match) {
      return new Response('Invalid Range', { status: 416 })
    }
    const start = match[1] ? parseInt(match[1], 10) : 0
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` }
      })
    }
    const chunkSize = end - start + 1
    const nodeStream = fs.createReadStream(filePath, { start, end })
    return new Response(nodeStreamToWeb(nodeStream), {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    })
  }

  const nodeStream = fs.createReadStream(filePath)
  return new Response(nodeStreamToWeb(nodeStream), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    }
  })
}

function registerCourseMediaProtocol() {
  protocol.handle('course-media', async (request) => {
    try {
      const url = new URL(request.url)
      const courseDir = url.searchParams.get('course')

      if (url.hostname === 'cover') {
        if (!courseDir) return new Response('Not Found', { status: 404 })
        const imagePath = findCoverImagePath(courseDir)
        if (!imagePath || !fs.existsSync(imagePath)) {
          return new Response('Not Found', { status: 404 })
        }
        const data = await fsPromises.readFile(imagePath)
        const mime = COVER_MIME[extname(imagePath).toLowerCase()] || 'application/octet-stream'
        return new Response(data, {
          headers: {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=3600'
          }
        })
      }

      if (url.hostname === 'lesson') {
        const file = url.searchParams.get('file')
        if (!courseDir || !file) {
          return new Response('Not Found', { status: 404 })
        }
        const absolute = resolveCourseFile(courseDir, decodeURIComponent(file))
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
          return new Response('Not Found', { status: 404 })
        }
        const mime = getLessonMime(absolute)
        return serveFileWithRanges(request, absolute, mime)
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      console.error('course-media protocol error:', error)
      return new Response('Error', { status: 500 })
    }
  })
}

function registerIpcHandlers() {
  ipcMain.handle('get-library-path', () => {
    const libraryPath = getLibraryPath()
    return {
      path: libraryPath,
      valid: isLibraryPathValid(libraryPath)
    }
  })

  ipcMain.handle('set-library-path', (_event, libraryPath) => {
    const pathSet = setLibraryPath(libraryPath)
    clearCourseCache()
    scanCache.clear()
    startLibraryWatcher()
    return { path: pathSet, valid: true }
  })

  ipcMain.handle('pick-library-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta de cursos',
      properties: ['openDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const pathSet = setLibraryPath(result.filePaths[0])
    clearCourseCache()
    scanCache.clear()
    startLibraryWatcher()
    return { canceled: false, path: pathSet, valid: true }
  })

  ipcMain.handle('list-courses', async () => {
    if (!isLibraryPathValid()) {
      return []
    }
    return listCourses()
  })

  ipcMain.handle('get-course', async (_event, courseDir) => {
    return getCourse(courseDir)
  })

  ipcMain.handle('update-course', async (_event, { coursePath, updates }) => {
    const data = await updateCourse(coursePath, updates)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('course-updated', { coursePath, fullData: data })
    })
    return { success: true, data }
  })

  ipcMain.handle('update-course-property', async (_event, { coursePath, property, value }) => {
    const data = await updateCourseProperty(coursePath, property, value)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('course-updated', {
        coursePath,
        property,
        value,
        fullData: data
      })
    })
    return { success: true, data }
  })

  ipcMain.handle('open-course-folder', async (_event, courseDir) => {
    await openCourseFolder(courseDir)
    return { success: true }
  })

  ipcMain.handle('get-cover-image-url', (_event, courseDir) => {
    return getCoverImageUrl(courseDir)
  })

  ipcMain.handle('refresh-courses', async () => {
    clearCourseCache()
    scanCache.clear()
    if (!isLibraryPathValid()) {
      return []
    }
    return listCourses()
  })

  ipcMain.handle('scan-course', async (_event, { coursePath, force }) => {
    const key = String(coursePath)
    if (!force && scanCache.has(key)) {
      return scanCache.get(key)
    }
    const tree = await scanCourse(coursePath)
    const playable = (tree.flatLessons || [])
      .filter((l) => l.kind === 'video' || l.kind === 'audio')
      .map((l) => ({ relativePath: l.relativePath, title: l.title }))
    setCourseCurriculum(coursePath, playable)
    scanCache.set(key, tree)
    return tree
  })

  ipcMain.handle('get-lesson-media-url', (_event, { coursePath, relativePath }) => {
    return getLessonMediaUrl(coursePath, relativePath)
  })

  ipcMain.handle('get-course-progress', (_event, coursePath) => {
    return getCourseProgress(coursePath)
  })

  ipcMain.handle('get-all-course-progress', () => {
    return getAllCourseProgress()
  })

  ipcMain.handle('get-lesson-progress', (_event, { coursePath, relativePath }) => {
    return getLessonProgress(coursePath, relativePath)
  })

  ipcMain.handle('set-lesson-progress', (_event, { coursePath, ...update }) => {
    return setLessonProgress(coursePath, update)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.personal.courselibrary')

  registerCourseMediaProtocol()
  registerIpcHandlers()
  startLibraryWatcher()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopLibraryWatcher()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
