import { contextBridge, nativeImage, ipcRenderer, shell } from 'electron'
import fs from 'fs'
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
        // Check for multiple formats
        const formats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
        let imageFound = false
        
        for (const format of formats) {
          const filePath = path.join(basePath, course, `cover-image.${format}`)
          if (fs.existsSync(filePath)) {
            coursesCoverImages[readJSON(course).title] = nativeImage.createFromPath(filePath).toDataURL()
            imageFound = true
            break
          }
        }
        
        if (!imageFound && fs.existsSync(path.join(basePath, course, 'cover-image'))) {
          // Try without extension
          coursesCoverImages[readJSON(course).title] = nativeImage.createFromPath(
            path.join(basePath, course, 'cover-image')
          ).toDataURL()
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
    contextBridge.exposeInMainWorld('ipcRenderer', {
      // Explicitly expose all ipcRenderer methods we need
      on: (channel, func) => {
        const validChannels = ['console-message', 'error-handler'];
        if (validChannels.includes(channel)) {
          ipcRenderer.on(channel, (event, ...args) => func(event, ...args));
        }
      },
      once: (channel, func) => {
        const validChannels = ['console-message', 'error-handler'];
        if (validChannels.includes(channel)) {
          ipcRenderer.once(channel, (event, ...args) => func(event, ...args));
        }
      },
      removeListener: (channel, func) => {
        const validChannels = ['console-message', 'error-handler'];
        if (validChannels.includes(channel)) {
          ipcRenderer.removeListener(channel, func);
        }
      },
      send: (channel, data) => {
        const validChannels = ['renderer-log', 'error-handler', 'show-debug-window'];
        if (validChannels.includes(channel)) {
          ipcRenderer.send(channel, data);
        }
      },
      invoke: (channel, ...args) => {
        const validChannels = ['getNativeImage', 'findCoverImage', 'refreshCourseList'];
        if (validChannels.includes(channel)) {
          return ipcRenderer.invoke(channel, ...args);
        }
        return Promise.reject(new Error(`Unauthorized IPC invoke to channel: ${channel}`));
      }
    })
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
      writeFile,
      handleError: (error) => {
        ipcRenderer.send('error-handler', {
          message: error.message,
          stack: error.stack
        })
      },
      verifyPath: async () => {
        // Your verifyPath logic here
      },
      joinPath: (...parts) => path.join(...parts)
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
    writeFile,
    handleError: (error) => {
      ipcRenderer.send('error-handler', {
        message: error.message,
        stack: error.stack
      })
    },
    verifyPath: async () => {
      // Your verifyPath logic here
    },
    joinPath: (...parts) => path.join(...parts)
  }
  window.coursesCoverImages = coursesCoverImages
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    return false;
  }
}
