import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const dest = path.join(root, 'src/renderer/public/fonts')

if (!fs.existsSync(src)) {
  console.warn('[copy-excalidraw-fonts] Excalidraw fonts not found — skip')
  process.exit(0)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })
console.log('[copy-excalidraw-fonts] Copied fonts to src/renderer/public/fonts')
