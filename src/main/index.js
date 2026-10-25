import { app, shell, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join, extname, basename } from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getLibraryPath, setLibraryPath, isLibraryPathValid } from './services/config.js'
import {
  listCourses,
  NEW_COURSE_MS,
  getCourse,
  updateCourse,
  updateCourseProperty,
  getCoverImageUrl,
  findCoverImagePath,
  openCourseFolder,
  openCourseFile,
  revealCourseFile,
  openAbsolutePath,
  revealAbsolutePath,
  clearCourseCache,
  generateCourseProps,
  repairCourseProps,
  generateMissingCourseProps,
  generateCoursePropsBatch
} from './services/courses.js'
import { saveCourseDescription, saveCourseDescriptionBatch } from './services/courseDescription.js'
import {
  searchCoverCandidates,
  saveCourseCover,
  saveCourseCoverBuffer
} from './services/coverSearch.js'
import { scanCourse, resolveCourseFile, getLessonMime, srtToWebVtt } from './services/courseScan.js'
import { getLessonMediaUrl } from './services/mediaUrls.js'
import {
  resolveNoteAttachmentPath,
  getNoteAttachmentMime,
  saveNoteAttachmentFromPath,
  saveNoteAttachmentFromData,
  saveNoteDrawing,
  loadNoteDrawing,
  resolveExistingNoteAttachments
} from './services/noteAttachments.js'
import {
  getCourseProgress,
  setLessonProgress,
  recordCourseView,
  getLessonProgress,
  setCourseCurriculum,
  getAllCourseProgress,
  withAddedDates,
  listNotes,
  upsertNote,
  deleteNote,
  listBookmarks,
  upsertBookmark,
  deleteBookmark,
  listAllNotes,
  listAllBookmarks,
  listProjects,
  listAllProjects,
  upsertProject,
  deleteProject,
  getProjectLinkedPath,
  getNotesSearchByCourse,
  ensureLearningStoreFile,
  listPlaylists,
  upsertPlaylist,
  deletePlaylist
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
let annotationsWindow = null
let libraryWatcher = null
let watchDebounceTimer = null
const scanCache = new Map()

function getRendererEntry(hash = '') {
  const suffix = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return { type: 'url', value: `${process.env['ELECTRON_RENDERER_URL']}${suffix}` }
  }
  return {
    type: 'file',
    value: join(__dirname, '../renderer/index.html'),
    hash: suffix
  }
}

function loadRenderer(win, hash = '') {
  const entry = getRendererEntry(hash)
  if (entry.type === 'url') {
    win.loadURL(entry.value)
  } else if (entry.hash) {
    win.loadFile(entry.value, { hash: entry.hash.replace(/^#/, '') })
  } else {
    win.loadFile(entry.value)
  }
}

function broadcastToWindows(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  })
}

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

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

function buildAnnotationsHash(options = {}) {
  const params = new URLSearchParams()
  if (options.coursePath) params.set('coursePath', options.coursePath)
  const query = params.toString()
  return query ? `annotations-window?${query}` : 'annotations-window'
}

function openAnnotationsWindow(options = {}) {
  const hash = buildAnnotationsHash(options)

  if (annotationsWindow && !annotationsWindow.isDestroyed()) {
    loadRenderer(annotationsWindow, hash)
    if (annotationsWindow.isMinimized()) annotationsWindow.restore()
    annotationsWindow.show()
    annotationsWindow.focus()
    return { ok: true, focused: true }
  }

  annotationsWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'Anotaciones',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  annotationsWindow.on('ready-to-show', () => {
    annotationsWindow.show()
  })

  annotationsWindow.on('closed', () => {
    annotationsWindow = null
  })

  annotationsWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(annotationsWindow, hash)
  return { ok: true, focused: false }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  return true
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
        const ext = extname(absolute).toLowerCase()
        // Serve SRT as WebVTT so <track> works in the player
        if (ext === '.srt') {
          const raw = await fsPromises.readFile(absolute, 'utf8')
          const vtt = srtToWebVtt(raw)
          return new Response(vtt, {
            status: 200,
            headers: {
              'Content-Type': 'text/vtt; charset=utf-8',
              'Cache-Control': 'no-cache'
            }
          })
        }
        const mime = getLessonMime(absolute)
        return serveFileWithRanges(request, absolute, mime)
      }

      if (url.hostname === 'note') {
        const file = url.searchParams.get('file')
        if (!file) return new Response('Not Found', { status: 404 })
        const absolute = resolveNoteAttachmentPath(file)
        if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
          return new Response('Not Found', { status: 404 })
        }
        const data = await fsPromises.readFile(absolute)
        const mime = getNoteAttachmentMime(absolute)
        return new Response(data, {
          headers: {
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=31536000'
          }
        })
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
    return withAddedDates(await listCourses(), NEW_COURSE_MS)
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

  ipcMain.handle('generate-course-props', async (_event, { coursePath, overwrite }) => {
    const course = await generateCourseProps(coursePath, { overwrite: Boolean(overwrite) })
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('course-updated', { coursePath, fullData: course })
    })
    return { success: true, course }
  })

  ipcMain.handle('repair-course-props', async (_event, coursePath) => {
    const course = await repairCourseProps(coursePath)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('course-updated', { coursePath, fullData: course })
    })
    return { success: true, course }
  })

  ipcMain.handle('generate-missing-course-props', async () => {
    const result = await generateMissingCourseProps()
    return { success: true, ...result }
  })

  ipcMain.handle('generate-course-props-batch', async (_event, coursePaths) => {
    const result = await generateCoursePropsBatch(coursePaths)
    return { success: true, ...result }
  })

  ipcMain.handle('save-course-description', async (_event, { coursePath, description } = {}) => {
    const saved = await saveCourseDescription(coursePath, description)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('course-updated', { coursePath, fullData: saved.props })
    })
    return { success: true, description: saved.description }
  })

  ipcMain.handle('save-course-description-batch', async (_event, { entries } = {}) => {
    const result = await saveCourseDescriptionBatch(entries)
    BrowserWindow.getAllWindows().forEach((win) => {
      result.saved.forEach((item) => {
        win.webContents.send('course-updated', {
          coursePath: item.coursePath,
          fullData: item.props
        })
      })
    })
    return {
      success: true,
      savedCount: result.saved.length,
      savedPaths: result.saved.map((item) => item.coursePath),
      skips: result.skips
    }
  })

  ipcMain.handle('open-course-folder', async (_event, courseDir) => {
    await openCourseFolder(courseDir)
    return { success: true }
  })

  ipcMain.handle('open-course-file', async (_event, { coursePath, relativePath }) => {
    await openCourseFile(coursePath, relativePath)
    return { success: true }
  })

  ipcMain.handle('reveal-course-file', async (_event, { coursePath, relativePath }) => {
    await revealCourseFile(coursePath, relativePath)
    return { success: true }
  })

  ipcMain.handle('get-cover-image-url', (_event, courseDir) => {
    return getCoverImageUrl(courseDir)
  })

  ipcMain.handle('search-cover-candidates', async (_event, payload) => {
    return searchCoverCandidates(payload || {})
  })

  const broadcastSavedCover = (course) => {
    const fullData = { ...course, coverStamp: Date.now() }
    broadcastToWindows('course-updated', { coursePath: course.path, fullData })
    return fullData
  }

  ipcMain.handle('save-course-cover', async (_event, { coursePath, imageUrl, thumbUrl } = {}) => {
    const course = await saveCourseCover(coursePath, imageUrl, thumbUrl)
    const fullData = broadcastSavedCover(course)
    return { success: true, course: fullData }
  })

  ipcMain.handle('save-course-cover-from-data', async (_event, { coursePath, data } = {}) => {
    const course = await saveCourseCoverBuffer(coursePath, data)
    const fullData = broadcastSavedCover(course)
    return { success: true, course: fullData }
  })

  ipcMain.handle('open-google-image-search', async (_event, query) => {
    const q = String(query || '').trim()
    if (!q) throw new Error('Sin búsqueda')
    const url = new URL('https://www.google.com/search')
    url.searchParams.set('tbm', 'isch')
    url.searchParams.set('q', q)
    await shell.openExternal(url.href)
    return { success: true }
  })

  ipcMain.handle('refresh-courses', async () => {
    clearCourseCache()
    scanCache.clear()
    if (!isLibraryPathValid()) {
      return []
    }
    return withAddedDates(await listCourses(), NEW_COURSE_MS)
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

  ipcMain.handle('record-course-view', (_event, coursePath) => {
    return recordCourseView(coursePath)
  })

  ipcMain.handle('list-notes', (_event, coursePath) => listNotes(coursePath))
  ipcMain.handle('upsert-note', (_event, { coursePath, note }) => {
    const list = upsertNote(coursePath, note)
    broadcastToWindows('notes-changed', { coursePath })
    return list
  })
  ipcMain.handle('delete-note', (_event, { coursePath, noteId }) => {
    const list = deleteNote(coursePath, noteId)
    broadcastToWindows('notes-changed', { coursePath })
    return list
  })
  ipcMain.handle('open-annotations-window', (_event, options = {}) =>
    openAnnotationsWindow(options || {})
  )
  ipcMain.handle('focus-main-window', () => ({ ok: focusMainWindow() }))
  ipcMain.handle('annotations-jump', (_event, payload = {}) => {
    const focused = focusMainWindow()
    if (focused && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('annotations-jump', payload)
    }
    return { ok: focused }
  })
  ipcMain.handle('list-bookmarks', (_event, coursePath) => listBookmarks(coursePath))
  ipcMain.handle('upsert-bookmark', (_event, { coursePath, bookmark }) =>
    upsertBookmark(coursePath, bookmark)
  )
  ipcMain.handle('delete-bookmark', (_event, { coursePath, bookmarkId }) =>
    deleteBookmark(coursePath, bookmarkId)
  )
  ipcMain.handle('list-all-notes', () => listAllNotes())
  ipcMain.handle('list-all-bookmarks', () => listAllBookmarks())
  ipcMain.handle('get-notes-search-by-course', () => getNotesSearchByCourse())
  ipcMain.handle('reveal-learning-store', () => {
    const filePath = ensureLearningStoreFile()
    revealAbsolutePath(filePath)
    return filePath
  })

  ipcMain.handle('list-projects', (_event, coursePath) => listProjects(coursePath))
  ipcMain.handle('list-all-projects', () => listAllProjects())
  ipcMain.handle('upsert-project', (_event, { coursePath, project }) =>
    upsertProject(coursePath, project)
  )
  ipcMain.handle('delete-project', (_event, { coursePath, projectId }) =>
    deleteProject(coursePath, projectId)
  )
  ipcMain.handle('list-playlists', () => listPlaylists())
  ipcMain.handle('upsert-playlist', (_event, playlist) => upsertPlaylist(playlist))
  ipcMain.handle('delete-playlist', (_event, playlistId) => deletePlaylist(playlistId))

  ipcMain.handle('pick-project-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Vincular carpeta del proyecto',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }
    const folderPath = result.filePaths[0]
    return { canceled: false, path: folderPath, name: basename(folderPath) }
  })

  ipcMain.handle('pick-note-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Adjuntar imagen a la nota',
      properties: ['openFile'],
      filters: [
        {
          name: 'Imágenes',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
        }
      ]
    })
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }
    try {
      const saved = saveNoteAttachmentFromPath(result.filePaths[0])
      return { canceled: false, ...saved }
    } catch (error) {
      return { canceled: true, error: error.message }
    }
  })

  ipcMain.handle('save-note-image', (_event, payload) => {
    try {
      return { ok: true, ...saveNoteAttachmentFromData(payload || {}) }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  ipcMain.handle('save-note-drawing', (_event, payload) => {
    try {
      return { ok: true, ...saveNoteDrawing(payload || {}) }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  ipcMain.handle('load-note-drawing', (_event, drawingId) => {
    try {
      return { ok: true, ...loadNoteDrawing(drawingId) }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  ipcMain.handle('export-file', async (_event, payload = {}) => {
    try {
      const filters = Array.isArray(payload.filters) ? payload.filters : undefined
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar',
        defaultPath: payload.defaultPath || undefined,
        filters
      })
      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }
      if (payload.dataText != null) {
        fs.writeFileSync(result.filePath, String(payload.dataText), 'utf8')
      } else if (payload.dataBase64) {
        fs.writeFileSync(result.filePath, Buffer.from(String(payload.dataBase64), 'base64'))
      } else {
        return { ok: false, error: 'Sin datos para exportar' }
      }
      return { ok: true, canceled: false, path: result.filePath }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  ipcMain.handle('export-markdown-bundle', async (_event, payload = {}) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar anotación (Markdown)',
        defaultPath: payload.defaultPath || 'anotacion.md',
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Todos', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      const mdPath = result.filePath.endsWith('.md') ? result.filePath : `${result.filePath}.md`
      fs.writeFileSync(mdPath, String(payload.markdown || ''), 'utf8')

      const assetFiles = Array.isArray(payload.assetFiles) ? payload.assetFiles : []
      const resolved = resolveExistingNoteAttachments(assetFiles)
      let assetsDir = null
      if (resolved.length) {
        assetsDir = mdPath.replace(/\.md$/i, '') + '.assets'
        fs.mkdirSync(assetsDir, { recursive: true })
        for (const item of resolved) {
          fs.copyFileSync(item.absolutePath, join(assetsDir, item.fileName))
        }
      }

      return {
        ok: true,
        canceled: false,
        path: mdPath,
        assetsDir,
        assetCount: resolved.length
      }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  ipcMain.handle('open-project-link', async (_event, { coursePath, projectId }) => {
    const linked = getProjectLinkedPath(coursePath, projectId)
    await openAbsolutePath(linked)
    return { success: true }
  })

  ipcMain.handle('reveal-project-link', async (_event, { coursePath, projectId }) => {
    const linked = getProjectLinkedPath(coursePath, projectId)
    revealAbsolutePath(linked)
    return { success: true }
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
