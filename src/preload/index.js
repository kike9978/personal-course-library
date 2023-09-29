import { contextBridge } from 'electron'
const { shell } = require('electron')
import { electronAPI } from '@electron-toolkit/preload'
import courseList from "../scripts/iterateCourseFolder"
import { readJSON, extensions, readCoverImg, isCoverImg } from "../scripts/iterateCourseFolder"

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
    contextBridge.exposeInMainWorld("readCoverImg", readCoverImg)
    contextBridge.exposeInMainWorld("isCoverImg", isCoverImg)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.courseList = courseList()
  window.openFolder = openFolder
  window.readJSON = readJSON
  window.readCoverImg = readCoverImg
  window.isCoverImg = isCoverImg
}
