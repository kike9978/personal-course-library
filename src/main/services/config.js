import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const CONFIG_FILE = 'library-config.json'

function getConfigFilePath() {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}

function readConfig() {
  try {
    const configPath = getConfigFilePath()
    if (!fs.existsSync(configPath)) {
      return {}
    }
    const raw = fs.readFileSync(configPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeConfig(config) {
  const configPath = getConfigFilePath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
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

export function isLibraryPathValid(libraryPath = getLibraryPath()) {
  if (!libraryPath) return false
  try {
    return fs.existsSync(libraryPath) && fs.statSync(libraryPath).isDirectory()
  } catch {
    return false
  }
}
