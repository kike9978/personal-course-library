import nodePath from 'path'

/**
 * Project folders live under a "projects root" that each computer sets for itself
 * (Syncthing keeps the tree under it identical). A project stores its folder relative
 * to that root, with `/` separators and NFC text, so the same value resolves on
 * Windows and macOS and can travel through Notion.
 */

// Windows and macOS (APFS default) compare names without case.
function caseInsensitive(platform) {
  return platform === 'win32' || platform === 'darwin'
}

/** A clean relative folder: `/`-separated, NFC, no empty, `.` or `..` parts. Otherwise null. */
export function normalizeFolderRelative(value) {
  if (value == null) return null
  const text = String(value).normalize('NFC').trim().replace(/\\/g, '/')
  const parts = text.split('/').filter((part) => part !== '')
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null
  return parts.join('/')
}

/**
 * The folder's path relative to the root when it sits inside it, else null.
 * The root itself does not count: a project needs its own folder.
 */
export function folderRelativeToRoot(root, folder, { pathApi = nodePath, platform } = {}) {
  if (!root || !folder) return null
  const base = pathApi.resolve(String(root))
  const target = pathApi.resolve(String(folder))
  let rel = pathApi.relative(base, target)
  if ((rel.startsWith('..') || pathApi.isAbsolute(rel)) && caseInsensitive(platform)) {
    const prefix = base.endsWith(pathApi.sep) ? base : base + pathApi.sep
    if (target.toLowerCase().startsWith(prefix.toLowerCase())) rel = target.slice(prefix.length)
  }
  if (!rel || rel === '..' || rel.startsWith('..' + pathApi.sep) || pathApi.isAbsolute(rel)) {
    return null
  }
  return normalizeFolderRelative(rel.split(pathApi.sep).join('/'))
}

/** Absolute path for a stored relative folder on this computer, or null without a root. */
export function resolveFolderRelative(root, relative, { pathApi = nodePath } = {}) {
  const clean = normalizeFolderRelative(relative)
  if (!root || !clean) return null
  return pathApi.join(pathApi.resolve(String(root)), ...clean.split('/'))
}
