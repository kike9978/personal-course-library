import { app, shell, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron'
import { join } from 'path'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'

function setupConsoleRedirection() {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;

  console.log = (...args) => {
    originalConsoleLog(...args);
    logToRenderer('log', ...args);
  };

  console.error = (...args) => {
    originalConsoleError(...args);
    logToRenderer('error', ...args);
  };

  console.warn = (...args) => {
    originalConsoleWarn(...args);
    logToRenderer('warn', ...args);
  };

  console.info = (...args) => {
    originalConsoleInfo(...args);
    logToRenderer('info', ...args);
  };
}

function logToRenderer(type, ...args) {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const mainWindow = windows[0];
    try {
      const safeArgs = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return arg;
      });
      mainWindow.webContents.send('console-message', { type, args: safeArgs });
    } catch (error) {
      // Fallback if sending to renderer fails
    }
  }
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
app.on('ready', () => {
  setupConsoleRedirection();

  ipcMain.handle('getNativeImage', (e, pathToImage) => {
    try {
      const image = nativeImage.createFromPath(pathToImage)
      const imageDataURL = image.toDataURL()
      return imageDataURL
    } catch (error) {
      console.error('Error loading image:', error)
      return null
    }
  })

  ipcMain.handle('findCoverImage', (e, basePath, coursePath) => {
    const formats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
    
    for (const format of formats) {
      const imagePath = path.join(basePath, coursePath, `cover-image.${format}`)
      try {
        if (fs.existsSync(imagePath)) {
          const image = nativeImage.createFromPath(imagePath)
          return image.toDataURL()
        }
      } catch (error) {
        console.error(`Error checking ${format} image:`, error)
      }
    }
    
    return null // No image found in any format
  })

  ipcMain.handle('refreshCourseList', () => {
    try {
      // Re-initialize the course list
      const courses = courseList()
      
      // Recreate cover images
      const coursesCoverImages = {}
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
      
      return { courses, coursesCoverImages }
    } catch (error) {
      console.error('Error refreshing course list:', error)
      throw error
    }
  })

  ipcMain.on('error-handler', (event, error) => {
    dialog.showErrorBox('Application Error', `
      Message: ${error.message}
      Stack: ${error.stack}
    `)
  })

  ipcMain.on('show-debug-window', () => {
    const debugWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })
    
    debugWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#debug')
  })

  // Add a handler for console logs from renderer
  ipcMain.on('renderer-log', (event, { type, args }) => {
    switch (type) {
      case 'log':
        console.log(...args);
        break;
      case 'error':
        console.error(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'info':
        console.info(...args);
        break;
    }
  });

  ipcMain.handle('write-course-property', async (event, { coursePath, property, value }) => {
    try {
      console.log(`Main process: Updating course property ${property} for ${coursePath}`);
      
      // Get the base path from the preload script
      const basePath = app.getPath('userData');
      console.log(`Main process: Base path: ${basePath}`);
      
      // Determine if the path is absolute or relative
      const isAbsolutePath = path.isAbsolute(coursePath);
      console.log(`Main process: Path is ${isAbsolutePath ? 'absolute' : 'relative'}`);
      
      // Construct the proper file path
      let filePath;
      if (isAbsolutePath) {
        filePath = path.join(coursePath, 'courseProps.json');
      } else {
        filePath = path.join(basePath, coursePath, 'courseProps.json');
      }
      
      console.log(`Main process: Full file path: ${filePath}`);
      
      // Check if the file exists
      if (!fs.existsSync(filePath)) {
        console.error(`Main process: File does not exist: ${filePath}`);
        return { success: false, error: 'File does not exist' };
      }
      
      // Read the current data
      let data;
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        data = JSON.parse(fileContent);
      } catch (readErr) {
        console.error(`Main process: Error reading file:`, readErr);
        return { success: false, error: readErr.message };
      }
      
      // Update the property
      data[property] = value;
      
      // Write it back
      try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Main process: Successfully wrote to file: ${filePath}`);
        return { success: true };
      } catch (writeErr) {
        console.error(`Main process: Error writing file:`, writeErr);
        return { success: false, error: writeErr.message };
      }
    } catch (error) {
      console.error(`Main process: Error:`, error);
      return { success: false, error: error.message };
    }
  });
})
