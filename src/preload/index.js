import { contextBridge, nativeImage } from 'electron'
const { shell } = require('electron')
const fs = require('fs')
import { electronAPI } from '@electron-toolkit/preload'
import courseList from '../scripts/iterateCourseFolder'
import { readJSON, extensions } from '../scripts/iterateCourseFolder'
import { updateInProcessState, updateCourseProgramsList } from '../scripts/updateJson'

const imgPath = '/Users/kike/Desktop/Perfil.jpeg'

const coverImage = nativeImage.createFromPath(imgPath)
const coverImageDataURL = coverImage.toDataURL()

const coursesCoverImages = {}

function createCoursesCoverImages() {
  courseList().forEach((course) => {
    const filePath = `${extensions.macos}${course}/cover-image.png`
    if (!fs.existsSync(filePath)) {
      return
    }
    coursesCoverImages[readJSON(course).title] = nativeImage
      .createFromPath(filePath)
      .toDataURL()
  })
}

console.table(courseList())
createCoursesCoverImages()
console.table(coursesCoverImages)
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
    contextBridge.exposeInMainWorld('courseList', courseList())
    contextBridge.exposeInMainWorld('openFolder', openFolder)
    contextBridge.exposeInMainWorld('readJSON', readJSON)
    contextBridge.exposeInMainWorld('updateInProcessState', updateInProcessState)
    contextBridge.exposeInMainWorld('updateCourseProgramsList', updateCourseProgramsList)
    contextBridge.exposeInMainWorld('extensions', extensions)
    contextBridge.exposeInMainWorld('coverImageDataURL', coverImageDataURL)
    contextBridge.exposeInMainWorld('coursesCoverImages', coursesCoverImages)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.courseList = courseList()
  window.openFolder = openFolder
  window.readJSON = readJSON
  window.updateInProcessState = updateInProcessState
  window.updateCourseProgramsList = updateCourseProgramsList
  window.extensions = extensions
  window.coverImageDataURL = coverImageDataURL
  window.coursesCoverImages = coursesCoverImages
}
