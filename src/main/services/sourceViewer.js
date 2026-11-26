import { app, BrowserWindow, session, shell } from 'electron'
import {
  INSTAGRAM_PARTITION,
  instagramSessionMayLoad,
  isLoginUrl,
  viewerMayLoad
} from '../../shared/sources.js'
import { getInstagramViewerConfig, setInstagramViewerConfig } from './config.js'

/**
 * Remote content for Fuentes runs in a <webview> on its own in-memory session:
 * no preload, no Node, sandboxed, nothing kept between runs, nothing shared with the app.
 *
 * Phase 2b adds one opt-in exception: a saved Instagram session (`persist:instagram`) used
 * only for Instagram links, only after the person signs in on Instagram's own page.
 */
export const SOURCES_PARTITION = 'sources'

function openOutside(url) {
  if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {})
}

function lockDown(ses) {
  // Embeds never need the camera, microphone, location or notifications.
  ses.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'fullscreen')
  )
  ses.setPermissionCheckHandler((_contents, permission) => permission === 'fullscreen')
  ses.on('will-download', (event) => event.preventDefault())
}

function instagramSession() {
  return session.fromPartition(INSTAGRAM_PARTITION)
}

function isInstagramUrl(url) {
  try {
    return /(^|\.)instagram\.com$/.test(new URL(String(url || '')).hostname)
  } catch {
    return false
  }
}

/** Signed in when Instagram's session cookie is in the partition. */
export async function instagramSessionStatus() {
  const { enabled } = getInstagramViewerConfig()
  if (!enabled) return { enabled: false, signedIn: false }
  const cookies = await instagramSession().cookies.get({ name: 'sessionid' })
  const signedIn = cookies.some(
    (cookie) =>
      /instagram\.com$/.test(cookie.domain || '') &&
      cookie.value &&
      (!cookie.expirationDate || cookie.expirationDate * 1000 > Date.now())
  )
  return { enabled: true, signedIn }
}

let signInWindow = null

/**
 * Open Instagram's own login page in a small window on the Instagram partition. Resolves
 * with the session status once a session cookie exists or the window is closed.
 * The app never sees the password: Instagram's page sets its cookies like any browser.
 */
export function signInToInstagram(parent) {
  setInstagramViewerConfig({ enabled: true })
  if (signInWindow && !signInWindow.isDestroyed()) {
    signInWindow.focus()
    return new Promise((resolve) =>
      signInWindow.once('closed', () => resolve(instagramSessionStatus()))
    )
  }
  const win = new BrowserWindow({
    width: 460,
    height: 720,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    title: 'Iniciar sesión en Instagram',
    autoHideMenuBar: true,
    webPreferences: {
      partition: INSTAGRAM_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  signInWindow = win
  // Login, two-step codes and challenges stay on instagram.com; anything else goes to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isInstagramUrl(url)) return
    event.preventDefault()
    openOutside(url)
  })
  return new Promise((resolve) => {
    let done = false
    const finish = async () => {
      if (done) return
      done = true
      resolve(await instagramSessionStatus())
    }
    const check = async () => {
      if (win.isDestroyed()) return
      const url = win.webContents.getURL()
      const status = await instagramSessionStatus()
      if (status.signedIn && !isLoginUrl(url)) {
        await finish()
        if (!win.isDestroyed()) win.close()
      }
    }
    win.webContents.on('did-navigate', check)
    win.webContents.on('did-navigate-in-page', check)
    win.on('closed', async () => {
      signInWindow = null
      // Closed without signing in: keep nothing, and leave the option off.
      const status = await instagramSessionStatus()
      if (!status.signedIn) await forgetInstagramSession()
      void finish()
    })
    win.loadURL('https://www.instagram.com/accounts/login/').catch(() => {})
  })
}

async function forgetInstagramSession() {
  await instagramSession().clearStorageData()
  await instagramSession().clearCache()
  setInstagramViewerConfig({ enabled: false })
}

/** Forget the Instagram session: cookies and storage go, the viewer goes back to public embeds. */
export async function signOutOfInstagram() {
  if (signInWindow && !signInWindow.isDestroyed()) signInWindow.close()
  await forgetInstagramSession()
  return instagramSessionStatus()
}

/**
 * Instagram can show its login form on any path (it rendered one at "/" for a dead session),
 * so the signed-in viewer is checked after every navigation: no session cookie, or landing on
 * the home or login page instead of a post, counts as an expired session.
 */
async function signedInPageLost(url) {
  if (isLoginUrl(url)) return true
  try {
    const path = new URL(String(url || '')).pathname
    if (path === '/' || path === '') return true
  } catch {
    return true
  }
  const status = await instagramSessionStatus()
  return !status.signedIn
}

export function installSourceViewerGuards() {
  lockDown(session.fromPartition(SOURCES_PARTITION))
  lockDown(instagramSession())
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
      const web = /^https?:\/\//i.test(params.src || '')
      const publicView = params.partition === SOURCES_PARTITION
      // The Instagram session only ever shows Instagram, and only once the person opted in.
      const instagramView =
        params.partition === INSTAGRAM_PARTITION &&
        getInstagramViewerConfig().enabled &&
        isInstagramUrl(params.src)
      if (!web || !(publicView || instagramView)) event.preventDefault()
    })

    if (contents.getType() !== 'webview') return
    // Matched by its storage folder; only the persistent Instagram partition has one here.
    const storage = contents.session?.storagePath || null
    const signedInView = Boolean(storage) && storage === instagramSession().storagePath
    let homeUrl = null
    contents.once('did-start-navigation', (details) => {
      homeUrl = details?.url || contents.getURL()
    })
    // New windows and links to other sites open in the system browser.
    contents.setWindowOpenHandler(({ url }) => {
      openOutside(url)
      return { action: 'deny' }
    })
    const loginWall = (event, url) => {
      // Never show a login form inside the viewer; it falls back (or asks to sign in again).
      event.preventDefault()
      contents.hostWebContents?.send('source-viewer-login', { url, expired: signedInView })
    }
    contents.on('will-navigate', (event, url) => {
      if (isLoginUrl(url)) return loginWall(event, url)
      if (
        signedInView
          ? instagramSessionMayLoad(url)
          : viewerMayLoad(url, homeUrl || contents.getURL())
      ) {
        return
      }
      event.preventDefault()
      openOutside(url)
    })
    contents.on('will-redirect', (event, url) => {
      if (isLoginUrl(url)) loginWall(event, url)
    })
    if (signedInView) {
      const verify = async (_event, url) => {
        if (!(await signedInPageLost(url))) return
        if (!contents.isDestroyed()) contents.stop()
        contents.hostWebContents?.send('source-viewer-login', { url, expired: true })
      }
      contents.on('did-navigate', verify)
      contents.on('did-navigate-in-page', verify)
    }
  })
}
