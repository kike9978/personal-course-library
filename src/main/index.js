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
app.on('ready', async () => {
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

  ipcMain.handle('readDirectory', async (event, directoryPath) => {
    try {
      console.log(`Reading directory: ${directoryPath}`);
      
      // Check if directory exists
      if (!fs.existsSync(directoryPath)) {
        throw new Error(`Directory does not exist: ${directoryPath}`);
      }
      
      const items = await fs.promises.readdir(directoryPath, { withFileTypes: true });
      
      const result = items.map(item => {
        const isDirectory = item.isDirectory();
        const itemPath = path.join(directoryPath, item.name);
        
        return {
          name: item.name,
          isDirectory,
          path: itemPath,
          type: isDirectory ? 'directory' : path.extname(item.name).slice(1) || 'file'
        };
      });
      
      return result;
    } catch (error) {
      console.error('Error reading directory:', error);
      throw error;
    }
  });

  ipcMain.handle('readFile', async (event, filePath) => {
    try {
      console.log(`Reading file: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      
      // Check file size before reading
      const stats = fs.statSync(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      // If file is too large, return a warning
      if (fileSizeInMB > 5) {
        return {
          content: `File is too large to display (${fileSizeInMB.toFixed(2)} MB)`,
          extension: path.extname(filePath).slice(1).toLowerCase(),
          path: filePath,
          isTooLarge: true
        };
      }
      
      // For binary files, just return info instead of content
      const extension = path.extname(filePath).slice(1).toLowerCase();
      const binaryExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'exe', 'dll'];
      
      if (binaryExtensions.includes(extension)) {
        return {
          content: `Binary file: ${path.basename(filePath)} (${fileSizeInMB.toFixed(2)} MB)`,
          extension,
          path: filePath,
          isBinary: true
        };
      }
      
      // Read text files
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      return {
        content,
        extension,
        path: filePath
      };
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  });

  // Add the findSimilarCourseDirectory function at the top level (outside any event handlers)
  const findSimilarCourseDirectory = async (basePath, courseName) => {
    try {
      console.log(`Searching for similar course directory in: ${basePath}`);
      
      if (!fs.existsSync(basePath)) {
        console.log(`Base path does not exist: ${basePath}`);
        return null;
      }
      
      // Read all directories in the base path
      const items = await fs.promises.readdir(basePath, { withFileTypes: true });
      const directories = items.filter(item => item.isDirectory());
      
      console.log(`Found ${directories.length} directories in base path`);
      
      // Extract key parts from the course name for matching
      const courseNameParts = courseName.split(' - ');
      const institution = courseNameParts[0]?.trim();
      const courseTitle = courseNameParts[1]?.trim();
      
      console.log(`Looking for institution: "${institution}", course title: "${courseTitle}"`);
      
      // First try to find an exact match
      for (const dir of directories) {
        if (dir.name.toLowerCase() === courseName.toLowerCase()) {
          const fullPath = path.join(basePath, dir.name);
          console.log(`Found exact match: ${fullPath}`);
          return fullPath;
        }
      }
      
      // Then try to find a directory that contains both the institution and course title
      if (institution && courseTitle) {
        for (const dir of directories) {
          const dirName = dir.name.toLowerCase();
          if (dirName.includes(institution.toLowerCase()) && 
              dirName.includes(courseTitle.toLowerCase())) {
            const fullPath = path.join(basePath, dir.name);
            console.log(`Found match with institution and title: ${fullPath}`);
            return fullPath;
          }
        }
        
        // Try just matching the course title
        for (const dir of directories) {
          const dirName = dir.name.toLowerCase();
          if (dirName.includes(courseTitle.toLowerCase())) {
            const fullPath = path.join(basePath, dir.name);
            console.log(`Found match with title: ${fullPath}`);
            return fullPath;
          }
        }
        
        // Try just matching the institution
        for (const dir of directories) {
          const dirName = dir.name.toLowerCase();
          if (dirName.includes(institution.toLowerCase())) {
            const fullPath = path.join(basePath, dir.name);
            console.log(`Found match with institution: ${fullPath}`);
            return fullPath;
          }
        }
      }
      
      // If no match found, return null
      console.log('No similar course directory found');
      return null;
    } catch (error) {
      console.error('Error finding similar course directory:', error);
      return null;
    }
  };

  // Add the getFullCoursePath handler inside the app.on('ready', ...) callback
  ipcMain.handle('getFullCoursePath', async (event, coursePath) => {
    try {
      console.log(`Main process: Getting full course path for: ${coursePath}`);
      
      // Get the userData path
      const userDataPath = app.getPath('userData');
      console.log(`Main process: User data path: ${userDataPath}`);
      
      // Try to find a similar course directory
      const similarPath = await findSimilarCourseDirectory(userDataPath, coursePath);
      if (similarPath) {
        console.log(`Main process: Found similar course directory: ${similarPath}`);
        return { 
          fullPath: similarPath,
          exists: true,
          foundSimilar: true,
          originalPath: coursePath
        };
      }
      
      // If no similar directory found, continue with the original logic
      // Get the app path
      const appPath = app.getAppPath();
      console.log(`Main process: App path: ${appPath}`);
      
      // Try different base paths
      const possiblePaths = [
        // 1. Direct path (if coursePath is already absolute)
        coursePath,
        
        // 2. Relative to userData
        path.join(userDataPath, coursePath),
        
        // 3. Relative to app directory
        path.join(appPath, coursePath),
        
        // 4. Relative to app's parent directory
        path.join(appPath, '..', coursePath),
        
        // 5. Relative to resources directory (for packaged app)
        path.join(process.resourcesPath || '', coursePath)
      ];
      
      // Check each path
      const results = possiblePaths.map(p => ({
        path: p,
        exists: fs.existsSync(p)
      }));
      
      console.log(`Main process: Path check results:`, results);
      
      // Find the first path that exists
      const validPath = results.find(r => r.exists);
      
      if (validPath) {
        console.log(`Main process: Found valid path: ${validPath.path}`);
        return { 
          fullPath: validPath.path,
          exists: true,
          allCheckedPaths: results
        };
      }
      
      // If no valid path found, return the userData-based path with debug info
      const defaultPath = path.join(userDataPath, coursePath);
      console.log(`Main process: No valid path found. Using default: ${defaultPath}`);
      
      return { 
        fullPath: defaultPath,
        exists: false,
        allCheckedPaths: results,
        userDataPath,
        appPath,
        resourcesPath: process.resourcesPath
      };
    } catch (error) {
      console.error('Error getting full course path:', error);
      return {
        error: error.message,
        stack: error.stack,
        exists: false
      };
    }
  });

  // Enhance the createMockCourseDirectory function with more detailed logging
  const createMockCourseDirectory = async () => {
    try {
      console.log('Starting mock course directory creation...');
      
      // Get the userData path
      const userDataPath = app.getPath('userData');
      console.log(`User data path: ${userDataPath}`);
      
      // Create courses directory path
      const coursesPath = path.join(userDataPath, 'courses');
      console.log(`Courses directory path: ${coursesPath}`);
      
      // Check if courses directory exists
      const coursesExists = fs.existsSync(coursesPath);
      console.log(`Courses directory exists: ${coursesExists}`);
      
      // Create courses directory if it doesn't exist
      if (!coursesExists) {
        console.log('Creating courses directory...');
        try {
          fs.mkdirSync(coursesPath, { recursive: true });
          console.log('Courses directory created successfully');
        } catch (mkdirErr) {
          console.error('Error creating courses directory:', mkdirErr);
          // Try an alternative approach
          console.log('Trying alternative directory creation...');
          fs.mkdirSync(coursesPath);
        }
      }
      
      // Verify courses directory was created
      const coursesExistsAfter = fs.existsSync(coursesPath);
      console.log(`Courses directory exists after creation attempt: ${coursesExistsAfter}`);
      
      if (!coursesExistsAfter) {
        throw new Error(`Failed to create courses directory at: ${coursesPath}`);
      }
      
      // Create a mock course directory
      const mockCoursePath = path.join(coursesPath, 'Mock Course');
      console.log(`Mock course path: ${mockCoursePath}`);
      
      // Check if mock course directory exists
      const mockCourseExists = fs.existsSync(mockCoursePath);
      console.log(`Mock course directory exists: ${mockCourseExists}`);
      
      if (!mockCourseExists) {
        console.log('Creating mock course directory...');
        try {
          fs.mkdirSync(mockCoursePath, { recursive: true });
          console.log('Mock course directory created successfully');
        } catch (mkdirErr) {
          console.error('Error creating mock course directory:', mkdirErr);
          // Try an alternative approach
          console.log('Trying alternative directory creation...');
          fs.mkdirSync(mockCoursePath);
        }
        
        // Verify mock course directory was created
        const mockCourseExistsAfter = fs.existsSync(mockCoursePath);
        console.log(`Mock course directory exists after creation attempt: ${mockCourseExistsAfter}`);
        
        if (!mockCourseExistsAfter) {
          throw new Error(`Failed to create mock course directory at: ${mockCoursePath}`);
        }
        
        // Create mock course files
        console.log('Creating mock course files...');
        
        // Create courseProps.json
        const coursePropsPath = path.join(mockCoursePath, 'courseProps.json');
        const coursePropsContent = JSON.stringify({
          title: "Mock Course",
          programs: ["Test Program"],
          theme: [],
          institution: "Test Institution",
          instructor: "Test Instructor",
          isIncomplete: false,
          isInProcess: true,
          isNew: true,
          rate: 0
        }, null, 2);
        
        try {
          fs.writeFileSync(coursePropsPath, coursePropsContent, 'utf8');
          console.log(`Created courseProps.json at: ${coursePropsPath}`);
        } catch (writeErr) {
          console.error('Error creating courseProps.json:', writeErr);
        }
        
        // Create README.md
        try {
          fs.writeFileSync(
            path.join(mockCoursePath, 'README.md'), 
            '# Mock Course\n\nThis is a mock course for testing the file browser.\n\n## Contents\n\n- Sample files\n- Sample directories'
          );
          console.log('Created README.md');
        } catch (writeErr) {
          console.error('Error creating README.md:', writeErr);
        }
        
        // Create notes.txt
        try {
          fs.writeFileSync(
            path.join(mockCoursePath, 'notes.txt'), 
            'These are some sample notes for the mock course.'
          );
          console.log('Created notes.txt');
        } catch (writeErr) {
          console.error('Error creating notes.txt:', writeErr);
        }
        
        // Create a subdirectory
        const subDirPath = path.join(mockCoursePath, 'Lessons');
        try {
          fs.mkdirSync(subDirPath, { recursive: true });
          console.log(`Created Lessons directory at: ${subDirPath}`);
          
          // Create some files in the subdirectory
          fs.writeFileSync(
            path.join(subDirPath, 'lesson1.txt'), 
            'This is the content of lesson 1.'
          );
          console.log('Created lesson1.txt');
          
          fs.writeFileSync(
            path.join(subDirPath, 'lesson2.txt'), 
            'This is the content of lesson 2.'
          );
          console.log('Created lesson2.txt');
        } catch (subDirErr) {
          console.error('Error creating Lessons subdirectory:', subDirErr);
        }
      }
      
      console.log(`Mock course directory ready at: ${mockCoursePath}`);
      return mockCoursePath;
    } catch (error) {
      console.error('Error creating mock course directory:', error);
      return null;
    }
  };

  // Create a mock course directory for testing
  const mockCoursePath = await createMockCourseDirectory();
  console.log(`Mock course path: ${mockCoursePath}`);

  // Add this IPC handler to get the user data path
  ipcMain.handle('getUserDataPath', async (event) => {
    try {
      const userDataPath = app.getPath('userData');
      return userDataPath;
    } catch (error) {
      console.error('Error getting user data path:', error);
      throw error;
    }
  });

  // Add this IPC handler to create a mock course directory
  ipcMain.handle('createMockCourseDirectory', async (event) => {
    try {
      const mockCoursePath = await createMockCourseDirectory();
      return mockCoursePath;
    } catch (error) {
      console.error('Error creating mock course directory:', error);
      throw error;
    }
  });

  // Add a fallback method to create a mock course in the current directory
  ipcMain.handle('createMockCourseInCurrentDir', async (event) => {
    try {
      console.log('Creating mock course in current directory...');
      
      // Get the current working directory
      const currentDir = process.cwd();
      console.log(`Current working directory: ${currentDir}`);
      
      // Create a mock course directory in the current directory
      const mockCoursePath = path.join(currentDir, 'MockCourse');
      console.log(`Mock course path in current directory: ${mockCoursePath}`);
      
      // Check if directory exists
      const exists = fs.existsSync(mockCoursePath);
      console.log(`Mock course directory exists: ${exists}`);
      
      if (!exists) {
        console.log('Creating mock course directory in current directory...');
        fs.mkdirSync(mockCoursePath, { recursive: true });
        
        // Create mock files
        fs.writeFileSync(
          path.join(mockCoursePath, 'README.md'), 
          '# Mock Course\n\nThis is a mock course created in the current directory.'
        );
        
        fs.writeFileSync(
          path.join(mockCoursePath, 'test.txt'), 
          'This is a test file in the mock course directory.'
        );
      }
      
      console.log(`Mock course in current directory ready at: ${mockCoursePath}`);
      return mockCoursePath;
    } catch (error) {
      console.error('Error creating mock course in current directory:', error);
      return null;
    }
  });

  // Add these IPC handlers to the main process
  ipcMain.handle('getTempDirectory', async (event) => {
    try {
      const tempDir = app.getPath('temp');
      console.log(`Temp directory: ${tempDir}`);
      return tempDir;
    } catch (error) {
      console.error('Error getting temp directory:', error);
      throw error;
    }
  });

  ipcMain.handle('createTestFile', async (event, directory) => {
    try {
      const testFilePath = path.join(directory, 'test-file.txt');
      console.log(`Creating test file at: ${testFilePath}`);
      
      fs.writeFileSync(testFilePath, 'This is a test file created by the app.', 'utf8');
      console.log('Test file created successfully');
      
      return testFilePath;
    } catch (error) {
      console.error('Error creating test file:', error);
      throw error;
    }
  });

  // Add this IPC handler to create a directory
  ipcMain.handle('createDirectory', async (event, directoryPath) => {
    try {
      console.log(`Creating directory at: ${directoryPath}`);
      
      if (fs.existsSync(directoryPath)) {
        console.log('Directory already exists');
        return true;
      }
      
      fs.mkdirSync(directoryPath, { recursive: true });
      
      // Create a courseProps.json file in the directory
      const coursePropsPath = path.join(directoryPath, 'courseProps.json');
      const coursePropsContent = JSON.stringify({
        title: path.basename(directoryPath),
        programs: [],
        theme: [],
        institution: "",
        instructor: "",
        isIncomplete: false,
        isInProcess: false,
        isNew: true,
        rate: 0
      }, null, 2);
      
      fs.writeFileSync(coursePropsPath, coursePropsContent, 'utf8');
      
      // Create a README.md file in the directory
      fs.writeFileSync(
        path.join(directoryPath, 'README.md'),
        `# ${path.basename(directoryPath)}\n\nThis is a course directory created by the app.`
      );
      
      console.log('Directory created successfully');
      return true;
    } catch (error) {
      console.error('Error creating directory:', error);
      return false;
    }
  });
})
