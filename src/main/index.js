import { app, shell, BrowserWindow, ipcMain, dialog, protocol, clipboard } from 'electron'
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
import { isCourseHidden } from '../shared/courseHide.js'
import { saveCourseDescription, saveCourseDescriptionBatch } from './services/courseDescription.js'
import { detectPrograms } from './services/programDetect.js'
import {
  searchCoverCandidates,
  saveCourseCover,
  saveCourseCoverBuffer
} from './services/coverSearch.js'
import { scanCourse, resolveCourseFile, getLessonMime, srtToWebVtt } from './services/courseScan.js'
import { TS_EXTS, loadTsIndex, openTsSegment, renderPlaylist } from './services/tsIndex.js'
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
import { exportCourseFolders } from './services/courseZip.js'
import {
  getCourseProgress,
  setLessonProgress,
  setCourseExcitement,
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
  listTopics,
  upsertTopic,
  deleteTopic,
  listAllBookmarks,
  listProjects,
  listAllProjects,
  upsertProject,
  deleteProject,
  getProjectLinkedPath,
  getNotesSearchByCourse,
  ensureLearningStoreFile,
  flushLearningStore,
  listPlaylists,
  upsertPlaylist,
  deletePlaylist,
  listDecks,
  createDeck,
  deleteDeck,
  setDeckCardKnown,
  appendDeckCards,
  updateDeckCard,
  deleteDeckCard,
  getDeck,
  getPlaylistIntent,
  savePlaylistIntent,
  listCierres,
  upsertCierre,
  setCierreFavorite,
  deleteCierre,
  upsertCierreComment,
  deleteCierreComment,
  setNoteWriteHook,
  setPlaylistWriteHook,
  setProjectWriteHook,
  setSourceWriteHook,
  deleteSource,
  findSourceByUrl,
  listSourceNotes,
  listSources,
  readSource,
  setSourceCaptures,
  setSourcePosition,
  upsertSource
} from './services/learningStore.js'
import {
  deleteSourceCopy,
  readSourceCaptions,
  readSourceCopy,
  saveSourceCaptions,
  saveSourceCopy
} from './services/sourceCopy.js'
import { backfillSourceThumbnails } from './services/sourceThumbs.js'
import {
  installSourceViewerGuards,
  instagramSessionStatus,
  signInToInstagram,
  signOutOfInstagram
} from './services/sourceViewer.js'
import {
  enqueueNotionDelete,
  enqueueNotionPlaylistDelete,
  enqueueNotionPlaylistUpsert,
  enqueueNotionProgress,
  enqueueNotionProjectDelete,
  enqueueNotionProjectUpsert,
  enqueueNotionUpsert,
  localProgressSyncKey,
  getNotionSyncStatus,
  notionDebugReport,
  pollNotionChanges,
  resolveNotionConflict,
  resolveAllLocalNoteConflicts,
  resolveNotionDelete,
  resolveNotionPlaylistConflict,
  resolveNotionPlaylistDelete,
  resolveNotionProgress,
  resolveNotionProjectConflict,
  resolveNotionProjectDelete,
  enqueueNotionSourceUpsert,
  enqueueNotionSourceDelete,
  resolveNotionSourceConflict,
  resolveNotionSourceDelete,
  saveNotionSettings,
  startNotionSync,
  syncNotionNow
} from './services/notionSync.js'
import { readLessonTranscripts } from './services/lessonTranscripts.js'
import {
  archiveNotionDeck,
  enqueueNotionDeck,
  pushDeckToNotion,
  queueAllNotionDecks,
  setDeckNotionListener
} from './services/notionDecks.js'
import { canonicalSourceUrl } from '../shared/sources.js'
import {
  cacheSourceThumbnail,
  checkSourceLink,
  removeSourceThumbnail,
  saveSourceCapture,
  sourceCapturePath,
  resolveSourceMeta,
  sourceThumbPath
} from './services/sourceMeta.js'
import {
  ankiStatus,
  exportDeckForAnki,
  getAnkiSettings,
  saveAnkiSettings,
  syncDeckToAnki
} from './services/ankiSync.js'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'course-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      stream: true
    }
  }
])

let mainWindow = null
let annotationsWindow = null
let libraryWatcher = null
let watchDebounceTimer = null
let activeCourseZip = null
const scanCache = new Map()
// Each entry is a whole course tree. Keep the most recently opened ones only.
const SCAN_CACHE_LIMIT = 20

function rememberScan(key, tree) {
  scanCache.delete(key)
  scanCache.set(key, tree)
  while (scanCache.size > SCAN_CACHE_LIMIT) scanCache.delete(scanCache.keys().next().value)
}

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
      nodeIntegration: false,
      // Fuentes shows remote pages in a <webview>; sourceViewer.js locks each one down.
      webviewTag: true
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

function withCors(headers) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    ...headers
  }
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
        headers: withCors({ 'Content-Range': `bytes */${fileSize}` })
      })
    }
    const chunkSize = end - start + 1
    const nodeStream = fs.createReadStream(filePath, { start, end })
    return new Response(nodeStreamToWeb(nodeStream), {
      status: 206,
      headers: withCors({
        'Content-Type': mime,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      })
    })
  }

  const nodeStream = fs.createReadStream(filePath)
  return new Response(nodeStreamToWeb(nodeStream), {
    status: 200,
    headers: withCors({
      'Content-Type': mime,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    })
  })
}

function registerCourseMediaProtocol() {
  protocol.handle('course-media', async (request) => {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: withCors({
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Max-Age': '86400'
          })
        })
      }

      const url = new URL(request.url)
      const courseDir = url.searchParams.get('course')

      if (url.hostname === 'source-thumb' || url.hostname === 'source-capture') {
        const thumbPath =
          url.hostname === 'source-thumb'
            ? sourceThumbPath(url.searchParams.get('file'))
            : sourceCapturePath(url.searchParams.get('file'))
        if (!thumbPath || !fs.existsSync(thumbPath)) return new Response('Not Found', { status: 404 })
        const data = await fsPromises.readFile(thumbPath)
        const mime = COVER_MIME[extname(thumbPath).toLowerCase()] || 'image/avif'
        return new Response(data, {
          headers: withCors({ 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' })
        })
      }

      if (url.hostname === 'cover') {
        if (!courseDir) return new Response('Not Found', { status: 404 })
        const imagePath = findCoverImagePath(courseDir)
        if (!imagePath || !fs.existsSync(imagePath)) {
          return new Response('Not Found', { status: 404 })
        }
        const data = await fsPromises.readFile(imagePath)
        const mime = COVER_MIME[extname(imagePath).toLowerCase()] || 'application/octet-stream'
        return new Response(data, {
          headers: withCors({
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=3600'
          })
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
            headers: withCors({
              'Content-Type': 'text/vtt; charset=utf-8',
              'Cache-Control': 'no-cache'
            })
          })
        }
        if (TS_EXTS.has(ext) && (url.searchParams.has('hls') || url.searchParams.has('tsSeg'))) {
          try {
            const index = await loadTsIndex(
              absolute,
              join(app.getPath('userData'), 'ts-index.json')
            )
            if (url.searchParams.has('tsSeg')) {
              const part = openTsSegment(absolute, index, Number(url.searchParams.get('tsSeg')))
              if (!part) return new Response('Not Found', { status: 404 })
              return new Response(nodeStreamToWeb(part.stream), {
                status: 200,
                headers: withCors({
                  'Content-Type': 'video/mp2t',
                  'Content-Length': String(part.length),
                  'Cache-Control': 'no-cache'
                })
              })
            }
            const playlist = renderPlaylist(index, courseDir, decodeURIComponent(file))
            return new Response(playlist, {
              status: 200,
              headers: withCors({
                'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                'Cache-Control': 'no-cache'
              })
            })
          } catch (error) {
            console.error('Failed to prepare transport stream', error)
            return new Response('Unsupported transport stream', {
              status: 415,
              headers: withCors({ 'Content-Type': 'text/plain; charset=utf-8' })
            })
          }
        }
        const mime = getLessonMime(absolute)
        return serveFileWithRanges(request, absolute, mime)
      }

      if (url.hostname === 'note') {
        const file = url.searchParams.get('file')
        if (!file) return new Response('Not Found', { status: 404 })
        const absolute = resolveNoteAttachmentPath(file)
        if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
          return new Response('Not Found', {
            status: 404,
            headers: { 'Cache-Control': 'no-store' }
          })
        }
        const data = await fsPromises.readFile(absolute)
        const mime = getNoteAttachmentMime(absolute)
        return new Response(data, {
          headers: withCors({
            'Content-Type': mime,
            'Cache-Control': 'public, max-age=31536000'
          })
        })
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      console.error('course-media protocol error:', error)
      return new Response('Error', { status: 500 })
    }
  })
}

async function listCatalogCourses() {
  if (!isLibraryPathValid()) return []
  const all = await listCourses({ includeHidden: true })
  return withAddedDates(all, NEW_COURSE_MS).filter((course) => !isCourseHidden(course))
}

function registerIpcHandlers() {
  setNoteWriteHook((event) => {
    if (event.op === 'delete') enqueueNotionDelete(event.finding)
    else enqueueNotionUpsert(event.id)
  })
  setPlaylistWriteHook((event) => {
    if (event.op === 'delete') enqueueNotionPlaylistDelete(event.playlist)
    else enqueueNotionPlaylistUpsert(event.id)
  })
  setProjectWriteHook((event) => {
    if (event.op === 'delete') enqueueNotionProjectDelete(event.project)
    else enqueueNotionProjectUpsert(event.coursePath, event.id)
  })
  setSourceWriteHook((event) => {
    if (event.op === 'delete') enqueueNotionSourceDelete(event.source)
    else enqueueNotionSourceUpsert(event.id)
  })
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

  ipcMain.handle('list-courses', async () => listCatalogCourses())

  ipcMain.handle('get-course', async (_event, courseDir) => {
    return getCourse(courseDir)
  })

  ipcMain.handle('update-course', async (_event, { coursePath, updates }) => {
    const data = await updateCourse(coursePath, updates)
    if (Object.prototype.hasOwnProperty.call(updates || {}, 'isInProcess')) {
      enqueueNotionProgress(coursePath, { soon: true })
    }
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('course-updated', { coursePath, fullData: data })
    })
    return { success: true, data }
  })

  ipcMain.handle('update-course-property', async (_event, { coursePath, property, value }) => {
    const data = await updateCourseProperty(coursePath, property, value)
    if (property === 'isInProcess') enqueueNotionProgress(coursePath, { soon: true })
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

  ipcMain.handle('detect-course-programs', async (event, { coursePaths, field } = {}) => {
    let last = 0
    return detectPrograms(coursePaths, {
      field: field === 'media' ? 'media' : 'programs',
      onProgress: (done, total) => {
        const now = Date.now()
        if (done !== total && now - last < 120) return
        last = now
        if (!event.sender.isDestroyed()) {
          event.sender.send('detect-course-programs-progress', { done, total })
        }
      }
    })
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

  // Chat replies come back through the clipboard. Text only, capped so a huge copy is ignored.
  ipcMain.handle('read-clipboard-text', () => {
    const text = clipboard.readText()
    return text.length > 2_000_000 ? '' : text
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
    return listCatalogCourses()
  })

  ipcMain.handle('scan-course', async (_event, { coursePath, force }) => {
    const key = String(coursePath)
    if (!force && scanCache.has(key)) {
      const cached = scanCache.get(key)
      rememberScan(key, cached)
      return cached
    }
    const tree = await scanCourse(coursePath)
    const playable = (tree.flatLessons || [])
      .filter((l) => l.kind === 'video' || l.kind === 'audio')
      .map((l) => ({ relativePath: l.relativePath, title: l.title }))
    setCourseCurriculum(coursePath, playable)
    rememberScan(key, tree)
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
    const before = localProgressSyncKey(coursePath)
    const next = setLessonProgress(coursePath, update)
    if (localProgressSyncKey(coursePath) !== before) {
      enqueueNotionProgress(coursePath, { soon: true })
    }
    return next
  })

  ipcMain.handle('set-course-excitement', (_event, { coursePath, excitement }) => {
    const before = localProgressSyncKey(coursePath)
    const next = setCourseExcitement(coursePath, excitement)
    if (localProgressSyncKey(coursePath) !== before) {
      enqueueNotionProgress(coursePath, { soon: true })
    }
    broadcastToWindows('progress-changed', {})
    return next
  })

  ipcMain.handle('record-course-view', (_event, coursePath) => {
    const before = localProgressSyncKey(coursePath)
    const next = recordCourseView(coursePath)
    if (localProgressSyncKey(coursePath) !== before) {
      enqueueNotionProgress(coursePath, { soon: true })
    }
    return next
  })

  ipcMain.handle('list-notes', (_event, coursePath) => listNotes(coursePath))
  ipcMain.handle('upsert-note', (_event, { coursePath, note }) => {
    const list = upsertNote(coursePath || null, note)
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
  ipcMain.handle('list-topics', () => listTopics())
  ipcMain.handle('upsert-topic', (_event, topic) => {
    const saved = upsertTopic(topic || {})
    broadcastToWindows('notes-changed', {})
    return saved
  })
  ipcMain.handle('delete-topic', (_event, topicId) => {
    const topics = deleteTopic(topicId)
    broadcastToWindows('notes-changed', {})
    return topics
  })
  ipcMain.handle('list-all-bookmarks', () => listAllBookmarks())
  ipcMain.handle('get-notes-search-by-course', () => getNotesSearchByCourse())

  // Fuentes: saved links.
  ipcMain.handle('list-sources', () => listSources())
  ipcMain.handle('list-source-notes', (_event, sourceId) => listSourceNotes(sourceId))
  ipcMain.handle('resolve-source', (_event, url) => resolveSourceMeta(url))
  ipcMain.handle('add-source', async (_event, payload = {}) => {
    const looked = payload.meta?.url ? payload.meta : await resolveSourceMeta(payload.url)
    const canonical = canonicalSourceUrl(looked?.url)
    if (!canonical) throw new Error(looked?.reason || 'No parece un enlace válido')
    const meta = { ...looked, url: canonical.url, kind: canonical.kind }
    const existing = findSourceByUrl(meta.url)
    if (existing) return { source: existing, existed: true }
    const overrides = payload.overrides || {}
    let source = upsertSource({ ...meta, ...overrides, status: 'inbox' })
    const thumbnailFile = await cacheSourceThumbnail(source.id, source.thumbnail)
    if (thumbnailFile) source = upsertSource({ id: source.id, thumbnailFile })
    broadcastToWindows('sources-changed', { id: source.id })
    return { source, existed: false, ok: meta.ok !== false, reason: meta.reason || null }
  })
  ipcMain.handle('update-source', (_event, payload = {}) => {
    const source = upsertSource(payload)
    broadcastToWindows('sources-changed', { id: source.id })
    if (payload.title !== undefined) broadcastToWindows('notes-changed', {})
    return source
  })
  ipcMain.handle('refresh-source', async (_event, id) => {
    const current = readSource(id)
    if (!current) throw new Error('Fuente no encontrada')
    const meta = await resolveSourceMeta(current.url)
    if (!meta.ok) throw new Error(meta.reason || 'No se pudo leer el enlace')
    let source = upsertSource({
      id,
      title: meta.title,
      author: meta.author,
      siteName: meta.siteName,
      thumbnail: meta.thumbnail,
      publishedAt: meta.publishedAt
    })
    const thumbnailFile = await cacheSourceThumbnail(id, source.thumbnail)
    if (thumbnailFile) source = upsertSource({ id, thumbnailFile })
    broadcastToWindows('sources-changed', { id })
    broadcastToWindows('notes-changed', {})
    return source
  })
  ipcMain.handle('delete-source', async (_event, id) => {
    const result = deleteSource(id)
    if (result.removed?.thumbnailFile) await removeSourceThumbnail(result.removed.thumbnailFile)
    if (result.removed) await deleteSourceCopy(id)
    for (const capture of result.removed?.captures || []) {
      const target = sourceCapturePath(capture.file)
      if (target) await fsPromises.rm(target, { force: true }).catch(() => {})
    }
    broadcastToWindows('sources-changed', { id })
    if (result.noteCount) broadcastToWindows('notes-changed', {})
    return { noteCount: result.noteCount, removed: Boolean(result.removed) }
  })
  ipcMain.handle('save-source-copy', async (_event, id) => {
    const source = readSource(id)
    if (!source) throw new Error('Fuente no encontrada')
    const snapshot = await saveSourceCopy(source)
    const saved = upsertSource({ id, snapshot })
    broadcastToWindows('sources-changed', { id })
    return saved
  })
  ipcMain.handle('read-source-copy', (_event, id) => readSourceCopy(id))
  ipcMain.handle('read-source-captions', (_event, id) => readSourceCaptions(id))
  ipcMain.handle('save-source-captions', async (_event, { id, captions } = {}) => {
    if (!readSource(id)) throw new Error('Fuente no encontrada')
    return saveSourceCaptions(id, captions || {})
  })
  // Check every saved link (or the given ids), three at a time. Nothing is deleted.
  ipcMain.handle('check-source-links', async (_event, ids = null) => {
    const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null
    const queue = listSources().filter((source) => !wanted || wanted.has(source.id))
    const summary = { checked: 0, gone: 0, unknown: 0, skipped: 0 }
    const worker = async () => {
      while (queue.length) {
        const source = queue.shift()
        const linkCheck = await checkSourceLink(source)
        if (linkCheck.skipped) {
          summary.skipped += 1
          continue
        }
        summary.checked += 1
        if (linkCheck.state === 'gone') summary.gone += 1
        if (linkCheck.state === 'unknown') summary.unknown += 1
        upsertSource({ id: source.id, linkCheck })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    broadcastToWindows('sources-changed', {})
    return summary
  })
  ipcMain.handle('delete-source-copy', async (_event, id) => {
    await deleteSourceCopy(id)
    const saved = upsertSource({ id, snapshot: null })
    broadcastToWindows('sources-changed', { id })
    return saved
  })
  ipcMain.handle('instagram-session-status', () => instagramSessionStatus())
  ipcMain.handle('instagram-sign-in', async () => {
    const status = await signInToInstagram(mainWindow)
    broadcastToWindows('instagram-session-changed', status)
    return status
  })
  ipcMain.handle('instagram-sign-out', async () => {
    const status = await signOutOfInstagram()
    broadcastToWindows('instagram-session-changed', status)
    return status
  })
  ipcMain.handle('set-source-position', (_event, { id, positionSec, durationSec } = {}) =>
    setSourcePosition(id, { positionSec, durationSec })
  )
  ipcMain.handle('add-source-capture', async (_event, id) => {
    if (!readSource(id)) throw new Error('Fuente no encontrada')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Adjuntar captura',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }
    const files = []
    for (const filePath of result.filePaths.slice(0, 20)) {
      const file = await saveSourceCapture(id, filePath)
      if (file) files.push({ file, addedAt: Date.now() })
    }
    const source = setSourceCaptures(id, (list) => [...list, ...files])
    broadcastToWindows('sources-changed', { id })
    return { canceled: false, added: files.length, source }
  })
  ipcMain.handle('remove-source-capture', async (_event, { id, file } = {}) => {
    const source = setSourceCaptures(id, (list) => list.filter((item) => item.file !== file))
    const target = sourceCapturePath(file)
    if (target) await fsPromises.rm(target, { force: true }).catch(() => {})
    broadcastToWindows('sources-changed', { id })
    return source
  })
  ipcMain.handle('open-source-url', async (_event, id) => {
    const source = readSource(id)
    if (!source?.url || !/^https?:\/\//i.test(source.url)) throw new Error('Fuente no encontrada')
    await shell.openExternal(source.url)
    return { success: true }
  })
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
  ipcMain.handle('list-decks', () => listDecks())
  // Every deck change is pushed to Notion a few seconds later (one way).
  ipcMain.handle('create-deck', (_event, deck) => {
    const saved = createDeck(deck || {})
    enqueueNotionDeck(saved?.id)
    return saved
  })
  ipcMain.handle('delete-deck', (_event, deckId) => {
    const deck = getDeck(deckId)
    const result = deleteDeck(deckId)
    archiveNotionDeck(deck)
    return result
  })
  ipcMain.handle('append-deck-cards', (_event, { deckId, cards } = {}) => {
    const result = appendDeckCards(deckId, cards)
    enqueueNotionDeck(deckId)
    return result
  })
  ipcMain.handle('update-deck-card', (_event, { deckId, cardId, patch } = {}) => {
    const saved = updateDeckCard(deckId, cardId, patch)
    enqueueNotionDeck(deckId)
    return saved
  })
  ipcMain.handle('delete-deck-card', (_event, { deckId, cardId } = {}) => {
    const saved = deleteDeckCard(deckId, cardId)
    enqueueNotionDeck(deckId)
    return saved
  })
  ipcMain.handle('push-deck-to-notion', (_event, deckId) =>
    pushDeckToNotion(deckId, { force: true })
  )
  ipcMain.handle('read-lesson-transcripts', (_event, { coursePath, items } = {}) =>
    readLessonTranscripts(coursePath, items)
  )
  ipcMain.handle('anki-status', () => ankiStatus())
  ipcMain.handle('get-anki-settings', () => getAnkiSettings())
  ipcMain.handle('set-anki-settings', (_event, payload = {}) => saveAnkiSettings(payload))
  ipcMain.handle('sync-deck-to-anki', (_event, deckId) => syncDeckToAnki(deckId))
  ipcMain.handle('export-deck-anki', (event, deckId) =>
    exportDeckForAnki(deckId, BrowserWindow.fromWebContents(event.sender) || mainWindow)
  )
  ipcMain.handle('set-deck-card-known', (_event, { deckId, cardId, known } = {}) =>
    setDeckCardKnown(deckId, cardId, known)
  )
  ipcMain.handle('list-playlists', () => listPlaylists())
  ipcMain.handle('upsert-playlist', (_event, playlist) => upsertPlaylist(playlist))
  ipcMain.handle('delete-playlist', (_event, playlistId) => deletePlaylist(playlistId))
  ipcMain.handle('get-playlist-intent', () => getPlaylistIntent())
  ipcMain.handle('save-playlist-intent', (_event, intent) => savePlaylistIntent(intent))

  ipcMain.handle('list-cierres', () => listCierres())
  ipcMain.handle('upsert-cierre', (_event, payload) => {
    const saved = upsertCierre(payload || {})
    broadcastToWindows('cierres-changed', {})
    return saved
  })
  ipcMain.handle('set-cierre-favorite', (_event, { id, favorite } = {}) => {
    const saved = setCierreFavorite(id, favorite)
    broadcastToWindows('cierres-changed', {})
    return saved
  })
  ipcMain.handle('delete-cierre', (_event, id) => {
    const result = deleteCierre(id)
    broadcastToWindows('cierres-changed', {})
    return result
  })
  ipcMain.handle('upsert-cierre-comment', (_event, { cierreId, comment } = {}) => {
    const saved = upsertCierreComment(cierreId, comment || {})
    broadcastToWindows('cierres-changed', {})
    return saved
  })
  ipcMain.handle('delete-cierre-comment', (_event, { cierreId, commentId } = {}) => {
    const saved = deleteCierreComment(cierreId, commentId)
    broadcastToWindows('cierres-changed', {})
    return saved
  })

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

  ipcMain.handle('pick-note-images', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Añadir imágenes',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Imágenes',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
        }
      ]
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true, images: [] }
    const images = []
    const errors = []
    for (const filePath of result.filePaths) {
      try {
        images.push(saveNoteAttachmentFromPath(filePath))
      } catch (error) {
        errors.push(error.message)
      }
    }
    return { canceled: false, images, errors }
  })

  ipcMain.handle('capture-window-region', async (event, rect) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { ok: false, error: 'Ventana no disponible' }
      const bounds = win.getContentBounds()
      const x = Math.max(0, Math.round(Number(rect?.x) || 0))
      const y = Math.max(0, Math.round(Number(rect?.y) || 0))
      const width = Math.min(
        Math.max(0, bounds.width - x),
        Math.max(1, Math.round(Number(rect?.width) || 0))
      )
      const height = Math.min(
        Math.max(0, bounds.height - y),
        Math.max(1, Math.round(Number(rect?.height) || 0))
      )
      if (width < 2 || height < 2) return { ok: false, error: 'El video no está visible' }
      const image = await win.capturePage({ x, y, width, height })
      if (image.isEmpty()) return { ok: false, error: 'Captura vacía' }
      return {
        ok: true,
        dataBase64: image.toPNG().toString('base64'),
        mimeType: 'image/png'
      }
    } catch (error) {
      return { ok: false, error: error.message || 'No se pudo capturar' }
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

  ipcMain.handle('export-courses-zip', async (event, coursePaths) => {
    if (activeCourseZip) {
      return { ok: false, error: 'Ya hay una exportación en curso' }
    }
    const paths = Array.isArray(coursePaths) ? coursePaths : []
    const job = { canceled: false }
    activeCourseZip = job
    let destPath = ''
    try {
      const parent = BrowserWindow.fromWebContents(event.sender) || mainWindow
      const stamp = new Date().toISOString().slice(0, 10)
      const result = await dialog.showSaveDialog(parent, {
        title: 'Exportar cursos',
        defaultPath: `cursos-${stamp}.zip`,
        filters: [
          { name: 'ZIP', extensions: ['zip'] },
          { name: 'Todos', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath || job.canceled) return { canceled: true }
      destPath = result.filePath.toLowerCase().endsWith('.zip')
        ? result.filePath
        : `${result.filePath}.zip`
      let lastSent = 0
      const summary = await exportCourseFolders(paths, destPath, {
        isCanceled: () => job.canceled,
        registerAbort: (abort) => {
          job.abort = abort
        },
        onProgress: (progress) => {
          const now = Date.now()
          if (now - lastSent < 250) return
          lastSent = now
          if (!event.sender.isDestroyed()) event.sender.send('course-zip-progress', progress)
        }
      })
      if (job.canceled) return { canceled: true }
      return { ok: true, canceled: false, path: destPath, ...summary }
    } catch (error) {
      if (error.code === 'CANCELED' || job.canceled) return { canceled: true }
      return { ok: false, error: error.message, skipped: error.skipped || [] }
    } finally {
      if (activeCourseZip === job) activeCourseZip = null
    }
  })

  ipcMain.handle('cancel-course-zip', () => {
    const job = activeCourseZip
    if (!job) return { ok: true }
    job.canceled = true
    job.abort?.()
    return { ok: true }
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

  ipcMain.handle('get-notion-sync', () => getNotionSyncStatus())
  ipcMain.handle('get-notion-debug', () => notionDebugReport())
  ipcMain.handle('set-notion-sync', async (_event, payload = {}) => {
    const result = await saveNotionSettings(payload)
    queueAllNotionDecks()
    return result
  })
  ipcMain.handle('sync-notion-now', (_event, findingId) => syncNotionNow(findingId || null))
  ipcMain.handle('resolve-notion-conflict', (_event, { findingId, choice } = {}) =>
    resolveNotionConflict(findingId, choice)
  )
  ipcMain.handle('resolve-all-local-note-conflicts', () => resolveAllLocalNoteConflicts())
  ipcMain.handle('resolve-notion-delete', (_event, { findingId, choice } = {}) =>
    resolveNotionDelete(findingId, choice)
  )
  ipcMain.handle('resolve-notion-playlist-conflict', (_event, { playlistId, choice } = {}) =>
    resolveNotionPlaylistConflict(playlistId, choice)
  )
  ipcMain.handle('resolve-notion-playlist-delete', (_event, { playlistId, choice } = {}) =>
    resolveNotionPlaylistDelete(playlistId, choice)
  )
  ipcMain.handle('resolve-notion-progress', (_event, { coursePath, choice } = {}) =>
    resolveNotionProgress(coursePath, choice)
  )
  ipcMain.handle('resolve-notion-project-conflict', (_event, { projectId, choice } = {}) =>
    resolveNotionProjectConflict(projectId, choice)
  )
  ipcMain.handle('resolve-notion-project-delete', (_event, { projectId, choice } = {}) =>
    resolveNotionProjectDelete(projectId, choice)
  )
  ipcMain.handle('resolve-notion-source-conflict', (_event, { sourceId, choice } = {}) =>
    resolveNotionSourceConflict(sourceId, choice)
  )
  ipcMain.handle('resolve-notion-source-delete', (_event, { sourceId, choice } = {}) =>
    resolveNotionSourceDelete(sourceId, choice)
  )

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
  installSourceViewerGuards()
  registerIpcHandlers()
  // Thumbnails are per computer. Links that came from another one (through Notion) or lost
  // their file get one fetched here, like a first save.
  setTimeout(() => {
    backfillSourceThumbnails(() => broadcastToWindows('sources-changed', {})).catch(() => {})
  }, 4000)
  startNotionSync({
    notifyNotes: () => broadcastToWindows('notes-changed', {}),
    notifyPlaylists: () => broadcastToWindows('playlists-changed', {}),
    notifyProgress: () => broadcastToWindows('progress-changed', {}),
    notifyProjects: () => broadcastToWindows('projects-changed', {}),
    notifySources: () => broadcastToWindows('sources-changed', {}),
    notifyCourse: (coursePath, data) =>
      broadcastToWindows('course-updated', {
        coursePath,
        property: 'isInProcess',
        value: Boolean(data?.isInProcess),
        fullData: data
      }),
    notifyStatus: (status) => broadcastToWindows('notion-sync', status),
    isActive: () => Boolean(BrowserWindow.getFocusedWindow())
  })
  setDeckNotionListener((deck) => broadcastToWindows('deck-notion', deck))
  queueAllNotionDecks()
  app.on('browser-window-focus', () => {
    pollNotionChanges()
  })
  startLibraryWatcher()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  flushLearningStore()
})

// Windows send their last playback position while closing, after before-quit has run.
app.on('will-quit', () => {
  flushLearningStore()
})

app.on('window-all-closed', () => {
  stopLibraryWatcher()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
