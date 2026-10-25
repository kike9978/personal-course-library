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
  openCourseFile: (coursePath, relativePath) =>
    ipcRenderer.invoke('open-course-file', { coursePath, relativePath }),
  revealCourseFile: (coursePath, relativePath) =>
    ipcRenderer.invoke('reveal-course-file', { coursePath, relativePath }),
  getCoverImageUrl: (coursePath) => ipcRenderer.invoke('get-cover-image-url', coursePath),
  searchCoverCandidates: (payload) => ipcRenderer.invoke('search-cover-candidates', payload),
  saveCourseCover: (payload) => ipcRenderer.invoke('save-course-cover', payload),
  saveCourseCoverFromData: (payload) => ipcRenderer.invoke('save-course-cover-from-data', payload),
  openGoogleImageSearch: (query) => ipcRenderer.invoke('open-google-image-search', query),
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
  recordCourseView: (coursePath) => ipcRenderer.invoke('record-course-view', coursePath),
  listNotes: (coursePath) => ipcRenderer.invoke('list-notes', coursePath),
  upsertNote: (coursePath, note) => ipcRenderer.invoke('upsert-note', { coursePath, note }),
  deleteNote: (coursePath, noteId) => ipcRenderer.invoke('delete-note', { coursePath, noteId }),
  listBookmarks: (coursePath) => ipcRenderer.invoke('list-bookmarks', coursePath),
  upsertBookmark: (coursePath, bookmark) =>
    ipcRenderer.invoke('upsert-bookmark', { coursePath, bookmark }),
  deleteBookmark: (coursePath, bookmarkId) =>
    ipcRenderer.invoke('delete-bookmark', { coursePath, bookmarkId }),
  listAllNotes: () => ipcRenderer.invoke('list-all-notes'),
  listTopics: () => ipcRenderer.invoke('list-topics'),
  upsertTopic: (topic) => ipcRenderer.invoke('upsert-topic', topic || {}),
  deleteTopic: (topicId) => ipcRenderer.invoke('delete-topic', topicId),
  listAllBookmarks: () => ipcRenderer.invoke('list-all-bookmarks'),
  getNotesSearchByCourse: () => ipcRenderer.invoke('get-notes-search-by-course'),
  revealLearningStore: () => ipcRenderer.invoke('reveal-learning-store'),
  generateCourseProps: (coursePath, overwrite = false) =>
    ipcRenderer.invoke('generate-course-props', { coursePath, overwrite }),
  repairCourseProps: (coursePath) => ipcRenderer.invoke('repair-course-props', coursePath),
  generateMissingCourseProps: () => ipcRenderer.invoke('generate-missing-course-props'),
  generateCoursePropsBatch: (coursePaths) =>
    ipcRenderer.invoke('generate-course-props-batch', coursePaths),
  saveCourseDescription: (coursePath, description) =>
    ipcRenderer.invoke('save-course-description', { coursePath, description }),
  saveCourseDescriptionBatch: (entries) =>
    ipcRenderer.invoke('save-course-description-batch', { entries }),
  listProjects: (coursePath) => ipcRenderer.invoke('list-projects', coursePath),
  listAllProjects: () => ipcRenderer.invoke('list-all-projects'),
  upsertProject: (coursePath, project) =>
    ipcRenderer.invoke('upsert-project', { coursePath, project }),
  deleteProject: (coursePath, projectId) =>
    ipcRenderer.invoke('delete-project', { coursePath, projectId }),
  listPlaylists: () => ipcRenderer.invoke('list-playlists'),
  upsertPlaylist: (playlist) => ipcRenderer.invoke('upsert-playlist', playlist),
  deletePlaylist: (playlistId) => ipcRenderer.invoke('delete-playlist', playlistId),
  getPlaylistIntent: () => ipcRenderer.invoke('get-playlist-intent'),
  savePlaylistIntent: (intent) => ipcRenderer.invoke('save-playlist-intent', intent),
  pickProjectFolder: () => ipcRenderer.invoke('pick-project-folder'),
  pickNoteImage: () => ipcRenderer.invoke('pick-note-image'),
  saveNoteImage: (payload) => ipcRenderer.invoke('save-note-image', payload),
  saveNoteDrawing: (payload) => ipcRenderer.invoke('save-note-drawing', payload),
  loadNoteDrawing: (drawingId) => ipcRenderer.invoke('load-note-drawing', drawingId),
  exportFile: (payload) => ipcRenderer.invoke('export-file', payload),
  exportMarkdownBundle: (payload) => ipcRenderer.invoke('export-markdown-bundle', payload),
  openProjectLink: (coursePath, projectId) =>
    ipcRenderer.invoke('open-project-link', { coursePath, projectId }),
  revealProjectLink: (coursePath, projectId) =>
    ipcRenderer.invoke('reveal-project-link', { coursePath, projectId }),
  openAnnotationsWindow: (options) => ipcRenderer.invoke('open-annotations-window', options || {}),
  focusMainWindow: () => ipcRenderer.invoke('focus-main-window'),
  annotationsJump: (payload) => ipcRenderer.invoke('annotations-jump', payload || {}),
  onCourseUpdated: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('course-updated', listener)
    return () => ipcRenderer.removeListener('course-updated', listener)
  },
  onLibraryChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('library-changed', listener)
    return () => ipcRenderer.removeListener('library-changed', listener)
  },
  onNotesChanged: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('notes-changed', listener)
    return () => ipcRenderer.removeListener('notes-changed', listener)
  },
  onAnnotationsJump: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('annotations-jump', listener)
    return () => ipcRenderer.removeListener('annotations-jump', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
