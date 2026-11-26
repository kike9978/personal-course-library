import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { writeFileAtomicSync } from './atomicFile.js'

const CONFIG_FILE = 'library-config.json'

function getConfigFilePath() {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}

// The config only changes through this module, so it is read from disk once per session.
let configCache = null
const VALID_PATH_TTL_MS = 2000
let validPathCache = { path: null, valid: false, at: 0 }

function loadConfigFromDisk() {
  try {
    const configPath = getConfigFilePath()
    if (!fs.existsSync(configPath)) return {}
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/** A shallow copy: callers change top-level keys and then write it back. */
function readConfig() {
  if (!configCache) configCache = loadConfigFromDisk()
  return { ...configCache }
}

function writeConfig(config) {
  writeFileAtomicSync(getConfigFilePath(), JSON.stringify(config, null, 2))
  configCache = { ...config }
  validPathCache = { path: null, valid: false, at: 0 }
}

export function getLibraryPath() {
  const { libraryPath } = readConfig()
  if (!libraryPath || typeof libraryPath !== 'string') {
    return null
  }
  return path.normalize(libraryPath)
}

export function setLibraryPath(libraryPath) {
  if (!libraryPath || typeof libraryPath !== 'string') {
    throw new Error('Library path must be a non-empty string')
  }

  const normalized = path.normalize(libraryPath)
  if (!fs.existsSync(normalized)) {
    throw new Error(`Library path does not exist: ${normalized}`)
  }

  const stat = fs.statSync(normalized)
  if (!stat.isDirectory()) {
    throw new Error(`Library path is not a directory: ${normalized}`)
  }

  const config = readConfig()
  config.libraryPath = normalized
  writeConfig(config)
  return normalized
}

export function clearLibraryPath() {
  const config = readConfig()
  delete config.libraryPath
  writeConfig(config)
}

export function getNotionConfig() {
  const notion = readConfig().notion
  if (!notion || typeof notion !== 'object') {
    return { enabled: false, token: '', databaseId: '' }
  }
  return {
    enabled: notion.enabled === true,
    token: typeof notion.token === 'string' ? notion.token : '',
    databaseId: typeof notion.databaseId === 'string' ? notion.databaseId : ''
  }
}

export function setNotionConfig(notion) {
  const config = readConfig()
  config.notion = {
    enabled: notion.enabled === true,
    token: typeof notion.token === 'string' ? notion.token : '',
    databaseId: typeof notion.databaseId === 'string' ? notion.databaseId : ''
  }
  writeConfig(config)
  return getNotionConfig()
}

/**
 * Where this computer keeps project folders (e.g. a Syncthing folder). Each device sets its
 * own; projects store their folder relative to it, so the link works on every computer.
 */
export function getProjectsRoot() {
  const { projectsRoot } = readConfig()
  if (!projectsRoot || typeof projectsRoot !== 'string') return null
  return path.normalize(projectsRoot)
}

export function setProjectsRoot(projectsRoot) {
  const config = readConfig()
  if (!projectsRoot) {
    delete config.projectsRoot
    writeConfig(config)
    return null
  }
  const normalized = path.normalize(String(projectsRoot))
  const stat = fs.statSync(normalized, { throwIfNoEntry: false })
  if (!stat?.isDirectory()) {
    throw new Error(`La carpeta de proyectos no existe: ${normalized}`)
  }
  config.projectsRoot = normalized
  writeConfig(config)
  return normalized
}

/** Opt-in Instagram sign-in for the Fuentes viewer (Phase 2b). Off unless the person turns it on. */
export function getInstagramViewerConfig() {
  const value = readConfig().instagramViewer
  return { enabled: Boolean(value && typeof value === 'object' && value.enabled === true) }
}

export function setInstagramViewerConfig({ enabled }) {
  const config = readConfig()
  config.instagramViewer = { enabled: enabled === true }
  writeConfig(config)
  return getInstagramViewerConfig()
}

/**
 * Whether the folder exists. Checked at most every couple of seconds per path: this runs on
 * every catalog read and media request, and a drive coming or going shows up on the next check.
 */
export function isLibraryPathValid(libraryPath = getLibraryPath()) {
  if (!libraryPath) return false
  const now = Date.now()
  if (validPathCache.path === libraryPath && now - validPathCache.at < VALID_PATH_TTL_MS) {
    return validPathCache.valid
  }
  let valid = false
  try {
    valid = fs.statSync(libraryPath).isDirectory()
  } catch {
    valid = false
  }
  validPathCache = { path: libraryPath, valid, at: now }
  return valid
}
