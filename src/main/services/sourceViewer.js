import { app, session, shell } from 'electron'
import { isLoginUrl, viewerMayLoad } from '../../shared/sources.js'

/**
 * Remote content for Fuentes runs in a <webview> on its own in-memory session:
 * no preload, no Node, sandboxed, nothing kept between runs, nothing shared with the app.
 */
export const SOURCES_PARTITION = 'sources'

function openOutside(url) {
  if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {})
}

function configureSession() {
  const ses = session.fromPartition(SOURCES_PARTITION)
  // Embeds never need the camera, microphone, location or notifications.
  ses.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'fullscreen')
  )
  ses.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen')
  ses.on('will-download', (event) => event.preventDefault())
}

export function installSourceViewerGuards() {
  configureSession()
  app.on('web-contents-created', (_event, contents) => {
    // Only our own windows may attach a webview, and only in the locked-down form.
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false
      if (params.partition !== SOURCES_PARTITION || !/^https?:\/\//i.test(params.src || '')) {
        event.preventDefault()
      }
    })

    if (contents.getType() !== 'webview') return
    let homeUrl = null
    contents.once('did-start-navigation', (details) => {
      homeUrl = details?.url || contents.getURL()
    })
    // New windows and links to other sites open in the system browser.
    contents.setWindowOpenHandler(({ url }) => {
      openOutside(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (isLoginUrl(url)) {
        // Never show a login form inside the app; the viewer falls back instead.
        event.preventDefault()
        contents.hostWebContents?.send('source-viewer-login', { url })
        return
      }
      if (viewerMayLoad(url, homeUrl || contents.getURL())) return
      event.preventDefault()
      openOutside(url)
    })
    contents.on('will-redirect', (event, url) => {
      if (isLoginUrl(url)) {
        event.preventDefault()
        contents.hostWebContents?.send('source-viewer-login', { url })
      }
    })
  })
}
