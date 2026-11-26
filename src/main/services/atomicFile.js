import fs from 'fs'
import path from 'path'

/**
 * Crash-safe file writes. The data goes to a temp file next to the target, is flushed to disk,
 * then renamed over the target. A crash or power cut leaves either the old file or the new one,
 * never a half-written one.
 */

function tempPathFor(filePath) {
  return `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`
}

/** Windows can refuse a rename over a file another process holds open (antivirus, indexer). */
function isRenameBlocked(error) {
  return error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'EBUSY'
}

export function writeFileAtomicSync(filePath, data, encoding = 'utf8') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = tempPathFor(filePath)
  const fd = fs.openSync(temp, 'w')
  try {
    fs.writeFileSync(fd, data, typeof data === 'string' ? encoding : undefined)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  try {
    fs.renameSync(temp, filePath)
  } catch (error) {
    if (!isRenameBlocked(error)) {
      fs.rmSync(temp, { force: true })
      throw error
    }
    // Fall back to copying: the full new contents are already safe on disk in the temp file.
    try {
      fs.copyFileSync(temp, filePath)
    } finally {
      fs.rmSync(temp, { force: true })
    }
  }
}

export async function writeFileAtomic(filePath, data, encoding = 'utf8') {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const temp = tempPathFor(filePath)
  const handle = await fs.promises.open(temp, 'w')
  try {
    await handle.writeFile(data, typeof data === 'string' ? encoding : undefined)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.promises.rename(temp, filePath)
  } catch (error) {
    if (!isRenameBlocked(error)) {
      await fs.promises.rm(temp, { force: true })
      throw error
    }
    try {
      await fs.promises.copyFile(temp, filePath)
    } finally {
      await fs.promises.rm(temp, { force: true })
    }
  }
}
