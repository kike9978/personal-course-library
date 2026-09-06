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
