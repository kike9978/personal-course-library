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
        const validChannels = [
          'getNativeImage', 
          'findCoverImage', 
          'refreshCourseList',
          'write-course-property'
        ];
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
      updateCourseProperty: (coursePath, property, value) => {
        try {
          console.log(`Updating course property: ${property} for ${coursePath}`);
          
          // Check if coursePath exists
          if (!fs.existsSync(coursePath)) {
            console.error(`Course path does not exist: ${coursePath}`);
            return false;
          }
          
          // Construct the proper file path
          const filePath = path.join(coursePath, 'courseProps.json');
          console.log(`Full file path: ${filePath}`);
          
          // Check if the file exists
          if (!fs.existsSync(filePath)) {
            console.error(`File does not exist: ${filePath}`);
            return false;
          }
          
          // Read the current data
          let data;
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            console.log(`File content read: ${fileContent.substring(0, 100)}...`);
            
            data = JSON.parse(fileContent);
            console.log(`Successfully parsed JSON from file: ${filePath}`);
          } catch (readErr) {
            console.error(`Error reading file ${filePath}:`, readErr);
            return false;
          }
          
          // Update the property
          const oldValue = JSON.stringify(data[property]);
          data[property] = value;
          console.log(`Updated property ${property} from ${oldValue} to ${JSON.stringify(value)}`);
          
          // Write it back
          try {
            const jsonString = JSON.stringify(data, null, 2);
            console.log(`Preparing to write: ${jsonString.substring(0, 100)}...`);
            
            fs.writeFileSync(filePath, jsonString, 'utf8');
            console.log(`Successfully wrote to file: ${filePath}`);
            
            // Verify the write was successful
            const verifyContent = fs.readFileSync(filePath, 'utf8');
            console.log(`Verification read: ${verifyContent.substring(0, 100)}...`);
            
            return true;
          } catch (writeErr) {
            console.error(`Error writing to file ${filePath}:`, writeErr);
            return false;
          }
        } catch (error) {
          console.error(`Error updating course property ${property}:`, error);
          return false;
        }
      },
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
    updateCourseProperty: (coursePath, property, value) => {
      try {
        console.log(`Updating course property: ${property} for ${coursePath}`);
        
        // Check if coursePath exists
        if (!fs.existsSync(coursePath)) {
          console.error(`Course path does not exist: ${coursePath}`);
          return false;
        }
        
        // Construct the proper file path
        const filePath = path.join(coursePath, 'courseProps.json');
        console.log(`Full file path: ${filePath}`);
        
        // Check if the file exists
        if (!fs.existsSync(filePath)) {
          console.error(`File does not exist: ${filePath}`);
          return false;
        }
        
        // Read the current data
        let data;
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          console.log(`File content read: ${fileContent.substring(0, 100)}...`);
          
          data = JSON.parse(fileContent);
          console.log(`Successfully parsed JSON from file: ${filePath}`);
        } catch (readErr) {
          console.error(`Error reading file ${filePath}:`, readErr);
          return false;
        }
        
        // Update the property
        const oldValue = JSON.stringify(data[property]);
        data[property] = value;
        console.log(`Updated property ${property} from ${oldValue} to ${JSON.stringify(value)}`);
        
        // Write it back
        try {
          const jsonString = JSON.stringify(data, null, 2);
          console.log(`Preparing to write: ${jsonString.substring(0, 100)}...`);
          
          fs.writeFileSync(filePath, jsonString, 'utf8');
          console.log(`Successfully wrote to file: ${filePath}`);
          
          // Verify the write was successful
          const verifyContent = fs.readFileSync(filePath, 'utf8');
          console.log(`Verification read: ${verifyContent.substring(0, 100)}...`);
          
          return true;
        } catch (writeErr) {
          console.error(`Error writing to file ${filePath}:`, writeErr);
          return false;
        }
      } catch (error) {
        console.error(`Error updating course property ${property}:`, error);
        return false;
      }
    },
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
    console.log(`Writing to file: ${filePath}`);
    // Make sure we're using the correct encoding
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    return false;
  }
}

const api = {
  // ... existing API methods
  
  writeFile: (filePath, content) => {
    try {
      console.log(`API writeFile called for: ${filePath}`);
      return writeFile(filePath, content);
    } catch (error) {
      console.error('Error in API writeFile:', error);
      return false;
    }
  },
  
  // Add a more direct method to update course properties
  updateCourseProperty: (coursePath, property, value) => {
    try {
      console.log(`Updating course property: ${property} for ${coursePath}`);
      
      // Construct the proper file path
      const filePath = path.join(coursePath, 'courseProps.json');
      
      // Read the current data
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Update the property
      data[property] = value;
      
      // Write it back
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      
      return true;
    } catch (error) {
      console.error(`Error updating course property ${property}:`, error);
      return false;
    }
  }
}

// Add this at the end of your preload script to test file writing
try {
  const testPath = path.join(basePath, 'test-write.txt');
  fs.writeFileSync(testPath, 'Test write from preload', 'utf8');
  console.log(`Successfully wrote test file to: ${testPath}`);
} catch (err) {
  console.error('Failed to write test file:', err);
}
