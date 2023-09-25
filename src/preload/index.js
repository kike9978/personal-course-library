import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import courseList from "../scripts/iterateCourseFolder"
const fs = require("fs");
const path = require("path");


// Custom APIs for renderer
const api = {}
const hola = "hola"
const courseList2 = fs.readdirSync(path.resolve(__dirname, "/Volumes/MacWin/Cursos/_All Courses/"))

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld("courseList", courseList)
    contextBridge.exposeInMainWorld("courseList2", courseList2)
    contextBridge.exposeInMainWorld("hola", hola)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
