import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const STORE_FILE = 'learning-store.json'

function getStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE)
}

function emptyStore() {
  return {
    version: 1,
    courses: {}
  }
}

function emptyCourseState() {
  return {
    lastLessonRelativePath: null,
    lastPositionSec: 0,
    lastOpenedAt: null,
    lessons: {}
  }
}

function readStore() {
  try {
    const filePath = getStorePath()
    if (!fs.existsSync(filePath)) return emptyStore()
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !data.courses) return emptyStore()
    return data
  } catch {
    return emptyStore()
  }
}

function writeStore(store) {
  const filePath = getStorePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8')
}

function courseKey(coursePath) {
  return path.basename(coursePath)
}

export function getCourseProgress(coursePath) {
  const store = readStore()
  const key = courseKey(coursePath)
  return store.courses[key] || emptyCourseState()
}

/**
 * Update progress for a lesson and optionally set as last watched.
 * @param {string} coursePath
 * @param {{ relativePath: string, positionSec?: number, completed?: boolean, setAsLast?: boolean }} update
 */
export function setLessonProgress(coursePath, update) {
  const store = readStore()
  const key = courseKey(coursePath)
  const course = store.courses[key] || emptyCourseState()
  const relativePath = update.relativePath
  if (!relativePath) {
    throw new Error('relativePath is required')
  }

  const existing = course.lessons[relativePath] || {
    positionSec: 0,
    completed: false,
    lastOpenedAt: null
  }

  const next = {
    ...existing,
    positionSec:
      typeof update.positionSec === 'number'
        ? Math.max(0, update.positionSec)
        : existing.positionSec,
    completed:
      typeof update.completed === 'boolean' ? update.completed : existing.completed,
    lastOpenedAt: Date.now()
  }

  course.lessons[relativePath] = next

  if (update.setAsLast !== false) {
    course.lastLessonRelativePath = relativePath
    course.lastPositionSec = next.positionSec
    course.lastOpenedAt = Date.now()
  }

  store.courses[key] = course
  writeStore(store)
  return course
}

export function getLessonProgress(coursePath, relativePath) {
  const course = getCourseProgress(coursePath)
  return (
    course.lessons[relativePath] || {
      positionSec: 0,
      completed: false,
      lastOpenedAt: null
    }
  )
}
