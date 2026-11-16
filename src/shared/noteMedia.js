/** Split `url` or `url "caption"` inside an image's parentheses. */
export function markdownImageDestination(raw) {
  const text = String(raw || '').trim()
  const titled = /^(.*\S)\s+("(?:\\.|[^"])*")\s*$/.exec(text)
  if (!titled) return { src: text, title: '' }
  return { src: titled[1].trim(), title: titled[2] }
}

/** File param of a `course-media://note/` image, ignoring a markdown caption. */
export function courseMediaNoteFile(destination) {
  const { src } = markdownImageDestination(destination)
  if (!/^course-media:\/\/note\//i.test(src)) return ''
  const file = /[?&]file=([^&\s]+)/i.exec(src)
  return file ? file[1] : ''
}
