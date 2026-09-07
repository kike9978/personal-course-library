/**
 * Shared helpers for exporting note content / drawings via Electron save dialog.
 */

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
  const re = /!\[[^\]]*]\((course-media:\/\/note\/\?file=([^)\s]+))\)/gi
  let match
  while ((match = re.exec(text))) {
    const markdownUrl = match[1]
    const file = decodeURIComponent(match[2] || '')
    if (file) found.push({ file, markdownUrl })
  }
  return found
}

/**
 * Rewrite course-media image URLs to relative ./assets/ paths for portable .md export.
 */
export function rewriteMarkdownAssetLinks(markdown, assetDirName = 'assets') {
  return String(markdown || '').replace(
    /(!\[[^\]]*]\()course-media:\/\/note\/\?file=([^)\s]+)(\))/gi,
    (_full, open, fileEnc, close) => {
      const file = decodeURIComponent(fileEnc)
      const base = file.split(/[/\\]/).pop()
      return `${open}./${assetDirName}/${base}${close}`
    }
  )
}
