import fs from 'fs'
import path from 'path'
import { getLibraryPath, isLibraryPathValid } from './config.js'
import { courseFolderName, folderIsInsideLibrary } from '../../shared/courseExportSelection.js'
import { folderResolver } from '../../shared/courseFolderMatch.js'
import { zipFolders } from './zipFolders.js'

/**
 * Map catalog folder names to real directories inside the library.
 * Anything outside that folder is skipped.
 */
export function resolveCourseFolders(coursePaths) {
  const libraryPath = getLibraryPath()
  if (!isLibraryPathValid(libraryPath)) {
    throw new Error('La biblioteca no está configurada')
  }
  const libraryReal = fs.realpathSync(libraryPath)
  let folderNames = []
  try {
    folderNames = fs
      .readdirSync(libraryReal, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    folderNames = []
  }
  const resolve = folderResolver(folderNames)
  const folders = []
  const skipped = []
  const seen = new Set()

  for (const raw of Array.isArray(coursePaths) ? coursePaths : []) {
    const requested = courseFolderName(raw)
    const name = requested ? resolve(requested) : ''
    if (!name || seen.has(name)) continue
    seen.add(name)
    const linked = path.join(libraryReal, name)
    let real
    try {
      real = fs.realpathSync(linked)
    } catch {
      skipped.push({ name, reason: 'No está en la biblioteca' })
      continue
    }
    if (!folderIsInsideLibrary(libraryReal, real) || !fs.statSync(real).isDirectory()) {
      skipped.push({ name, reason: 'Fuera de la biblioteca' })
      continue
    }
    folders.push({ name, folder: real })
  }

  return { folders, skipped }
}

export async function exportCourseFolders(coursePaths, destPath, options) {
  const { folders, skipped } = resolveCourseFolders(coursePaths)
  if (!folders.length) {
    const error = new Error(
      skipped.length
        ? 'Ninguna de esas carpetas está en la biblioteca'
        : 'Selecciona al menos un curso'
    )
    error.skipped = skipped
    throw error
  }
  await zipFolders(folders, destPath, options)
  return { count: folders.length, skipped }
}
