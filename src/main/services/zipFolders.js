import fs from 'fs'
import path from 'path'
import { rm } from 'fs/promises'
import { Transform } from 'stream'
import archiver from 'archiver'

function canceledError() {
  const error = new Error('Exportación cancelada')
  error.code = 'CANCELED'
  return error
}

/**
 * List regular files and their total size. Yields so a cancel can land
 * while a large library is being measured. Symlinks are skipped.
 */
async function collectFiles(folders, isCanceled) {
  const files = []
  let plannedBytes = 0
  let seen = 0

  for (const entry of folders) {
    const stack = [entry.folder]
    while (stack.length) {
      if (isCanceled?.()) throw canceledError()
      const current = stack.pop()
      let dirents = []
      try {
        dirents = fs.readdirSync(current, { withFileTypes: true })
      } catch {
        continue
      }
      for (const dirent of dirents) {
        const full = path.join(current, dirent.name)
        if (dirent.isSymbolicLink()) continue
        if (dirent.isDirectory()) {
          stack.push(full)
          continue
        }
        if (!dirent.isFile()) continue
        let size = 0
        try {
          size = fs.statSync(full).size
        } catch {
          continue
        }
        const rel = path.relative(entry.folder, full).split(path.sep).join('/')
        files.push({
          abs: full,
          name: path.posix.join(entry.name, rel),
          size
        })
        plannedBytes += size
        seen += 1
        if (seen % 40 === 0) await new Promise((resolve) => setImmediate(resolve))
      }
    }
  }

  return { files, plannedBytes }
}

function trackBytes(stream, onBytes) {
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      onBytes(chunk.length)
      callback(null, chunk)
    }
  })
  stream.on('error', (error) => counter.destroy(error))
  stream.pipe(counter)
  return counter
}

/**
 * Write course folders into a zip without compressing media.
 * Each entry is `{ name, folder }`. `name` is the folder inside the archive.
 * `registerAbort` receives a function that stops the current file immediately.
 */
export function zipFolders(entries, destPath, { onProgress, isCanceled, registerAbort } = {}) {
  const folders = Array.isArray(entries) ? entries : []
  if (!folders.length) {
    return Promise.reject(new Error('Ninguna carpeta de curso para exportar'))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let opened = false
    let archive = null
    let output = null
    let currentRead = null

    const fail = (error) => {
      if (settled) return
      settled = true
      const read = currentRead
      currentRead = null
      const stop = (stream) => {
        if (!stream || stream.destroyed) return
        stream.on('error', () => {})
        stream.destroy()
      }
      stop(read)
      try {
        archive?.abort()
      } catch {
        // The archive may already be closing.
      }
      const cleanup = (async () => {
        if (!opened || !output) return
        await new Promise((done) => {
          if (output.closed) {
            done()
            return
          }
          output.once('close', done)
          stop(output)
        })
        await rm(destPath, { force: true })
      })()
      cleanup.finally(() => reject(error))
    }

    const cancel = () => fail(canceledError())
    registerAbort?.(cancel)

    const report = (processedBytes, totalBytes) => {
      onProgress?.({
        processedBytes: Math.min(processedBytes, totalBytes || processedBytes),
        totalBytes
      })
    }

    ;(async () => {
      const { files, plannedBytes } = await collectFiles(folders, isCanceled)
      if (settled) return
      if (isCanceled?.()) {
        cancel()
        return
      }

      output = fs.createWriteStream(destPath)
      opened = true
      archive = archiver('zip', { store: true })
      let processed = 0
      let index = 0
      report(0, plannedBytes)

      output.on('close', () => {
        if (settled) return
        settled = true
        if (isCanceled?.()) {
          rm(destPath, { force: true }).finally(() => reject(canceledError()))
          return
        }
        resolve()
      })
      output.on('error', (error) => {
        if (settled || isCanceled?.()) return
        fail(error)
      })
      archive.on('error', (error) => {
        if (settled || isCanceled?.()) return
        fail(error)
      })
      archive.on('warning', (error) => {
        if (error.code === 'ENOENT') return
        if (settled || isCanceled?.()) return
        fail(error)
      })

      const pump = () => {
        if (settled) return
        if (isCanceled?.()) {
          cancel()
          return
        }
        if (index >= files.length) {
          archive.finalize()
          return
        }
        const file = files[index]
        index += 1
        const stream = fs.createReadStream(file.abs)
        currentRead = stream
        stream.on('error', (error) => {
          if (settled || isCanceled?.()) return
          fail(error)
        })
        const counted = trackBytes(stream, (bytes) => {
          processed += bytes
          const snapshot = processed
          queueMicrotask(() => {
            if (settled) return
            report(snapshot, plannedBytes)
          })
        })
        archive.append(counted, { name: file.name })
      }

      archive.on('entry', () => {
        currentRead = null
        pump()
      })
      archive.pipe(output)
      pump()
    })().catch((error) => fail(error))
  })
}
