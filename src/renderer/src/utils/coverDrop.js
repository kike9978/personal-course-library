/**
 * Turn a drop or paste from a browser into a saved course cover.
 * Covers come from Google Imágenes: an image dragged from the page, a copied
 * image, or a copied image address.
 */

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function usableUrl(value) {
  const text = String(value || '').trim()
  return text.startsWith('https://') || text.startsWith('data:image/') ? text : ''
}

/** Image address carried by a drag from a browser, or '' when there is none. */
export function imageUrlFromTransfer(dataTransfer) {
  const uriList = String(dataTransfer?.getData?.('text/uri-list') || '')
  const fromList = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(usableUrl)
    .find(Boolean)
  if (fromList) return fromList

  const html = String(dataTransfer?.getData?.('text/html') || '')
  const src = usableUrl(html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&'))
  if (src) return src

  const plain = usableUrl(dataTransfer?.getData?.('text/plain'))
  if (plain) return plain

  const downloadUrl = String(dataTransfer?.getData?.('DownloadURL') || '')
  return usableUrl(downloadUrl.split(':').slice(2).join(':'))
}

/** First JPG, PNG or WebP file in a drop or paste. */
export function imageFileFromTransfer(dataTransfer) {
  const files = [...(dataTransfer?.files || [])]
  for (const item of dataTransfer?.items || []) {
    if (item?.kind === 'file') {
      const file = item.getAsFile?.()
      if (file && !files.includes(file)) files.push(file)
    }
  }
  return (
    files.find((file) => {
      const type = String(file?.type || '').toLowerCase()
      if (IMAGE_TYPES.has(type)) return true
      return /\.(jpe?g|png|webp)$/i.test(file?.name || '')
    }) || null
  )
}

// A drag that starts inside the app (a card, a lesson, selected text) is never a cover.
let innerDrag = false
if (typeof document !== 'undefined') {
  document.addEventListener('dragstart', () => (innerDrag = true), true)
  document.addEventListener('dragend', () => (innerDrag = false), true)
  document.addEventListener('drop', () => setTimeout(() => (innerDrag = false), 0), true)
}

/** True while dragging something from outside the app that could become a cover. */
export function transferMayHoldImage(dataTransfer) {
  if (innerDrag) return false
  const types = [...(dataTransfer?.types || [])]
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html')
}

export function dataUrlToBytes(dataUrl) {
  const match = String(dataUrl).match(
    /^data:image\/(?:jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i
  )
  if (!match) throw new Error('El archivo no es una imagen JPG, PNG o WebP')
  const binary = atob(match[1].replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function coverErrorText(err, fallback) {
  let message = String(err?.message || fallback)
  const remote = message.match(/^Error invoking remote method '[^']+':\s*(.*)$/)
  if (remote?.[1]) message = remote[1]
  message = message.replace(/^Error:\s*/i, '')
  return message || fallback
}

/**
 * Save the image in a drop or paste as the cover of `coursePath`.
 * Returns the updated course. Throws with a Spanish message when nothing usable came.
 */
export async function saveCoverFromTransfer(coursePath, dataTransfer) {
  const file = imageFileFromTransfer(dataTransfer)
  let result
  if (file) {
    const data = new Uint8Array(await file.arrayBuffer())
    result = await window.api.saveCourseCoverFromData({ coursePath, data })
  } else {
    const imageUrl = imageUrlFromTransfer(dataTransfer)
    if (!imageUrl) throw new Error('Arrastra una imagen JPG, PNG o WebP')
    result = imageUrl.startsWith('data:')
      ? await window.api.saveCourseCoverFromData({ coursePath, data: dataUrlToBytes(imageUrl) })
      : await window.api.saveCourseCover({ coursePath, imageUrl })
  }
  if (!result?.success) throw new Error(result?.error || 'No se pudo guardar la portada')
  return result.course || null
}

export function coverQueryFor(course) {
  const institution = String(course?.institution || '').trim()
  const title = String(course?.title || '').trim()
  // "SaaSWAVE SaaSWAVE Course" searches worse than "SaaSWAVE Course".
  if (institution && title.toLowerCase().includes(institution.toLowerCase())) return title
  return [institution, title].filter(Boolean).join(' ')
}
