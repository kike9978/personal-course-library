import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join, extname } from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
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

function registerCourseMediaProtocol() {
  protocol.handle('course-media', async (request) => {
    try {
      const url = new URL(request.url)
      const courseDir = url.searchParams.get('course')

      if (url.hostname !== 'cover' || !courseDir) {
        return new Response('Not Found', { status: 404 })
      }

      const imagePath = findCoverImagePath(courseDir)
      if (!imagePath || !fs.existsSync(imagePath)) {
        return new Response('Not Found', { status: 404 })
      }

      // Read bytes directly — more reliable on Windows than net.fetch(file://)
      const data = await fsPromises.readFile(imagePath)
      const mime = COVER_MIME[extname(imagePath).toLowerCase()] || 'application/octet-stream'
      return new Response(data, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=3600'
        }
      })
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
    startLibraryWatcher()
    return { path: pathSet, valid: true }
  })

  ipcMain.handle('pick-library-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select courses library folder',
      properties: ['openDirectory']
    })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const pathSet = setLibraryPath(result.filePaths[0])
    clearCourseCache()
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
    if (!isLibraryPathValid()) {
      return []
    }
    return listCourses()
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
