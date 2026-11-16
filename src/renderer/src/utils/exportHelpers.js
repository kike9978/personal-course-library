/**
 * Shared helpers for exporting note content / drawings via Electron save dialog.
 */

import { courseMediaNoteFile, markdownImageDestination } from '../../../shared/notionSync.js'

export async function exportViaDialog({ defaultPath, filters, dataBase64, dataText }) {
  if (!window.api?.exportFile) {
    throw new Error('Exportación no disponible')
  }
  const result = await window.api.exportFile({
    defaultPath,
    filters,
    dataBase64: dataBase64 || null,
    dataText: dataText != null ? String(dataText) : null
  })
  if (result?.canceled) return { canceled: true }
  if (!result?.ok) throw new Error(result?.error || 'No se pudo exportar')
  return { canceled: false, path: result.path }
}

function slugifyFilename(name, fallback = 'export') {
  const base = String(name || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return base || fallback
}

export function noteExportBasename(title) {
  return slugifyFilename(title, 'anotacion')
}

function yamlScalar(value) {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  if (!s) return '""'
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

/**
 * Build a markdown document with YAML front matter for annotation export.
 */
export function buildNoteMarkdownDocument({ title, bodyMarkdown, meta = {} }) {
  const lines = [`title: ${yamlScalar(title || 'Anotación')}`]
  for (const [key, value] of Object.entries(meta)) {
    if (value == null || !String(value).trim()) continue
    lines.push(`${key}: ${yamlScalar(value)}`)
  }
  const body = String(bodyMarkdown || '').replace(/\s+$/, '')
  return `---\n${lines.join('\n')}\n---\n\n${body}${body ? '\n' : ''}`
}

/**
 * Collect course-media note attachment filenames referenced in markdown.
 * @returns {{ file: string, markdownUrl: string }[]}
 */
export function listMarkdownNoteAssets(markdown) {
  const text = String(markdown || '')
  const found = []
  const seen = new Set()
  for (const match of text.matchAll(/!\[[^\]]*\]\(([^)\n]*)\)/g)) {
    const fileRaw = courseMediaNoteFile(match[1])
    if (!fileRaw || seen.has(fileRaw)) continue
    seen.add(fileRaw)
    let file = fileRaw
    try {
      file = decodeURIComponent(fileRaw)
    } catch {
      // The markdown already has the raw name.
    }
    found.push({ file, markdownUrl: markdownImageDestination(match[1]).src })
  }
  return found
}

/**
 * Rewrite course-media image URLs to relative ./assets/ paths for portable .md export.
 */
export function rewriteMarkdownAssetLinks(markdown, assetDirName = 'assets') {
  return String(markdown || '').replace(/(!\[[^\]]*]\()([^)\n]*)(\))/g, (full, open, dest, close) => {
    const fileRaw = courseMediaNoteFile(dest)
    if (!fileRaw) return full
    let file = fileRaw
    try {
      file = decodeURIComponent(fileRaw)
    } catch {
      // The markdown already has the raw name.
    }
    const base = file.split(/[/\\]/).pop()
    const title = markdownImageDestination(dest).title
    return `${open}./${assetDirName}/${base}${title ? ` ${title}` : ''}${close}`
  })
}
