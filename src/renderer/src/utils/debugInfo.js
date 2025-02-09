export const debugInfo = {
  basePath: window.fileSystem?.basePath || 'Not loaded',
  courses: [],
  courseCount: 0,
  lastError: null,
  fileChecks: []
}

export function collectDebugInfo() {
  return {
    ...debugInfo,
    courses: window.fileSystem?.courseList() || [],
    courseCount: debugInfo.courses.length,
    currentTime: new Date().toISOString()
  }
} 