import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getLibraryPath, getNotionConfig, setNotionConfig } from './config.js'
import { listCourseDirs, readCourseTitleMap, updateCourse } from './courses.js'
import { createNotionClient } from './notionClient.js'
import {
  forkFinding,
  listFindingRecords,
  listCourseProgressRecords,
  listPlaylistRecords,
  mutateFinding,
  readCourseProgressRecord,
  readFinding,
  readPlaylist,
  restoreFinding,
  withoutNoteWriteHook,
  writeCourseProgress,
  writePlaylistRecord
} from './learningStore.js'
import { findingFromLegacyNote } from '../../shared/knowledgeGraph.js'
import {
  anchorFromNotion,
  decideDelete,
  decideSync,
  fileKeyFromMarker,
  filePageMarker,
  isRetryableNotionError,
  normalizeBody,
  databaseIdCandidates,
  normalizeTitle,
  notionErrorMessage,
  noteAssetNames,
  notionAssetsToUpload,
  notionPlace,
  mergeCourseProgress,
  playlistFromBody,
  playlistWire,
  progressFromBody,
  progressIsEmpty,
  progressTrackKey,
  progressWire,
  wireHash
} from '../../shared/notionSync.js'
import { readNoteAttachment, saveNoteAttachmentBytes } from './noteAttachments.js'

const STATE_FILE = 'notion-sync.json'

let jobs = new Map()
const sharedIdsConfirmed = new Set()
let lastProbe = null
const sharedFileInfo = new Map()
let timer = null
let pollTimer = null
let remoteCheck = null
let draining = null
let syncing = false
let syncTotal = 0
let syncDone = 0
let prepareDetail = ''
let prepareDone = 0
let prepareTotal = 0
let preparePublishedAt = 0
let prepareTimer = null
let lastError = null
let lastErrorCode = ''
let turn = Promise.resolve()
const conflictCooldown = new Map()

const SAVE_CONFLICT_PASSES = 3

/** One Notion reader or writer at a time. A poll that rewrites pages while a save is in flight is what triggers Notion's 409. */
function oneAtATime(task) {
  const run = turn.then(task, task)
  turn = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
let hooks = {
  notifyNotes() {},
  notifyPlaylists() {},
  notifyProgress() {},
  notifyCourse() {},
  notifyStatus() {}
}

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    return {
      tombstones: Array.isArray(data.tombstones) ? data.tombstones : [],
      nodes: data.nodes && typeof data.nodes === 'object' ? data.nodes : {},
      playlistTombstones: Array.isArray(data.playlistTombstones) ? data.playlistTombstones : [],
      drawingShare: ['json', 'image', 'local'].includes(data.drawingShare) ? data.drawingShare : ''
    }
  } catch {
    return { tombstones: [], nodes: {}, playlistTombstones: [], drawingShare: '' }
  }
}

function writeState(state) {
  const filePath = statePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        tombstones: state.tombstones || [],
        nodes: state.nodes || {},
        playlistTombstones: state.playlistTombstones || [],
        drawingShare: state.drawingShare || ''
      },
      null,
      2
    ),
    'utf8'
  )
}

function readTombstones() {
  return readState().tombstones
}

function writeTombstones(tombstones) {
  const state = readState()
  state.tombstones = tombstones
  writeState(state)
}

function readNodes() {
  return readState().nodes
}

function writeNode(key, pageId) {
  const state = readState()
  state.nodes[key] = pageId
  writeState(state)
}

function readPlaylistTombstones() {
  return readState().playlistTombstones
}

function writePlaylistTombstones(playlistTombstones) {
  const state = readState()
  state.playlistTombstones = playlistTombstones
  writeState(state)
}

function describeError(error) {
  return notionErrorMessage({
    status: error?.status,
    code: error?.code,
    message: error?.message
  })
}

function noteFailure(error) {
  lastError = describeError(error)
  lastErrorCode = error?.code || (error?.status === 409 ? 'conflict_error' : '')
}

function clearFailure() {
  lastError = null
  lastErrorCode = ''
}

function isSaveConflict(error) {
  return error?.status === 409 || error?.code === 'conflict_error'
}

function requeueJob(id, job, error) {
  if (!isRetryableNotionError(error)) return false
  const attempts = (job.attempts || 0) + 1
  if (isSaveConflict(error) && attempts >= SAVE_CONFLICT_PASSES) {
    conflictCooldown.set(id, Date.now() + 60_000)
    return false
  }
  jobs.set(id, { ...job, attempts: isSaveConflict(error) ? attempts : job.attempts || 0 })
  return true
}

function saveConflictParked(id) {
  const until = conflictCooldown.get(id) || 0
  if (until <= Date.now()) {
    conflictCooldown.delete(id)
    return false
  }
  return true
}

function playlistText(why, coursePaths) {
  return [why, ...(coursePaths || [])].filter(Boolean).join('\n')
}

function remotePlaylistBody(body) {
  const parsed = playlistFromBody(body)
  if (!parsed) return body || ''
  return playlistText(parsed.why, parsed.coursePaths)
}

function playlistConflictView(playlist) {
  const remote = playlist.notion?.conflict || {}
  const parsed = playlistFromBody(remote.remoteBody)
  return {
    playlistId: playlist.id,
    title: playlist.title || 'Sin título',
    localBody: playlistText(playlist.why, playlist.coursePaths),
    remoteTitle: remote.remoteTitle || '',
    remoteBody: parsed ? playlistText(parsed.why, parsed.coursePaths) : remote.remoteBody || ''
  }
}

function clientFromConfig() {
  const config = getNotionConfig()
  return createNotionClient({ token: config.token, databaseId: config.databaseId })
}

function publicStatus() {
  const config = getNotionConfig()
  const conflicts = config.enabled
    ? listFindingRecords()
        .filter((finding) => finding.notion?.conflict)
        .map((finding) => ({
          findingId: finding.id,
          title: finding.title || 'Sin título',
          body: finding.body || '',
          remoteTitle: finding.notion.conflict.remoteTitle || '',
          remoteBody: finding.notion.conflict.remoteBody || '',
          coursePath: finding.anchors?.[0]?.coursePath || null
        }))
    : []
  const playlistConflicts = config.enabled
    ? listPlaylistRecords()
        .filter((playlist) => playlist.notion?.conflict)
        .map(playlistConflictView)
    : []
  const playlistDeleteConflicts = readPlaylistTombstones()
    .filter((item) => item.conflict)
    .map((item) => ({
      playlistId: item.playlistId,
      title: item.snapshot?.title || 'Sin título',
      remoteTitle: item.conflict.remoteTitle || '',
      remoteBody: remotePlaylistBody(item.conflict.remoteBody)
    }))
  const deleteConflicts = readTombstones()
    .filter((item) => item.conflict)
    .map((item) => ({
      findingId: item.findingId,
      title: item.snapshot?.title || 'Sin título',
      remoteTitle: item.conflict.remoteTitle || '',
      remoteBody: item.conflict.remoteBody || '',
      remoteEditedAt: item.conflict.remoteEditedAt || null
    }))
  return {
    enabled: config.enabled,
    hasToken: Boolean(config.token),
    databaseId: config.databaseId || '',
    syncing,
    syncTotal,
    syncDone,
    prepareDetail,
    prepareDone,
    prepareTotal,
    lastError,
    lastErrorCode,
    queued: jobs.size,
    conflicts,
    deleteConflicts,
    playlistConflicts,
    playlistDeleteConflicts,
    drawingShare: readState().drawingShare || '',
    drawings: listDrawingFiles(),
    progressConflicts: listProgressConflicts()
  }
}

function publish() {
  hooks.notifyStatus(publicStatus())
}

function clearPrepare() {
  prepareDetail = ''
  prepareDone = 0
  prepareTotal = 0
  if (prepareTimer) {
    clearTimeout(prepareTimer)
    prepareTimer = null
  }
}

function notePrepare(detail, done = 0, total = 0) {
  prepareDetail = detail
  prepareDone = done
  prepareTotal = total
  const send = () => {
    preparePublishedAt = Date.now()
    publish()
  }
  const now = Date.now()
  if (!detail || now - preparePublishedAt >= 400) {
    if (prepareTimer) {
      clearTimeout(prepareTimer)
      prepareTimer = null
    }
    send()
    return
  }
  if (prepareTimer) return
  prepareTimer = setTimeout(() => {
    prepareTimer = null
    send()
  }, 400)
}

function listShapeExtra(page, extra = {}) {
  if (page?.playlistLegacy) return extra
  return { listShape: 'blocks', ...extra }
}

function notifyNotes() {
  hooks.notifyNotes()
}

function notifyPlaylists() {
  hooks.notifyPlaylists()
}

function notifyProgress() {
  hooks.notifyProgress()
}

function cursorFrom(page, hash, extra = {}) {
  return {
    pageId: page.pageId,
    ackedHash: hash,
    remoteEditedAt: page.editedAt || null,
    conflict: null,
    error: null,
    pulledAt: null,
    syncedAt: Date.now(),
    ...extra
  }
}

function applyNotion(id, notion, text) {
  withoutNoteWriteHook(() => {
    mutateFinding(id, (finding) => {
      finding.notion = notion
      if (!text) return
      finding.title = normalizeTitle(text.title) || null
      finding.body = normalizeBody(text.body)
      finding.bodyHtml = null
      finding.bodyJson = null
      finding.updatedAt = Date.now()
    })
  })
}

function rememberError(id, message) {
  withoutNoteWriteHook(() => {
    mutateFinding(id, (finding) => {
      const current = finding.notion || {}
      finding.notion = {
        pageId: current.pageId || null,
        ackedHash: current.ackedHash || null,
        remoteEditedAt: current.remoteEditedAt || null,
        conflict: current.conflict || null,
        error: message,
        pulledAt: current.pulledAt || null,
        syncedAt: current.syncedAt || null
      }
    })
  })
}

async function pageBelongsToRows(client, pageId, rowIds) {
  let current = pageId
  const seen = new Set()
  for (let depth = 0; depth < 6 && current && !seen.has(current); depth += 1) {
    if (rowIds.has(current)) return true
    seen.add(current)
    const parent = await client.pageParent(current)
    if (!parent || parent.type !== 'page_id') return false
    current = parent.id
  }
  return false
}

async function loadRemote(client, finding) {
  if (finding.notion?.pageId) {
    const direct = await client.readPage(finding.notion.pageId)
    if (direct) return direct
  }
  const summary = await client.findPage(finding.id)
  if (!summary?.pageId) return null
  return client.readPage(summary.pageId)
}

async function ensureCoursePage(client, place) {
  const marker = `node:${place.courseKey}`
  let page = await client.findNode(marker)
  if (!page?.pageId) page = await client.createNodePage(marker, place.courseTitle, PAGE_ICONS.course)
  else if (page.title !== place.courseTitle) await client.renamePage(page.pageId, place.courseTitle)
  return page.pageId
}

function cachedFileKey(pageId) {
  for (const [key, id] of Object.entries(readNodes())) {
    if (id === pageId) return key
  }
  return ''
}

async function ensureFilePage(client, place, coursePageId) {
  const marker = filePageMarker(place)
  const cached = readNodes()[place.fileKey]
  if (cached) {
    const parent = await client.pageParent(cached)
    if (parent?.type === 'page_id' && parent.id === coursePageId) {
      const current = await client.readPage(cached)
      if (current && current.title !== place.fileTitle) await client.renamePage(cached, place.fileTitle)
      if (current && current.marker !== marker) await client.writeMarker(cached, marker)
      if (current) return cached
    }
  }
  const children = await client.listChildPages(coursePageId)
  for (const child of children) {
    const page = await client.readPage(child.pageId)
    if (!page || page.findingId) continue
    const sameMarker = Boolean(marker) && page.marker === marker
    const sameTitle = page.title === place.fileTitle && page.icon === PAGE_ICONS.file
    if (!sameMarker && !sameTitle) continue
    if (page.marker !== marker) await client.writeMarker(page.pageId, marker)
    if (page.title !== place.fileTitle) await client.renamePage(page.pageId, place.fileTitle)
    writeNode(place.fileKey, page.pageId)
    return page.pageId
  }
  const created = await client.createPage(
    null,
    place.fileTitle,
    '',
    coursePageId,
    PAGE_ICONS.file,
    marker
  )
  writeNode(place.fileKey, created.pageId)
  return created.pageId
}

async function ensurePlace(client, finding) {
  const place = notionPlace(finding, readCourseTitleMap())
  const coursePageId = await ensureCoursePage(client, place)
  if (!place.fileKey) return coursePageId
  return ensureFilePage(client, place, coursePageId)
}

async function retireFlatCopies(client, findingId, keepPageId) {
  const rows = await client.listPages()
  for (const row of rows) {
    if (row.findingId !== findingId || row.pageId === keepPageId) continue
    await client.archivePage(row.pageId)
  }
}

async function saveNotePage(client, finding, remote) {
  const parentId = await ensurePlace(client, finding)
  let page = remote
  if (page?.pageId) {
    const parent = await client.pageParent(page.pageId)
    if (parent?.type === 'page_id' && parent.id === parentId) {
      page = await client.updatePage(page.pageId, finding.id, finding.title, finding.body, PAGE_ICONS.note)
    } else {
      const title = finding.title
      const body = finding.body
      page = await client.createPage(finding.id, title, body, parentId, PAGE_ICONS.note)
      await client.archivePage(remote.pageId)
    }
  } else {
    page = await client.createPage(finding.id, finding.title, finding.body, parentId, PAGE_ICONS.note)
  }
  await retireFlatCopies(client, finding.id, page.pageId)
  await reconcileNoteFiles(client, page?.pageId, finding.body)
  return page
}

const MAX_NOTE_ASSET_BYTES = 20 * 1024 * 1024

function listDrawingFiles() {
  const drawings = []
  const seen = new Set()
  for (const finding of listFindingRecords()) {
    const names = noteAssetNames(finding.body || '')
    for (const name of names) {
      if (!String(name).toLowerCase().endsWith('.excalidraw') || seen.has(name)) continue
      seen.add(name)
      const id = name.slice(0, -'.excalidraw'.length)
      drawings.push({
        name,
        noteTitle: finding.title || 'Sin título',
        hasPreview: names.some((item) => item.toLowerCase() === `${id.toLowerCase()}.png`)
      })
    }
  }
  return drawings
}

function listProgressConflicts() {
  return listCourseProgressRecords()
    .filter((course) => course.notion?.conflict)
    .map((course) => ({
      coursePath: course.id,
      title: courseTitle(course.id),
      localInProcess: readInProcess(course.id, course),
      remoteInProcess: Boolean(course.notion.conflict.remoteInProcess)
    }))
}

async function reconcileNoteFiles(client, pageId, body) {
  if (!pageId) return
  const planned = notionAssetsToUpload(noteAssetNames(body), readState().drawingShare)
  const wanted = planned.map((item) => item.name)
  const remote = await client.listNoteAssets(pageId)
  for (const item of remote) {
    if (wanted.includes(item.name) || !item.blockId) continue
    await client.deleteBlock(item.blockId)
  }
  const present = new Set(
    remote.filter((item) => wanted.includes(item.name)).map((item) => item.name)
  )
  for (const name of wanted) {
    const local = readNoteAttachment(name)
    const onPage = remote.find((item) => item.name === name)
    if (!local && onPage?.url) {
      try {
        const bytes = await client.downloadAsset(onPage.url)
        if (bytes?.byteLength) saveNoteAttachmentBytes(name, bytes)
      } catch {
        // The note text still syncs when a file cannot be fetched.
      }
      continue
    }
    if (local && !present.has(name)) {
      if (local.size > MAX_NOTE_ASSET_BYTES) continue
      const plan = planned.find((item) => item.name === name)
      await client.attachNoteFile(
        pageId,
        name,
        local.bytes,
        plan?.contentType || local.contentType,
        plan?.filename || name
      )
    }
  }
}

async function placeExisting(client, finding, remote) {
  const parentId = await ensurePlace(client, finding)
  const parent = await client.pageParent(remote.pageId)
  if (parent?.type === 'page_id' && parent.id === parentId) {
    await retireFlatCopies(client, finding.id, remote.pageId)
    await reconcileNoteFiles(client, remote.pageId, remote.body)
    return remote
  }
  const created = await client.createPage(
    finding.id,
    remote.title,
    remote.body,
    parentId,
    PAGE_ICONS.note
  )
  await client.archivePage(remote.pageId)
  await retireFlatCopies(client, finding.id, created.pageId)
  await reconcileNoteFiles(client, created.pageId, remote.body)
  return { ...remote, pageId: created.pageId, editedAt: created.editedAt || remote.editedAt }
}

function finishWrite(id, page, localHash) {
  if (!page?.pageId) throw new Error('Notion no devolvió la página')
  const remoteHash = page.body === undefined ? localHash : wireHash(page.title, page.body)
  if (page?.body !== undefined && remoteHash !== localHash) {
    applyNotion(id, cursorFrom(page, remoteHash, { pulledAt: Date.now() }), page)
    return
  }
  applyNotion(id, cursorFrom(page, localHash))
}

async function writeLocal(client, finding) {
  const remote = await loadRemote(client, finding)
  const page = await saveNotePage(client, finding, remote)
  finishWrite(finding.id, page, wireHash(finding.title, finding.body))
}

async function reconcileUpsert(client, id) {
  const finding = readFinding(id)
  if (!finding || finding.notion?.conflict) return

  const localHash = wireHash(finding.title, finding.body)
  const remote = await loadRemote(client, finding)
  const action = decideSync({
    hasRemote: Boolean(remote),
    localHash,
    remoteHash: remote ? wireHash(remote.title, remote.body) : null,
    ackedHash: finding.notion?.ackedHash || null
  })

  if (action === 'create' || action === 'push') {
    const page = await saveNotePage(client, finding, remote)
    finishWrite(id, page, localHash)
    notifyNotes()
    return
  }

  if (action === 'pull') {
    const placed = await placeExisting(client, finding, remote)
    const hash = wireHash(placed.title, placed.body)
    applyNotion(id, cursorFrom(placed, hash, { pulledAt: Date.now() }), placed)
    notifyNotes()
    return
  }

  if (action === 'relink') {
    const placed = await placeExisting(client, finding, remote)
    applyNotion(id, cursorFrom(placed, localHash))
    notifyNotes()
    return
  }

  const placed = await placeExisting(client, finding, remote)
  applyNotion(id, {
    pageId: placed.pageId,
    ackedHash: finding.notion?.ackedHash || null,
    remoteEditedAt: placed.editedAt || null,
    conflict: {
      remoteTitle: placed.title || '',
      remoteBody: placed.body || '',
      remoteEditedAt: placed.editedAt || null
    },
    error: null,
    pulledAt: finding.notion?.pulledAt || null,
    syncedAt: finding.notion?.syncedAt || null
  })
  notifyNotes()
}

function rememberDelete(finding) {
  if (!finding?.notion?.pageId) return
  const tombstones = readTombstones().filter((item) => item.findingId !== finding.id)
  const snapshot = structuredClone(finding)
  snapshot.bodyHtml = null
  snapshot.bodyJson = null
  tombstones.push({
    findingId: finding.id,
    pageId: finding.notion.pageId,
    ackedHash: finding.notion.ackedHash || null,
    snapshot,
    conflict: null
  })
  writeTombstones(tombstones)
}

async function reconcileDelete(client, findingId) {
  const current = readTombstones()
  const tomb = current.find((item) => item.findingId === findingId)
  if (!tomb || tomb.conflict) return
  const remote = await client.readPage(tomb.pageId)
  const action = decideDelete({
    hasRemote: Boolean(remote),
    remoteHash: remote ? wireHash(remote.title, remote.body) : null,
    ackedHash: tomb.ackedHash
  })
  if (action === 'drop') {
    writeTombstones(readTombstones().filter((item) => item.findingId !== findingId))
    return
  }
  if (action === 'archive') {
    await client.archivePage(tomb.pageId)
    writeTombstones(readTombstones().filter((item) => item.findingId !== findingId))
    publish()
    return
  }
  const next = readTombstones().map((item) =>
    item.findingId === findingId
      ? {
          ...item,
          conflict: {
            remoteTitle: remote.title || '',
            remoteBody: remote.body || '',
            remoteEditedAt: remote.editedAt || null
          }
        }
      : item
  )
  writeTombstones(next)
  publish()
}

function schedule(delay) {
  if (!getNotionConfig().enabled) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    void kick()
  }, delay)
}

function kick() {
  if (!draining) {
    draining = oneAtATime(() => drain()).finally(() => {
      draining = null
    })
  }
  return draining
}

async function drain() {
  if (!getNotionConfig().enabled) {
    jobs.clear()
    syncTotal = 0
    syncDone = 0
    publish()
    return
  }
  if (!jobs.size) return
  const batch = new Map(jobs)
  jobs.clear()
  syncTotal = batch.size
  syncDone = 0
  syncing = true
  publish()
  let retryDelay = 0
  try {
    const client = clientFromConfig()
    await client.loadSchema()
    for (const [id, job] of batch) {
      if (!getNotionConfig().enabled) {
        jobs.set(id, job)
        continue
      }
      try {
        if (job.op === 'playlist-upsert') {
          await reconcilePlaylist(client, job.playlistId, { refresh: job.refresh })
        }
        else if (job.op === 'playlist-delete') await reconcilePlaylistDelete(client, job.playlistId)
        else if (job.op === 'progress-upsert') await reconcileProgress(client, job.coursePath)
        else if (job.op === 'delete') await reconcileDelete(client, id)
        else await reconcileUpsert(client, id)
        clearFailure()
        syncDone += 1
        publish()
      } catch (error) {
        noteFailure(error)
        if (job.op === 'playlist-upsert') rememberPlaylistError(job.playlistId, lastError)
        else if (job.op === 'progress-upsert') rememberProgressError(job.coursePath, lastError)
        else if (job.op !== 'delete' && job.op !== 'playlist-delete') rememberError(id, lastError)
        if (requeueJob(id, job, error)) {
          const wait = error.status === 429 ? 5000 : isSaveConflict(error) ? 1500 : 15000
          retryDelay = Math.max(retryDelay, wait)
        }
        if (job.op === 'playlist-upsert' || job.op === 'playlist-delete') notifyPlaylists()
        else if (job.op === 'progress-upsert') notifyProgress()
        else notifyNotes()
        syncDone += 1
        publish()
      }
    }
  } catch (error) {
    noteFailure(error)
    const conflict = isSaveConflict(error)
    for (const [id, job] of batch) {
      if (!conflict) {
        jobs.set(id, job)
        continue
      }
      requeueJob(id, job, error)
    }
    retryDelay = conflict ? 1500 : 30000
  } finally {
    syncing = false
    if (!jobs.size) {
      syncTotal = 0
      syncDone = 0
    }
    publish()
  }
  if (jobs.size) schedule(retryDelay || 200)
}

async function flushQueued() {
  for (let pass = 0; pass < 3; pass += 1) {
    if (!jobs.size && !draining) return
    clearTimeout(timer)
    await kick()
  }
}

function makeFindingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function linkedFinding(page) {
  return listFindingRecords().find(
    (finding) =>
      finding.notion?.pageId === page.pageId || (page.findingId && finding.id === page.findingId)
  )
}

function shouldRetarget(finding, anchor) {
  const current = finding.anchors?.[0] || {}
  const provisional = String(current.lessonRelativePath || '').startsWith('notion-page:')
  const incomingProvisional = String(anchor.lessonRelativePath || '').startsWith('notion-page:')
  if (!anchor.coursePath && !anchor.lessonRelativePath && !anchor.projectId) return false
  if (!current.coursePath && (anchor.coursePath || anchor.lessonRelativePath || anchor.projectId)) {
    return true
  }
  return provisional && Boolean(anchor.lessonRelativePath) && !incomingProvisional
}

function notionPageKey(id) {
  return String(id || '')
    .replace(/-/g, '')
    .toLowerCase()
}

function noteQueued(probe, id, reason) {
  if (!probe || probe.queued.length >= 50) return
  probe.queued.push(`${id} · ${reason}`)
}

function oldestRemoteEditedAt() {
  const times = []
  for (const finding of listFindingRecords()) {
    if (finding.notion?.remoteEditedAt) times.push(finding.notion.remoteEditedAt)
  }
  for (const course of listCourseProgressRecords()) {
    if (course.notion?.remoteEditedAt) times.push(course.notion.remoteEditedAt)
  }
  for (const playlist of listPlaylistRecords()) {
    if (playlist.notion?.remoteEditedAt) times.push(playlist.notion.remoteEditedAt)
  }
  if (!times.length) return null
  times.sort()
  return times[0]
}

async function notePageUnchanged(client, pageId, storedEditedAt, recent) {
  if (!storedEditedAt) return false
  const seenAt = recent?.byId?.get(notionPageKey(pageId))?.editedAt || ''
  if (seenAt) return seenAt === storedEditedAt
  if (recent?.complete) return true
  try {
    const editedAt = await client.pageEditedAt(pageId)
    return Boolean(editedAt && editedAt === storedEditedAt)
  } catch {
    return false
  }
}

async function takeSharedNote(client, pageId, place, seen, recent) {
  if (!pageId || seen.has(pageId)) return false
  const anchor = anchorFromNotion({
    courseMarker: place.courseMarker,
    fileMarker: place.fileMarker,
    fileTitle: place.fileTitle,
    filePageId: place.filePageId
  })
  const known = listFindingRecords().find((finding) => finding.notion?.pageId === pageId)
  if (known && sharedIdsConfirmed.has(pageId) && !shouldRetarget(known, anchor)) {
    const unchanged = await notePageUnchanged(
      client,
      pageId,
      known.notion?.remoteEditedAt || '',
      recent
    )
    if (unchanged) {
      seen.add(pageId)
      if (recent?.probe) recent.probe.skipped += 1
      return false
    }
  }
  seen.add(pageId)
  if (recent?.probe) recent.probe.opened += 1
  const page = await client.readPage(pageId)
  if (!page || page.playlistId) return false
  await reconcileNoteFiles(client, page.pageId, page.body)
  const existing = linkedFinding(page)
  if (existing) {
    let changed = false
    if (shouldRetarget(existing, anchor)) {
      const next = findingFromLegacyNote({ ...existing, anchors: [anchor] }, anchor.coursePath)
      withoutNoteWriteHook(() => {
        mutateFinding(existing.id, (finding) => {
          finding.anchors = next.anchors
        })
      })
      changed = true
    }
    if (!page.findingId && wireHash(existing.title, existing.body) === wireHash(page.title, page.body)) {
      const stamped = await client.updatePage(
        page.pageId,
        existing.id,
        page.title,
        page.body,
        page.icon
      )
      const hash = wireHash(stamped?.title, stamped?.body)
      if (stamped?.pageId) {
        withoutNoteWriteHook(() => applyNotion(existing.id, cursorFrom(stamped, hash)))
        sharedIdsConfirmed.add(page.pageId)
      }
      return changed
    }
    if (page.findingId) sharedIdsConfirmed.add(page.pageId)
    if (existing.notion?.conflict) return changed
    if (page.editedAt && page.editedAt !== existing.notion?.remoteEditedAt) {
      const sameText = wireHash(existing.title, existing.body) === wireHash(page.title, page.body)
      if (sameText) {
        withoutNoteWriteHook(() =>
          applyNotion(existing.id, cursorFrom(page, wireHash(page.title, page.body)))
        )
        return changed
      }
      jobs.set(existing.id, { op: 'upsert' })
      noteQueued(recent?.probe, existing.id, 'la página cambió')
    }
    return changed
  }

  let adopted = page
  const id = page.findingId || makeFindingId()
  if (!page.findingId) {
    adopted =
      (await client.updatePage(page.pageId, id, page.title, page.body, page.icon)) || page
    if (adopted?.pageId) sharedIdsConfirmed.add(adopted.pageId)
  } else {
    sharedIdsConfirmed.add(page.pageId)
  }
  const hash = wireHash(adopted.title, adopted.body)
  const finding = findingFromLegacyNote(
    {
      id,
      title: adopted.title,
      body: adopted.body,
      anchors: [anchor]
    },
    anchor.coursePath
  )
  finding.notion = cursorFrom(adopted, hash, { pulledAt: Date.now() })
  withoutNoteWriteHook(() => restoreFinding(finding))
  return true
}

async function importSharedNotes(client, rows, recent) {
  let changed = false
  const seen = new Set()
  const courseRows = (rows || []).filter(
    (row) => !String(row.nodeMarker || '').startsWith('node:table:')
  )
  for (let index = 0; index < courseRows.length; index += 1) {
    const row = courseRows[index]
    const courseMarker = String(row.nodeMarker || '')
    notePrepare(`Notas, ${index + 1} de ${courseRows.length}`, index + 1, courseRows.length)
    if (!courseMarker.startsWith('node:')) {
      if (row.findingId && !String(row.findingId).startsWith('node:')) {
        changed =
          (await takeSharedNote(client, row.pageId, { editedAt: row.editedAt }, seen, recent)) ||
          changed
      }
      continue
    }
    const children = await client.listChildPages(row.pageId)
    for (const child of children) {
      const cachedKey = cachedFileKey(child.pageId)
      const remembered = sharedFileInfo.get(child.pageId)
      let fileMarker = remembered?.fileMarker || (cachedKey ? `node:${cachedKey}` : '')
      let fileTitle = remembered?.fileTitle || ''
      const knownFile = Boolean(cachedKey) || Boolean(remembered)
      if (!knownFile && sharedIdsConfirmed.has(child.pageId)) {
        changed =
          (await takeSharedNote(
            client,
            child.pageId,
            { courseMarker, editedAt: child.editedAt },
            seen,
            recent
          )) || changed
        continue
      }
      if (!knownFile) {
        const page = await client.readPage(child.pageId)
        if (!page) continue
        const nested = await client.listChildPages(child.pageId)
        const isFile = Boolean(
          (page.marker && page.marker.startsWith('node:')) ||
            page.icon === PAGE_ICONS.file ||
            nested.length
        )
        if (!isFile) {
          changed =
            (await takeSharedNote(
              client,
              child.pageId,
              { courseMarker, editedAt: child.editedAt },
              seen,
              recent
            )) || changed
          continue
        }
        fileMarker = page.marker || ''
        fileTitle = page.title || ''
        sharedFileInfo.set(child.pageId, { fileMarker, fileTitle })
        const fileKey = fileKeyFromMarker(page.marker)
        if (fileKey) writeNode(fileKey, page.pageId)
        seen.add(child.pageId)
      }
      const notes = await client.listChildPages(child.pageId)
      for (const note of notes) {
        changed =
          (await takeSharedNote(
            client,
            note.pageId,
            {
              courseMarker,
              fileMarker,
              fileTitle,
              filePageId: child.pageId,
              editedAt: note.editedAt
            },
            seen,
            recent
          )) || changed
      }
    }
  }
  if (changed) notifyNotes()
}

async function queuePending() {
  if (!getNotionConfig().enabled) return
  notePrepare('Revisando Notion…')
  let remotePages = null
  let recent = { pages: [], complete: false }
  const client = clientFromConfig()
  const probe = {
    at: new Date().toISOString(),
    error: null,
    recentCount: 0,
    recentOldest: null,
    recentComplete: false,
    skipped: 0,
    opened: 0,
    queued: []
  }
  const errorBefore = lastError
  lastProbe = probe
  try {
    remotePages = await client.listPages()
    if (remotePages) notePrepare(`Revisando ${remotePages.length} páginas`)
  } catch (error) {
    noteFailure(error)
  }
  try {
    recent = await client.recentPages({ before: oldestRemoteEditedAt() })
  } catch {
    recent = { pages: [], complete: false }
  }
  const recentById = new Map(
    (recent.pages || []).map((page) => [notionPageKey(page.pageId), page])
  )
  probe.recentCount = recentById.size
  probe.recentOldest = recent.pages?.length ? recent.pages[recent.pages.length - 1].editedAt : null
  probe.recentComplete = Boolean(recent.complete)
  const recentCtx = { byId: recentById, complete: Boolean(recent.complete), probe }
  if (remotePages) {
    try {
      await paintIcons(client, remotePages)
    } catch {
      // The next pass sets any icon that did not land.
    }
    try {
      await importSharedNotes(client, remotePages, recentCtx)
    } catch (error) {
      noteFailure(error)
    }
  }
  const findings = listFindingRecords().filter((finding) => !finding.notion?.conflict)
  const courseTitles = readCourseTitleMap()
  const remoteByFinding = new Map()
  for (const page of remotePages || []) {
    if (page.findingId && !String(page.findingId).startsWith('node:')) {
      remoteByFinding.set(page.findingId, page)
    }
  }
  const rowIds = new Set((remotePages || []).map((page) => page.pageId))
  for (const finding of findings) {
    const localHash = wireHash(finding.title, finding.body)
    const row = (remotePages || []).find((page) => page.pageId === finding.notion?.pageId)
    const remote =
      row || recentById.get(notionPageKey(finding.notion?.pageId)) || remoteByFinding.get(finding.id)
    const localChanged = !finding.notion?.ackedHash || finding.notion.ackedHash !== localHash
    const remoteChanged = Boolean(
      remote?.editedAt &&
        remote.editedAt !== finding.notion?.remoteEditedAt &&
        finding.notion?.ackedHash &&
        finding.notion.ackedHash !== localHash
    )
    const place = notionPlace(finding, courseTitles)
    const canPlace = Boolean(place.fileKey) || place.courseKey !== 'course:__loose__'
    const needsPlace = Boolean(row && row.parentType !== 'page_id' && canPlace)
    const missingHere =
      Array.isArray(remotePages) &&
      Boolean(finding.notion?.pageId) &&
      !row &&
      !(await pageBelongsToRows(client, finding.notion.pageId, rowIds))
    if (saveConflictParked(finding.id)) continue
    if (localChanged || remoteChanged || needsPlace || missingHere) {
      const pending = jobs.get(finding.id)
      jobs.set(finding.id, { op: 'upsert', attempts: pending?.attempts || 0 })
      noteQueued(
        probe,
        finding.id,
        [
          localChanged ? 'local' : '',
          remoteChanged ? 'notion' : '',
          needsPlace ? 'lugar' : '',
          missingHere ? 'no está en la base' : ''
        ]
          .filter(Boolean)
          .join(', ') || 'upsert'
      )
    }
  }
  for (const tomb of readTombstones()) {
    if (tomb.conflict) continue
    const remote = remoteByFinding.get(tomb.findingId)
    const remoteChanged =
      !remotePages || !remote || remote.editedAt !== tomb.snapshot?.notion?.remoteEditedAt
    if (saveConflictParked(tomb.findingId)) continue
    if (remoteChanged) {
      const pending = jobs.get(tomb.findingId)
      jobs.set(tomb.findingId, { op: 'delete', attempts: pending?.attempts || 0 })
    }
  }
  try {
    await queuePlaylists(client, remotePages)
  } catch (error) {
    noteFailure(error)
  }
  try {
    await queueProgress(client)
  } catch (error) {
    noteFailure(error)
  }
  probe.error = lastError !== errorBefore ? lastError : null
  clearPrepare()
  publish()
}

const PAGE_ICONS = {
  course: '📚',
  file: '📄',
  note: '📝',
  playlists: '📋',
  playlist: '🗂️',
  progress: '✅'
}

const PLAYLIST_MARKER = 'node:table:playlists'
const PROGRESS_MARKER = 'node:table:progress'
let playlistSectionTask = null

function playlistKey(id) {
  return `playlist:${id}`
}

function progressKey(id) {
  return `progress:${id}`
}

function rememberPlaylistError(id, message) {
  const playlist = readPlaylist(id)
  if (!playlist) return
  withoutNoteWriteHook(() => {
    writePlaylistRecord({
      ...playlist,
      notion: {
        pageId: playlist.notion?.pageId || null,
        ackedHash: playlist.notion?.ackedHash || null,
        remoteEditedAt: playlist.notion?.remoteEditedAt || null,
        conflict: playlist.notion?.conflict || null,
        error: message,
        pulledAt: playlist.notion?.pulledAt || null,
        syncedAt: playlist.notion?.syncedAt || null
      }
    })
  })
}

function applyPlaylist(id, notion, remote) {
  const playlist = readPlaylist(id)
  const parsed = remote ? playlistFromBody(remote.body) : null
  withoutNoteWriteHook(() => {
    writePlaylistRecord({
      ...(playlist || { id }),
      id,
      title: remote?.title || playlist?.title,
      ...(parsed || {}),
      notion
    })
  })
}

async function ensurePlaylistSection(client) {
  if (playlistSectionTask) return playlistSectionTask
  playlistSectionTask = (async () => {
    let page = await client.findNode(PLAYLIST_MARKER)
    if (!page?.pageId) {
      page = await client.createNodePage(PLAYLIST_MARKER, 'Listas', PAGE_ICONS.playlists)
    } else if (page.title !== 'Listas') {
      await client.renamePage(page.pageId, 'Listas')
    }
    return page.pageId
  })().finally(() => {
    playlistSectionTask = null
  })
  return playlistSectionTask
}

async function loadPlaylistRemote(client, playlist, sectionId) {
  if (playlist?.notion?.pageId) {
    const direct = await client.readPage(playlist.notion.pageId)
    if (direct) return direct
  }
  const children = await client.listChildPages(sectionId)
  for (const child of children) {
    const page = await client.readPage(child.pageId)
    if (page?.playlistId === playlist.id) return page
  }
  return null
}

function playlistChildTitles(playlist) {
  const titles = {}
  for (const childId of playlist?.childIds || []) {
    titles[childId] = readPlaylist(childId)?.title || 'Lista'
  }
  return titles
}

async function savePlaylistPage(client, playlist, remote) {
  const wire = playlistWire(playlist)
  const titles = playlistChildTitles(playlist)
  const parentId = await ensurePlaylistSection(client)
  if (remote?.pageId) {
    const parent = await client.pageParent(remote.pageId)
    if (parent?.type === 'page_id' && parent.id === parentId) {
      return client.updatePage(
        remote.pageId,
        playlist.id,
        wire.title,
        wire.body,
        PAGE_ICONS.playlist,
        'playlist',
        titles
      )
    }
    const created = await client.createPage(
      playlist.id,
      wire.title,
      wire.body,
      parentId,
      PAGE_ICONS.playlist,
      null,
      'playlist',
      titles
    )
    await client.archivePage(remote.pageId)
    return created
  }
  return client.createPage(
    playlist.id,
    wire.title,
    wire.body,
    parentId,
    PAGE_ICONS.playlist,
    null,
    'playlist',
    titles
  )
}

async function reconcilePlaylist(client, id, { refresh = false } = {}) {
  const playlist = readPlaylist(id)
  if (!playlist || playlist.notion?.conflict) return
  const wire = playlistWire(playlist)
  const localHash = wireHash(wire.title, wire.body)
  const sectionId = await ensurePlaylistSection(client)
  const remote = await loadPlaylistRemote(client, playlist, sectionId)
  let action = decideSync({
    hasRemote: Boolean(remote),
    localHash,
    remoteHash: remote ? wireHash(remote.title, remote.body) : null,
    ackedHash: playlist.notion?.ackedHash || null
  })
  if (action === 'relink' && (remote?.playlistLegacy || refresh)) action = 'push'
  if (action === 'create' || action === 'push') {
    const page = await savePlaylistPage(client, playlist, remote)
    if (!page?.pageId) throw new Error('Notion no devolvió la lista')
    if (readPlaylistTombstones().some((item) => item.playlistId === id)) {
      await client.archivePage(page.pageId)
      return
    }
    const remoteHash = page.body === undefined ? localHash : wireHash(page.title, page.body)
    withoutNoteWriteHook(() => {
      writePlaylistRecord({
        ...playlist,
        notion: cursorFrom(
          page,
          remoteHash === localHash ? localHash : remoteHash,
          listShapeExtra(page)
        )
      })
    })
  } else if (action === 'pull') {
    const parsed = playlistFromBody(remote.body)
    if (!parsed) {
      withoutNoteWriteHook(() => {
        writePlaylistRecord({
          ...playlist,
          notion: {
            pageId: remote.pageId,
            ackedHash: playlist.notion?.ackedHash || null,
            remoteEditedAt: remote.editedAt || null,
            conflict: {
              remoteTitle: remote.title || '',
              remoteBody: remote.body || '',
              remoteEditedAt: remote.editedAt || null
            },
            error: null
          }
        })
      })
    } else {
      const hash = wireHash(remote.title, remote.body)
      applyPlaylist(id, cursorFrom(remote, hash, listShapeExtra(remote, { pulledAt: Date.now() })), remote)
      notifyPlaylists()
    }
  } else if (action === 'relink') {
    withoutNoteWriteHook(() => {
      writePlaylistRecord({
        ...playlist,
        notion: cursorFrom(remote, localHash, listShapeExtra(remote))
      })
    })
  } else {
    withoutNoteWriteHook(() => {
      writePlaylistRecord({
        ...playlist,
        notion: {
          pageId: remote.pageId,
          ackedHash: playlist.notion?.ackedHash || null,
          remoteEditedAt: remote.editedAt || null,
          conflict: {
            remoteTitle: remote.title || '',
            remoteBody: remote.body || '',
            remoteEditedAt: remote.editedAt || null
          },
          error: null,
          pulledAt: playlist.notion?.pulledAt || null,
          syncedAt: playlist.notion?.syncedAt || null
        }
      })
    })
  }
}

function rememberPlaylistDelete(playlist) {
  const tombstones = readPlaylistTombstones().filter((item) => item.playlistId !== playlist.id)
  tombstones.push({
    playlistId: playlist.id,
    pageId: playlist.notion?.pageId || null,
    ackedHash: playlist.notion?.ackedHash || null,
    snapshot: { title: playlist.title || '', body: playlistWire(playlist).body },
    conflict: null
  })
  writePlaylistTombstones(tombstones)
}

async function reconcilePlaylistDelete(client, playlistId) {
  const tomb = readPlaylistTombstones().find((item) => item.playlistId === playlistId)
  if (!tomb || tomb.conflict || !tomb.pageId) return
  const remote = await client.readPage(tomb.pageId)
  const action = decideDelete({
    hasRemote: Boolean(remote),
    remoteHash: remote ? wireHash(remote.title, remote.body) : null,
    ackedHash: tomb.ackedHash
  })
  if (action === 'drop' || action === 'archive') {
    if (action === 'archive') await client.archivePage(tomb.pageId)
    writePlaylistTombstones(readPlaylistTombstones().filter((item) => item.playlistId !== playlistId))
    return
  }
  writePlaylistTombstones(
    readPlaylistTombstones().map((item) =>
      item.playlistId === playlistId
        ? {
            ...item,
            conflict: {
              remoteTitle: remote.title || '',
              remoteBody: remote.body || '',
              remoteEditedAt: remote.editedAt || null
            }
          }
        : item
    )
  )
}

async function queuePlaylists(client, remotePages) {
  if (!remotePages) return
  notePrepare('Buscando la página de listas')
  const sectionId = await ensurePlaylistSection(client)
  notePrepare('Contando listas')
  const children = await client.listChildPages(sectionId)
  const knownByPage = new Map(
    listPlaylistRecords()
      .filter((playlist) => playlist.notion?.pageId)
      .map((playlist) => [playlist.notion.pageId, playlist])
  )
  const remoteById = new Map()
  let adopted = 0
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    const known = knownByPage.get(child.pageId)
    notePrepare(
      `Listas, ${index + 1} de ${children.length}${known?.title ? ` · ${known.title}` : ''}`,
      index + 1,
      children.length
    )
    const unchanged =
      known?.notion?.listShape === 'blocks' &&
      known.notion.remoteEditedAt &&
      known.notion.remoteEditedAt === child.editedAt
    if (unchanged) {
      const wire = playlistWire(known)
      remoteById.set(known.id, {
        pageId: child.pageId,
        title: known.title || wire.title,
        body: wire.body,
        editedAt: child.editedAt,
        playlistId: known.id,
        playlistLegacy: false
      })
      continue
    }
    const page = await client.readPage(child.pageId)
    if (!page?.playlistId) continue
    notePrepare(
      `Listas, ${index + 1} de ${children.length}${page.title ? ` · ${page.title}` : ''}`,
      index + 1,
      children.length
    )
    remoteById.set(page.playlistId, page)
    if (readPlaylistTombstones().some((item) => item.playlistId === page.playlistId)) continue
    if (!readPlaylist(page.playlistId)) {
      const parsed = playlistFromBody(page.body)
      if (!parsed) continue
      const hash = wireHash(page.title, page.body)
      applyPlaylist(
        page.playlistId,
        cursorFrom(page, hash, listShapeExtra(page, { pulledAt: Date.now() })),
        page
      )
      adopted += 1
    }
  }
  if (children.length) notePrepare(`Listas, ${children.length} de ${children.length}`, children.length, children.length)
  if (adopted) notifyPlaylists()
  for (const playlist of listPlaylistRecords()) {
    if (playlist.notion?.conflict) continue
    const wire = playlistWire(playlist)
    const localHash = wireHash(wire.title, wire.body)
    const remote = remoteById.get(playlist.id)
    const localChanged = playlist.notion?.ackedHash !== localHash
    const remoteChanged = Boolean(remote && remote.editedAt !== playlist.notion?.remoteEditedAt)
    const missingPage = !remote
    const key = playlistKey(playlist.id)
    if (saveConflictParked(key)) continue
    if (localChanged || remoteChanged || missingPage || remote?.playlistLegacy) {
      const pending = jobs.get(key)
      jobs.set(key, {
        op: 'playlist-upsert',
        playlistId: playlist.id,
        attempts: pending?.attempts || 0
      })
    }
  }
  for (const tomb of readPlaylistTombstones()) {
    if (tomb.conflict || !tomb.pageId) continue
    const key = playlistKey(tomb.playlistId)
    if (saveConflictParked(key)) continue
    const pending = jobs.get(key)
    jobs.set(key, {
      op: 'playlist-delete',
      playlistId: tomb.playlistId,
      attempts: pending?.attempts || 0
    })
  }
}

function coursePropsFile(coursePath) {
  const library = getLibraryPath()
  const key = path.basename(String(coursePath || ''))
  if (!library || !key) return ''
  return path.join(library, key, 'courseProps.json')
}

function readInProcess(coursePath, course) {
  const file = coursePropsFile(coursePath)
  if (file && fs.existsSync(file)) {
    try {
      return Boolean(JSON.parse(fs.readFileSync(file, 'utf8')).isInProcess)
    } catch {
      return Boolean(course?.inProcess)
    }
  }
  return Boolean(course?.inProcess)
}

function courseTitle(coursePath) {
  const file = coursePropsFile(coursePath)
  if (file && fs.existsSync(file)) {
    try {
      const title = JSON.parse(fs.readFileSync(file, 'utf8')).title
      if (String(title || '').trim()) return String(title).trim()
    } catch {
      // The folder name is the page title when the catalog file cannot be read.
    }
  }
  return path.basename(String(coursePath || '')) || 'Curso'
}

function localProgress(coursePath) {
  const course = readCourseProgressRecord(coursePath)
  return progressFromBody(
    progressWire({
      inProcess: readInProcess(coursePath, course),
      lessons: course?.lessons || {},
      lastLessonRelativePath: course?.lastLessonRelativePath || '',
      lastLessonTitle: course?.lastLessonTitle || '',
      lastPositionSec: course?.lastPositionSec || 0,
      lastOpenedAt: course?.lastOpenedAt || 0
    }).body
  )
}

function rememberProgressError(coursePath, message) {
  const course = readCourseProgressRecord(coursePath)
  writeCourseProgress(coursePath, {
    notion: {
      pageId: course?.notion?.pageId || null,
      ackedHash: course?.notion?.ackedHash || null,
      remoteEditedAt: course?.notion?.remoteEditedAt || null,
      conflict: course?.notion?.conflict || null,
      error: message,
      pulledAt: course?.notion?.pulledAt || null,
      syncedAt: course?.notion?.syncedAt || null
    }
  })
}

async function applyProgress(coursePath, data, notion) {
  writeCourseProgress(coursePath, {
    lessons: data.lessons,
    replaceLessons: true,
    lastLessonRelativePath: data.lastLessonRelativePath || null,
    lastLessonTitle: data.lastLessonTitle || null,
    lastPositionSec: data.lastPositionSec || 0,
    lastOpenedAt: data.lastOpenedAt || null,
    inProcess: Boolean(data.inProcess),
    notion
  })
  const file = coursePropsFile(coursePath)
  if (file && fs.existsSync(path.dirname(file))) {
    const saved = await updateCourse(coursePath, { isInProcess: Boolean(data.inProcess) })
    hooks.notifyCourse?.(coursePath, saved)
  }
  notifyProgress()
}

let progressSectionTask = null

async function ensureProgressSection(client) {
  if (progressSectionTask) return progressSectionTask
  progressSectionTask = (async () => {
    let page = await client.findNode(PROGRESS_MARKER)
    if (!page?.pageId) {
      page = await client.createNodePage(PROGRESS_MARKER, 'Progreso', PAGE_ICONS.progress)
    } else if (page.title !== 'Progreso') {
      await client.renamePage(page.pageId, 'Progreso')
    }
    return page.pageId
  })().finally(() => {
    progressSectionTask = null
  })
  return progressSectionTask
}

async function loadProgressRemote(client, course, sectionId) {
  if (course?.notion?.pageId) {
    const direct = await client.readPage(course.notion.pageId)
    if (direct?.progressId) return direct
  }
  if (!sectionId) return null
  const children = await client.listChildPages(sectionId)
  for (const child of children) {
    const page = await client.readPage(child.pageId)
    if (page?.progressId === course?.id) return page
  }
  return null
}

async function saveProgressPage(client, coursePath, data, remote) {
  const wire = progressWire(data)
  const parentId = await ensureProgressSection(client)
  const title = courseTitle(coursePath)
  if (remote?.pageId) {
    const parent = await client.pageParent(remote.pageId)
    if (parent?.type === 'page_id' && parent.id === parentId) {
      return client.updatePage(remote.pageId, coursePath, title, wire.body, PAGE_ICONS.progress, 'progress')
    }
    const created = await client.createPage(
      coursePath,
      title,
      wire.body,
      parentId,
      PAGE_ICONS.progress,
      null,
      'progress'
    )
    await client.archivePage(remote.pageId)
    return created
  }
  return client.createPage(
    coursePath,
    title,
    wire.body,
    parentId,
    PAGE_ICONS.progress,
    null,
    'progress'
  )
}

async function reconcileProgress(client, coursePath) {
  const course = readCourseProgressRecord(coursePath) || { id: coursePath }
  if (course.notion?.conflict) return
  const local = localProgress(coursePath)
  if (progressIsEmpty(local) && !course.notion?.pageId) return
  const localHash = wireHash(coursePath, progressWire(local).body)
  const sectionId = course.notion?.pageId ? null : await ensureProgressSection(client)
  const remote = await loadProgressRemote(client, { ...course, id: coursePath }, sectionId)
  const remoteData = remote ? progressFromBody(remote.body) : null
  const action = decideSync({
    hasRemote: Boolean(remote && remoteData),
    localHash,
    remoteHash: remoteData ? wireHash(coursePath, progressWire(remoteData).body) : null,
    ackedHash: course.notion?.ackedHash || null
  })
  if ((action === 'create' || action === 'push') && progressIsEmpty(local) && !remote) return
  if (action === 'create' || action === 'push') {
    const page = await saveProgressPage(client, coursePath, local, remote)
    if (!page?.pageId) throw new Error('Notion no devolvió el progreso')
    const written = progressWire(local).body
    const remoteHash = page.body === undefined ? localHash : wireHash(page.title, page.body || written)
    writeCourseProgress(coursePath, { notion: cursorFrom(page, remoteHash === localHash ? localHash : remoteHash) })
    return
  }
  if (!remoteData) return
  if (action === 'pull' || action === 'relink') {
    const hash = action === 'relink' ? localHash : wireHash(coursePath, progressWire(remoteData).body)
    await applyProgress(coursePath, remoteData, cursorFrom(remote, hash, action === 'pull' ? { pulledAt: Date.now() } : {}))
    return
  }
  const merged = mergeCourseProgress(local, remoteData)
  if (!merged) return
  if (local.inProcess === remoteData.inProcess) {
    const page = await saveProgressPage(client, coursePath, merged, remote)
    const hash = wireHash(coursePath, progressWire(merged).body)
    await applyProgress(coursePath, merged, cursorFrom(page || remote, hash))
    return
  }
  writeCourseProgress(coursePath, {
    lessons: merged.lessons,
    lastLessonRelativePath: merged.lastLessonRelativePath || null,
    lastLessonTitle: merged.lastLessonTitle || null,
    lastPositionSec: merged.lastPositionSec || 0,
    lastOpenedAt: merged.lastOpenedAt || null,
    inProcess: local.inProcess,
    notion: {
      pageId: remote.pageId,
      ackedHash: course.notion?.ackedHash || null,
      remoteEditedAt: remote.editedAt || null,
      conflict: { remoteInProcess: remoteData.inProcess },
      error: null,
      pulledAt: course.notion?.pulledAt || null,
      syncedAt: course.notion?.syncedAt || null
    }
  })
  notifyProgress()
  publish()
}

async function queueProgress(client) {
  notePrepare('Revisando progreso')
  let remoteById = new Map()
  const section = await client.findNode(PROGRESS_MARKER)
  if (section?.pageId) {
    const children = await client.listChildPages(section.pageId)
    remoteById = new Map()
    for (const child of children) {
      const page = await client.readPage(child.pageId)
      if (page?.progressId) remoteById.set(page.progressId, page)
    }
  }
  let folders = []
  try {
    folders = await listCourseDirs()
  } catch {
    folders = []
  }
  const keys = new Set([
    ...listCourseProgressRecords().map((course) => course.id),
    ...folders,
    ...remoteById.keys()
  ])
  for (const coursePath of keys) {
    const course = readCourseProgressRecord(coursePath)
    if (course?.notion?.conflict) continue
    const key = progressKey(coursePath)
    if (saveConflictParked(key)) continue
    const local = localProgress(coursePath)
    const localHash = wireHash(coursePath, progressWire(local).body)
    const remote = remoteById.get(coursePath)
    const acked = course?.notion?.ackedHash || ''
    const localChanged = Boolean(acked) && acked !== localHash
    const remoteChanged = Boolean(remote && remote.editedAt !== course?.notion?.remoteEditedAt)
    const missingPage = !remote && !progressIsEmpty(local)
    const adoptRemote = Boolean(remote) && !acked
    if (!localChanged && !remoteChanged && !missingPage && !adoptRemote) continue
    const pending = jobs.get(key)
    jobs.set(key, { op: 'progress-upsert', coursePath, attempts: pending?.attempts || 0 })
    noteQueued(
      lastProbe,
      key,
      adoptRemote ? 'sin cursor' : remoteChanged ? 'notion' : localChanged ? 'local' : 'falta la página'
    )
  }
}

let iconsPainted = false

async function paintIcons(client, rows) {
  if (iconsPainted) return
  const fileIds = new Set(Object.values(readNodes()))
  let painted = 0
  for (const row of rows) {
    if (!String(row.nodeMarker || '').startsWith('node:')) continue
    if (String(row.nodeMarker || '').startsWith('node:table:')) continue
    painted += 1
    notePrepare(`Iconos, página ${painted}`)
    await client.setPageIcon(row.pageId, PAGE_ICONS.course)
    const children = await client.listChildPages(row.pageId)
    for (const child of children) {
      const nested = await client.listChildPages(child.pageId)
      const isFile = fileIds.has(child.pageId) || nested.length > 0
      await client.setPageIcon(child.pageId, isFile ? PAGE_ICONS.file : PAGE_ICONS.note)
      if (!isFile) continue
      for (const note of nested) await client.setPageIcon(note.pageId, PAGE_ICONS.note)
    }
  }
  iconsPainted = true
}

const REMOTE_POLL_MS = 15000

function setRemoteWatch(active) {
  if (!active) {
    clearInterval(pollTimer)
    pollTimer = null
    return
  }
  if (pollTimer) return
  pollTimer = setInterval(() => {
    pollNotionChanges()
  }, REMOTE_POLL_MS)
}

/** Read Notion for title and body changes and apply the ones that only happened there. */
export function pollNotionChanges() {
  if (!getNotionConfig().enabled) return null
  if (remoteCheck) return remoteCheck
  remoteCheck = oneAtATime(() => queuePending()).finally(() => {
    remoteCheck = null
    if (jobs.size) schedule(0)
  })
  return remoteCheck
}

export function startNotionSync(nextHooks = {}) {
  hooks = {
    notifyNotes: nextHooks.notifyNotes || (() => {}),
    notifyPlaylists: nextHooks.notifyPlaylists || (() => {}),
    notifyProgress: nextHooks.notifyProgress || (() => {}),
    notifyCourse: nextHooks.notifyCourse || (() => {}),
    notifyStatus: nextHooks.notifyStatus || (() => {})
  }
  const enabled = getNotionConfig().enabled
  setRemoteWatch(enabled)
  if (enabled) void pollNotionChanges()
}

export function enqueueNotionUpsert(id) {
  if (!id || !getNotionConfig().enabled) return
  conflictCooldown.delete(id)
  const finding = readFinding(id)
  if (!finding || finding.notion?.conflict) return
  if (jobs.get(id)?.op === 'delete') return
  jobs.set(id, { op: 'upsert' })
  schedule(1200)
}

export function enqueueNotionDelete(finding) {
  if (!getNotionConfig().enabled || !finding?.id) return
  rememberDelete(finding)
  if (!finding.notion?.pageId) return
  jobs.set(finding.id, { op: 'delete' })
  schedule(1200)
}

export function enqueueNotionProgress(coursePath, { soon = false } = {}) {
  const keyName = path.basename(String(coursePath || ''))
  if (!keyName || !getNotionConfig().enabled) return
  const key = progressKey(keyName)
  conflictCooldown.delete(key)
  const course = readCourseProgressRecord(keyName)
  if (course?.notion?.conflict) return
  jobs.set(key, { op: 'progress-upsert', coursePath: keyName, attempts: jobs.get(key)?.attempts || 0 })
  if (soon || !timer) schedule(soon ? 1200 : 8000)
}

export function localProgressTrack(coursePath) {
  return progressTrackKey(localProgress(coursePath))
}

export function enqueueNotionPlaylistUpsert(id) {
  if (!id || !getNotionConfig().enabled) return
  const key = playlistKey(id)
  conflictCooldown.delete(key)
  if (jobs.get(key)?.op === 'playlist-delete') return
  const playlist = readPlaylist(id)
  if (!playlist || playlist.notion?.conflict) return
  jobs.set(key, { op: 'playlist-upsert', playlistId: id, attempts: jobs.get(key)?.attempts || 0 })
  for (const other of listPlaylistRecords()) {
    if (!(other.childIds || []).includes(id) || other.notion?.conflict) continue
    const parentKey = playlistKey(other.id)
    const pending = jobs.get(parentKey)
    if (pending?.op === 'playlist-delete') continue
    jobs.set(parentKey, {
      op: 'playlist-upsert',
      playlistId: other.id,
      attempts: pending?.attempts || 0,
      refresh: true
    })
  }
  schedule(1200)
}

export function enqueueNotionPlaylistDelete(playlist) {
  if (!getNotionConfig().enabled || !playlist?.id) return
  const key = playlistKey(playlist.id)
  rememberPlaylistDelete(playlist)
  if (!playlist.notion?.pageId) {
    jobs.delete(key)
    return
  }
  jobs.set(key, { op: 'playlist-delete', playlistId: playlist.id })
  schedule(1200)
}

export function getNotionSyncStatus() {
  return publicStatus()
}

function clipDebug(value, max = 70) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function notionDebugReport() {
  const config = getNotionConfig()
  const findings = listFindingRecords()
  const progress = listCourseProgressRecords()
  const playlists = listPlaylistRecords()
  const probe = lastProbe
  const withCursor = findings.filter((finding) => finding.notion?.ackedHash).length
  const noteConflicts = findings.filter((finding) => finding.notion?.conflict).length
  const lines = [
    'Diagnóstico de Notion',
    `hora: ${new Date().toISOString()}`,
    `conectado: ${config.enabled ? 'sí' : 'no'}`,
    `base: ${config.databaseId || '—'}`,
    `sincronizando: ${syncing ? `sí (${syncDone} de ${syncTotal || '?'})` : 'no'}`,
    `paso: ${
      prepareDetail
        ? `${prepareDetail}${prepareTotal ? ` (${prepareDone} de ${prepareTotal})` : ''}`
        : '—'
    }`,
    `en cola ahora: ${jobs.size}`,
    `último error: ${lastError || '—'}`
  ]
  if (!probe) {
    lines.push('último recorrido: todavía no. Abre Notion, espera unos segundos y copia de nuevo.')
  } else {
    lines.push(`último recorrido: ${probe.at}`)
    lines.push(
      `ventana reciente: ${probe.recentCount} páginas, ${probe.recentComplete ? 'completa' : 'incompleta'}, más antigua ${probe.recentOldest || '—'}`
    )
    lines.push(`notas saltadas porque la página no cambió: ${probe.skipped}`)
    lines.push(`notas abiertas en ese recorrido: ${probe.opened}`)
    lines.push(`error del recorrido: ${probe.error || '—'}`)
    lines.push('encoladas en ese recorrido:')
    if (!probe.queued.length) lines.push('- ninguna')
    for (const item of probe.queued) lines.push(`- ${item}`)
  }
  lines.push(`notas: ${findings.length} (${withCursor} con cursor, ${noteConflicts} en conflicto)`)
  const pendingNotes = findings.filter(
    (finding) => !finding.notion?.pageId || !finding.notion?.ackedHash || finding.notion?.conflict
  )
  for (const finding of pendingNotes.slice(0, 40)) {
    lines.push(
      `- ${clipDebug(finding.title || finding.id)} | página ${finding.notion?.pageId || 'no'} | cursor ${finding.notion?.ackedHash ? 'sí' : 'no'} | editada ${finding.notion?.remoteEditedAt || '—'} | conflicto ${finding.notion?.conflict ? 'sí' : 'no'}`
    )
  }
  if (pendingNotes.length > 40) lines.push(`- y ${pendingNotes.length - 40} más sin cursor o en conflicto`)
  lines.push(`progreso: ${progress.length} cursos`)
  const pendingProgress = progress.filter(
    (course) => !course.notion?.pageId || !course.notion?.ackedHash || course.notion?.conflict
  )
  if (!pendingProgress.length) lines.push('- todos tienen cursor')
  for (const course of pendingProgress.slice(0, 40)) {
    const local = localProgress(course.id)
    lines.push(
      `- ${clipDebug(courseTitle(course.id))} | en curso ${local?.inProcess ? 'sí' : 'no'} | página ${course.notion?.pageId || 'no'} | cursor ${course.notion?.ackedHash ? 'sí' : 'no'} | editada ${course.notion?.remoteEditedAt || '—'} | conflicto ${course.notion?.conflict ? 'sí' : 'no'}`
    )
  }
  if (pendingProgress.length > 40) {
    lines.push(`- y ${pendingProgress.length - 40} cursos más sin cursor o en conflicto`)
  }
  lines.push(
    `listas: ${playlists.length}, en conflicto ${playlists.filter((item) => item.notion?.conflict).length}`
  )
  lines.push('cola actual:')
  const jobLines = [...jobs.entries()].slice(0, 40)
  if (!jobLines.length) lines.push('- vacía')
  for (const [id, job] of jobLines) lines.push(`- ${job.op || 'trabajo'} ${id}`)
  if (jobs.size > jobLines.length) lines.push(`- y ${jobs.size - jobLines.length} más`)
  return lines.join('\n')
}

export function setNotionDrawingShare(choice) {
  if (!['json', 'image', 'local'].includes(choice)) throw new Error('Elección desconocida')
  const state = readState()
  state.drawingShare = choice
  writeState(state)
  for (const finding of listFindingRecords()) {
    const names = noteAssetNames(finding.body || '')
    if (names.some((name) => String(name).toLowerCase().endsWith('.excalidraw'))) {
      enqueueNotionUpsert(finding.id)
    }
  }
  publish()
  return publicStatus()
}

export async function saveNotionSettings({ enabled, token, databaseId } = {}) {
  const current = getNotionConfig()
  const nextToken = typeof token === 'string' && token.trim() ? token.trim() : current.token
  const candidates =
    databaseId === undefined
      ? current.databaseId
        ? [current.databaseId]
        : []
      : databaseIdCandidates(databaseId)
  const nextDatabaseId = candidates[0] || ''
  if (databaseId !== undefined && String(databaseId || '').trim() && !nextDatabaseId) {
    throw new Error('El identificador de la base no es válido')
  }
  const nextEnabled = enabled === true
  if (nextEnabled && (!nextToken || !nextDatabaseId)) {
    throw new Error('Para activar Notion hace falta el token y la base')
  }

  setNotionConfig({ enabled: false, token: nextToken, databaseId: nextDatabaseId })
  if (!nextEnabled) {
    jobs.clear()
    clearTimeout(timer)
    syncTotal = 0
    syncDone = 0
    setRemoteWatch(false)
    clearFailure()
    publish()
    return publicStatus()
  }

  try {
    const client = createNotionClient({
      token: nextToken,
      databaseId: nextDatabaseId,
      candidateIds: candidates
    })
    await client.loadSchema()
    const resolvedId = client.acceptedDatabaseId() || nextDatabaseId
    setNotionConfig({ enabled: true, token: nextToken, databaseId: resolvedId })
  } catch (error) {
    noteFailure(error)
    publish()
    throw new Error(lastError)
  }

  clearFailure()
  setRemoteWatch(true)
  publish()
  void oneAtATime(async () => {
    try {
      await queuePending()
      if (jobs.size) schedule(0)
    } catch (error) {
      noteFailure(error)
      clearPrepare()
      publish()
    }
  })
  return publicStatus()
}

export async function syncNotionNow(findingId) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  if (findingId) {
    const finding = readFinding(findingId)
    if (finding?.notion?.conflict) {
      throw new Error('Esa anotación está en conflicto. Elige una versión antes de sincronizar.')
    }
    conflictCooldown.delete(findingId)
    jobs.set(findingId, { op: 'upsert' })
  } else {
    conflictCooldown.clear()
    await oneAtATime(() => queuePending())
  }
  await flushQueued()
  return publicStatus()
}

export async function resolveNotionConflict(findingId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const finding = readFinding(findingId)
  if (!finding?.notion?.conflict) throw new Error('Esa anotación no está en conflicto')
  const client = clientFromConfig()
  return oneAtATime(async () => {
    await client.loadSchema()

    if (choice === 'local') {
      await writeLocal(client, finding)
    } else if (choice === 'remote') {
      const remote = await loadRemote(client, finding)
      if (!remote) throw new Error('La página de Notion ya no está')
      const hash = wireHash(remote.title, remote.body)
      applyNotion(findingId, cursorFrom(remote, hash, { pulledAt: Date.now() }), remote)
    } else if (choice === 'both') {
      const remote = await loadRemote(client, finding)
      if (!remote) throw new Error('La página de Notion ya no está')
      const copy = withoutNoteWriteHook(() =>
        forkFinding(findingId, {
          title: normalizeTitle(remote.title) || null,
          body: remote.body || ''
        })
      )
      try {
        await writeLocal(client, readFinding(findingId) || finding)
      } finally {
        enqueueNotionUpsert(copy.id)
      }
    } else {
      throw new Error('Elección desconocida')
    }

    notifyNotes()
    publish()
    return publicStatus()
  })
}

export async function resolveNotionDelete(findingId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const tomb = readTombstones().find((item) => item.findingId === findingId)
  if (!tomb?.conflict) throw new Error('Ese borrado no está en conflicto')
  const client = clientFromConfig()
  return oneAtATime(async () => {
    await client.loadSchema()

    if (choice === 'discard') {
      const remote = await client.readPage(tomb.pageId)
      if (remote) await client.archivePage(tomb.pageId)
    } else if (choice === 'keep') {
      const remote = (await client.readPage(tomb.pageId)) || {
        pageId: tomb.pageId,
        title: tomb.conflict.remoteTitle,
        body: tomb.conflict.remoteBody,
        editedAt: tomb.conflict.remoteEditedAt
      }
      const hash = wireHash(remote.title, remote.body)
      const snapshot = {
        ...tomb.snapshot,
        id: tomb.findingId,
        title: normalizeTitle(remote.title) || null,
        body: normalizeBody(remote.body),
        bodyHtml: null,
        bodyJson: null,
        notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
      }
      withoutNoteWriteHook(() => restoreFinding(snapshot))
      notifyNotes()
    } else {
      throw new Error('Elección desconocida')
    }

    writeTombstones(readTombstones().filter((item) => item.findingId !== findingId))
    publish()
    return publicStatus()
  })
}

async function pushPlaylist(client, playlist) {
  const sectionId = await ensurePlaylistSection(client)
  const remote = await loadPlaylistRemote(client, playlist, sectionId)
  const page = await savePlaylistPage(client, playlist, remote)
  if (!page?.pageId) throw new Error('Notion no devolvió la lista')
  const wire = playlistWire(playlist)
  const localHash = wireHash(wire.title, wire.body)
  const remoteHash = page.body === undefined ? localHash : wireHash(page.title, page.body)
  withoutNoteWriteHook(() => {
    writePlaylistRecord({
      ...playlist,
      notion: cursorFrom(
        page,
        remoteHash === localHash ? localHash : remoteHash,
        listShapeExtra(page)
      )
    })
  })
}

export async function resolveNotionPlaylistConflict(playlistId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const playlist = readPlaylist(playlistId)
  if (!playlist?.notion?.conflict) throw new Error('Esa lista no está en conflicto')
  const client = clientFromConfig()
  return oneAtATime(async () => {
    await client.loadSchema()
    if (choice === 'local') {
      await pushPlaylist(client, readPlaylist(playlistId) || playlist)
    } else if (choice === 'remote') {
      const remote = await loadPlaylistRemote(
        client,
        playlist,
        await ensurePlaylistSection(client)
      )
      if (!remote) throw new Error('La página de Notion ya no está')
      const parsed = playlistFromBody(remote.body)
      if (!parsed) throw new Error('La página de Notion ya no es una lista')
      const hash = wireHash(remote.title, remote.body)
      applyPlaylist(playlistId, cursorFrom(remote, hash, listShapeExtra(remote, { pulledAt: Date.now() })), remote)
      notifyPlaylists()
    } else {
      throw new Error('Elección desconocida')
    }
    publish()
    return publicStatus()
  })
}

export async function resolveNotionPlaylistDelete(playlistId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const tomb = readPlaylistTombstones().find((item) => item.playlistId === playlistId)
  if (!tomb?.conflict) throw new Error('Ese borrado no está en conflicto')
  const client = clientFromConfig()
  return oneAtATime(async () => {
    await client.loadSchema()
    if (choice === 'discard') {
      const remote = tomb.pageId ? await client.readPage(tomb.pageId) : null
      if (remote) await client.archivePage(tomb.pageId)
    } else if (choice === 'keep') {
      const remote = (tomb.pageId ? await client.readPage(tomb.pageId) : null) || {
        pageId: tomb.pageId,
        title: tomb.conflict.remoteTitle,
        body: tomb.conflict.remoteBody,
        editedAt: tomb.conflict.remoteEditedAt
      }
      const parsed = playlistFromBody(remote.body)
      if (!parsed) throw new Error('La página de Notion ya no es una lista')
      const hash = wireHash(remote.title, remote.body)
      applyPlaylist(playlistId, cursorFrom(remote, hash, listShapeExtra(remote, { pulledAt: Date.now() })), remote)
      notifyPlaylists()
    } else {
      throw new Error('Elección desconocida')
    }
    writePlaylistTombstones(
      readPlaylistTombstones().filter((item) => item.playlistId !== playlistId)
    )
    publish()
    return publicStatus()
  })
}

export async function resolveNotionProgress(coursePath, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const keyName = path.basename(String(coursePath || ''))
  const course = readCourseProgressRecord(keyName)
  if (!course?.notion?.conflict) throw new Error('Ese curso no está en conflicto')
  const client = clientFromConfig()
  return oneAtATime(async () => {
    await client.loadSchema()
    if (choice !== 'local' && choice !== 'remote') throw new Error('Elección desconocida')
    const current = localProgress(keyName)
    const inProcess =
      choice === 'remote' ? Boolean(course.notion.conflict.remoteInProcess) : current.inProcess
    const next = { ...current, inProcess }
    const remote = await loadProgressRemote(
      client,
      { ...course, id: keyName },
      await ensureProgressSection(client)
    )
    const page = await saveProgressPage(client, keyName, next, remote)
    const hash = wireHash(keyName, progressWire(next).body)
    await applyProgress(keyName, next, cursorFrom(page || remote, hash))
    publish()
    return publicStatus()
  })
}
