import fs from 'fs'
import path from 'path'
import { app, BrowserWindow } from 'electron'
import { READABLE_SCRIPT, cleanReadable } from '../../shared/readable.js'
import { SOURCES_PARTITION } from './sourceViewer.js'

/**
 * Saved copies of articles (Fuentes, Phase 3). The page is opened in a hidden window on the
 * public viewer's in-memory session (no cookies kept, no preload, sandboxed), its readable
 * text is taken from the real DOM, and the result is written to one JSON file per link.
 */

const LOAD_TIMEOUT_MS = 20_000
const SETTLE_MS = 1500

function copyDir() {
  return path.join(app.getPath('userData'), 'source-copies')
}

function copyPath(sourceId) {
  const safe = String(sourceId || '').replace(/[^\w-]/g, '')
  return safe ? path.join(copyDir(), `${safe}.json`) : null
}

async function readPageText(url) {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      partition: SOURCES_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      images: false
    }
  })
  win.webContents.setAudioMuted(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    await Promise.race([
      win.loadURL(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('La página tardó demasiado')), LOAD_TIMEOUT_MS)
      )
    ])
    // Pages that build their text with JavaScript need a moment after load.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    return {
      raw: await win.webContents.executeJavaScript(READABLE_SCRIPT),
      finalUrl: win.webContents.getURL()
    }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** Capture and store a readable copy. Returns the summary kept on the link. */
export async function saveSourceCopy(source) {
  if (!/^https?:\/\//i.test(String(source?.url || '')))
    throw new Error('Esta fuente no tiene una página')
  const { raw, finalUrl } = await readPageText(source.url)
  const copy = cleanReadable(raw, { url: finalUrl || source.url })
  if (!copy) throw new Error('No se encontró texto para guardar en esta página')
  const file = copyPath(source.id)
  await fs.promises.mkdir(copyDir(), { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify(copy))
  return { capturedAt: copy.capturedAt, wordCount: copy.wordCount, title: copy.title }
}

export async function readSourceCopy(sourceId) {
  const file = copyPath(sourceId)
  if (!file) return null
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

export async function deleteSourceCopy(sourceId) {
  const file = copyPath(sourceId)
  if (file) await fs.promises.rm(file, { force: true }).catch(() => {})
  const captions = captionsPath(sourceId)
  if (captions) await fs.promises.rm(captions, { force: true }).catch(() => {})
}

function captionsPath(sourceId) {
  const safe = String(sourceId || '').replace(/[^\w-]/g, '')
  return safe ? path.join(copyDir(), `${safe}.captions.json`) : null
}

/** Keep a video's transcript next to the link so it opens without the network. */
export async function saveSourceCaptions(sourceId, { lang, auto, cues } = {}) {
  const file = captionsPath(sourceId)
  if (!file || !Array.isArray(cues) || !cues.length) return null
  const clean = cues
    .filter((cue) => cue && typeof cue.text === 'string' && Number.isFinite(cue.start))
    .slice(0, 20_000)
    .map((cue) => ({
      start: Number(cue.start),
      end: Number(cue.end) || Number(cue.start),
      text: cue.text.slice(0, 2000)
    }))
  const data = { lang: String(lang || ''), auto: Boolean(auto), savedAt: Date.now(), cues: clean }
  await fs.promises.mkdir(copyDir(), { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify(data))
  return { lang: data.lang, auto: data.auto, savedAt: data.savedAt, count: clean.length }
}

export async function readSourceCaptions(sourceId) {
  const file = captionsPath(sourceId)
  if (!file) return null
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch {
    return null
  }
}
