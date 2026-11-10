const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '..')
const electronDir = path.join(root, 'node_modules/electron')
const pathFile = path.join(electronDir, 'path.txt')

if (!fs.existsSync(path.join(electronDir, 'package.json'))) {
  console.warn('[ensure-electron] electron is not installed — skip')
  process.exit(0)
}

const { version } = require(path.join(electronDir, 'package.json'))
const platformPath =
  process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin'
      ? 'Electron.app/Contents/MacOS/Electron'
      : 'electron'

function isInstalled() {
  try {
    const installedVersion = fs
      .readFileSync(path.join(electronDir, 'dist/version'), 'utf8')
      .replace(/^v/, '')
      .trim()
    if (installedVersion !== version) return false
    if (fs.readFileSync(pathFile, 'utf8') !== platformPath) return false
  } catch {
    return false
  }
  return fs.existsSync(path.join(electronDir, 'dist', platformPath))
}

if (isInstalled()) {
  process.exit(0)
}

// electron's postinstall uses extract-zip, which exits early on Node 26 and
// leaves a partial app bundle with no path.txt. Unpack the official zip instead.
const { downloadArtifact } = require(require.resolve('@electron/get', { paths: [electronDir] }))

downloadArtifact({
  version,
  artifactName: 'electron',
  platform: process.platform,
  arch: process.arch,
  cacheRoot: process.env.electron_config_cache,
  checksums: require(path.join(electronDir, 'checksums.json'))
})
  .then((zipPath) => {
    const dist = path.join(electronDir, 'dist')
    fs.rmSync(dist, { recursive: true, force: true })
    fs.mkdirSync(dist, { recursive: true })
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', dist], { stdio: 'inherit' })
    fs.writeFileSync(pathFile, platformPath)
    console.log(`[ensure-electron] Installed Electron ${version} (${os.platform()}-${os.arch()})`)
  })
  .catch((err) => {
    console.error('[ensure-electron] Failed to install the Electron binary')
    console.error(err)
    process.exit(1)
  })
