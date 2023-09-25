import { contextBridge } from 'electron'
const { shell } = require('electron')
import { electronAPI } from '@electron-toolkit/preload'
import courseList from "../scripts/iterateCourseFolder"
const fs = require("fs");
const path = require("path");


// Custom APIs for renderer
const courseList2 = fs.readdirSync(path.resolve(__dirname, "/Volumes/MacWin/Cursos/_All Courses/"))

function openFolder(extension) {
  shell.openPath(`/Volumes/MacWin/Cursos/_All Courses/${extension}`)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld("courseList", courseList)
    contextBridge.exposeInMainWorld("courseList2", courseList2)
    contextBridge.exposeInMainWorld("openFolder", openFolder)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.courseList2 = courseList2
  window.courseList = courseList
  window.openFolder = openFolder
}
