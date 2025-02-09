import { contextBridge, nativeImage, ipcRenderer } from 'electron'
const { shell } = require('electron')
const fs = require('fs')
import { electronAPI } from '@electron-toolkit/preload'
import { readJSON, basePath, courseList, iterateCourseFolder } from '../scripts/iterateCourseFolder'
import { updateInProcessState, updateCourseProgramsList } from '../scripts/updateJson'
import path from 'path'
import { collectDebugInfo } from '../renderer/src/utils/debugInfo'

const coursesCoverImages = {}

function createCoursesCoverImages() {
  try {
    const courses = courseList(); // Get the list of courses
    courses.forEach((course) => {
      try {
        const filePath = path.join(basePath, course, 'cover-image.png')
        if (fs.existsSync(filePath)) {
          coursesCoverImages[readJSON(course).title] = nativeImage.createFromPath(filePath).toDataURL()
        }
      } catch (error) {
        console.error(`Error processing cover image for ${course}: ${error.message}`)
      }
    })
  } catch (error) {
    console.error(`Failed to create cover images: ${error.message}`)
    throw error
  }
}

console.table(courseList())
createCoursesCoverImages()
console.table(coursesCoverImages)
// Custom APIs for renderer

function openFolder(extension) {
  shell.openPath(path.join(basePath, extension))
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)
    contextBridge.exposeInMainWorld('courseList', courseList())
    contextBridge.exposeInMainWorld('openFolder', openFolder)
    contextBridge.exposeInMainWorld('readJSON', readJSON)
    contextBridge.exposeInMainWorld('updateInProcessState', updateInProcessState)
    contextBridge.exposeInMainWorld('updateCourseProgramsList', updateCourseProgramsList)
    contextBridge.exposeInMainWorld('fileSystem', {
      basePath,
      courseList: courseList(),
      openFolder: (courseDir) => shell.openPath(path.join(basePath, courseDir)),
      readJSON,
      updateInProcessState,
      updateCourseProgramsList,
      handleError: (error) => {
        ipcRenderer.send('error-handler', {
          message: error.message,
          stack: error.stack
        })
      },
      verifyPath: async () => {
        // Your verifyPath logic here
      }
    })
    contextBridge.exposeInMainWorld('coursesCoverImages', coursesCoverImages)
    contextBridge.exposeInMainWorld('debug', {
      getDebugInfo: () => collectDebugInfo(),
      showDebug: () => ipcRenderer.send('show-debug-window')
    })
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.ipcRenderer = ipcRenderer
  window.courseList = courseList()
  window.openFolder = openFolder
  window.readJSON = readJSON
  window.updateInProcessState = updateInProcessState
  window.updateCourseProgramsList = updateCourseProgramsList
  window.fileSystem = {
    basePath,
    courseList: courseList(),
    openFolder: (courseDir) => shell.openPath(path.join(basePath, courseDir)),
    readJSON,
    updateInProcessState,
    updateCourseProgramsList,
    handleError: (error) => {
      ipcRenderer.send('error-handler', {
        message: error.message,
        stack: error.stack
      })
    },
    verifyPath: async () => {
      // Your verifyPath logic here
    }
  }
  window.coursesCoverImages = coursesCoverImages
}
