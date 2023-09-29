import { contextBridge } from 'electron'
const { shell } = require('electron')
import { electronAPI } from '@electron-toolkit/preload'
import courseList from "../scripts/iterateCourseFolder"
import { readJSON, extensions } from "../scripts/iterateCourseFolder"
import updateInProgressState from '../scripts/updateJson'

// Custom APIs for renderer

function openFolder(extension) {
  shell.openPath(`${extensions.macos}${extension}`)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld("courseList", courseList())
    contextBridge.exposeInMainWorld("openFolder", openFolder)
    contextBridge.exposeInMainWorld("readJSON", readJSON)
    contextBridge.exposeInMainWorld("updateInProgressState", updateInProgressState)
    contextBridge.exposeInMainWorld("extensions", extensions)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.courseList = courseList()
  window.openFolder = openFolder
  window.readJSON = readJSON
  window.updateInProgressState = updateInProgressState
  window.extensions = extensions
}
