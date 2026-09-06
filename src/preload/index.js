import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getLibraryPath: () => ipcRenderer.invoke('get-library-path'),
  setLibraryPath: (libraryPath) => ipcRenderer.invoke('set-library-path', libraryPath),
  pickLibraryFolder: () => ipcRenderer.invoke('pick-library-folder'),
  listCourses: () => ipcRenderer.invoke('list-courses'),
  getCourse: (coursePath) => ipcRenderer.invoke('get-course', coursePath),
  updateCourse: (coursePath, updates) =>
    ipcRenderer.invoke('update-course', { coursePath, updates }),
  updateCourseProperty: (coursePath, property, value) =>
    ipcRenderer.invoke('update-course-property', { coursePath, property, value }),
  openCourseFolder: (coursePath) => ipcRenderer.invoke('open-course-folder', coursePath),
  getCoverImageUrl: (coursePath) => ipcRenderer.invoke('get-cover-image-url', coursePath),
  refreshCourses: () => ipcRenderer.invoke('refresh-courses'),
  scanCourse: (coursePath, force = false) =>
    ipcRenderer.invoke('scan-course', { coursePath, force }),
  getLessonMediaUrl: (coursePath, relativePath) =>
    ipcRenderer.invoke('get-lesson-media-url', { coursePath, relativePath }),
  getCourseProgress: (coursePath) => ipcRenderer.invoke('get-course-progress', coursePath),
  getAllCourseProgress: () => ipcRenderer.invoke('get-all-course-progress'),
  getLessonProgress: (coursePath, relativePath) =>
    ipcRenderer.invoke('get-lesson-progress', { coursePath, relativePath }),
  setLessonProgress: (coursePath, update) =>
    ipcRenderer.invoke('set-lesson-progress', { coursePath, ...update }),
  listNotes: (coursePath) => ipcRenderer.invoke('list-notes', coursePath),
  upsertNote: (coursePath, note) => ipcRenderer.invoke('upsert-note', { coursePath, note }),
  deleteNote: (coursePath, noteId) => ipcRenderer.invoke('delete-note', { coursePath, noteId }),
  listBookmarks: (coursePath) => ipcRenderer.invoke('list-bookmarks', coursePath),
  upsertBookmark: (coursePath, bookmark) =>
    ipcRenderer.invoke('upsert-bookmark', { coursePath, bookmark }),
  deleteBookmark: (coursePath, bookmarkId) =>
    ipcRenderer.invoke('delete-bookmark', { coursePath, bookmarkId }),
  listAllNotes: () => ipcRenderer.invoke('list-all-notes'),
  listAllBookmarks: () => ipcRenderer.invoke('list-all-bookmarks'),
  onCourseUpdated: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('course-updated', listener)
    return () => ipcRenderer.removeListener('course-updated', listener)
  },
  onLibraryChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('library-changed', listener)
    return () => ipcRenderer.removeListener('library-changed', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
