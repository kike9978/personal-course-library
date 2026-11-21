import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getLibraryPath, getNotionConfig, setNotionConfig } from './config.js'
import { listCourseDirs, readCourseTitleMap, updateCourse } from './courses.js'
import { createNotionClient } from './notionClient.js'
import {
  findFindingByPageId,
  findFindingRecord,
  forkFinding,
  readFindingList,
  listCourseProgressRecords,
  listPlaylistRecords,
  listStoredProjects,
  listTopics,
  mutateFinding,
  readCourseProgressRecord,
  readFinding,
  readPlaylist,
  readPlaylistIntentRecord,
  readStoredProject,
  readTopic,
  restoreFinding,
  upsertTopic,
  upsertProject,
  restoreProject,
  savePlaylistIntent,
  withoutNoteWriteHook,
  writeCourseProgress,
  writePlaylistRecord
} from './learningStore.js'
import { findingFromLegacyNote } from '../../shared/knowledgeGraph.js'
import {
  anchorFromNotion,
  anchorsWithVideoTime,
  decideDelete,
  decideSync,
  fileKeyFromMarker,
  filePageMarker,
  isRetryableNotionError,
  normalizeBody,
  databaseIdCandidates,
  normalizeTitle,
  notionErrorMessage,
  noteVideoTime,
  noteAssetNames,
  notionAssetsToUpload,
  notionPlace,
  mergeCourseProgress,
  anchorsToText,
  intentFromBody,
  intentWire,
  noteWire,
  noteWireHash,
  PLAYLIST_INTENT_ID,
  playlistFromBody,
  playlistWire,
  progressFromBody,
  progressIsEmpty,
  progressSyncHash,
  progressSyncKey,
  progressTrackKey,
  progressWire,
  projectFromBody,
  projectWire,
  roundTimeSec,
  topicFromBody,
  topicIdsToText,
  topicWire,
  wireHash
} from '../../shared/notionSync.js'
import {
  noteAttachmentExists,
  readNoteAttachment,
  saveNoteAttachmentBytes
} from './noteAttachments.js'

const NOTE_FILE_TRIES = 3
const NOTE_FILE_MISS = 'No se pudieron sincronizar las imágenes de esta nota.'

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
let syncState = null
let notionClient = null
let notionClientKey = ''
let localDriftGeneration = 0
let driftedGeneration = -1
let statusTimer = null
let statusPublishedAt = 0

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
  notifyProjects() {},
  notifyCourse() {},
  notifyStatus() {}
}

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function emptySyncState() {
  return {
    tombstones: [],
    nodes: {},
    playlistTombstones: [],
    topicTombstones: [],
    projectTombstones: [],
    drawingShare: '',
    drawingsAsJson: false,
    imagesQueued: false,
    rowSchema: false,
    pollWatermark: '',
    parked: []
  }
}

function readState() {
  if (syncState) return syncState
  try {
    const data = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    syncState = {
      tombstones: Array.isArray(data.tombstones) ? data.tombstones : [],
      nodes: data.nodes && typeof data.nodes === 'object' ? data.nodes : {},
      playlistTombstones: Array.isArray(data.playlistTombstones) ? data.playlistTombstones : [],
      topicTombstones: Array.isArray(data.topicTombstones) ? data.topicTombstones : [],
      projectTombstones: Array.isArray(data.projectTombstones) ? data.projectTombstones : [],
      drawingShare: ['json', 'image', 'local'].includes(data.drawingShare) ? data.drawingShare : '',
      drawingsAsJson: data.drawingsAsJson === true,
      imagesQueued: data.imagesQueued === true,
      rowSchema: data.rowSchema === true,
      pollWatermark: typeof data.pollWatermark === 'string' ? data.pollWatermark : '',
      parked: Array.isArray(data.parked) ? data.parked : []
    }
  } catch {
    syncState = emptySyncState()
  }
  return syncState
}

function writeState(state) {
  syncState = state
  const filePath = statePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        tombstones: state.tombstones || [],
        nodes: state.nodes || {},
        playlistTombstones: state.playlistTombstones || [],
        topicTombstones: state.topicTombstones || [],
        projectTombstones: state.projectTombstones || [],
        drawingShare: state.drawingShare || '',
        drawingsAsJson: state.drawingsAsJson === true,
        imagesQueued: state.imagesQueued === true,
        rowSchema: state.rowSchema === true,
        pollWatermark: state.pollWatermark || '',
        parked: Array.isArray(state.parked) ? state.parked : []
      },
      null,
      2
    ),
    'utf8'
  )
}

function bumpLocalDrift() {
  localDriftGeneration += 1
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
  const key = `${config.token || ''}\n${config.databaseId || ''}`
  if (!notionClient || notionClientKey !== key) {
    notionClient = createNotionClient({ token: config.token, databaseId: config.databaseId })
    notionClientKey = key
  }
  return notionClient
}

function placeLabel(anchor) {
  const course = String(anchor?.coursePath || '')
    .split(/[/\\]/)
    .filter(Boolean)
    .pop()
  const place =
    anchor?.lessonTitle ||
    anchor?.projectTitle ||
    anchor?.lessonRelativePath ||
    anchor?.projectId ||
    ''
  return [course, place].filter(Boolean).join(' / ')
}

function topicLabels(ids) {
  const topics = listTopics()
  return (Array.isArray(ids) ? ids : [])
    .map((id) => topics.find((topic) => topic.id === id)?.title || id)
    .filter(Boolean)
}

function noteConflictView(finding) {
  const conflict = finding.notion?.conflict || {}
  const hasMeta = Array.isArray(conflict.remoteAnchors)
  return {
    findingId: finding.id,
    title: noteWire(finding).title || 'Sin título',
    body: finding.body || '',
    remoteTitle: conflict.remoteTitle || '',
    remoteBody: conflict.remoteBody || '',
    coursePath: finding.anchors?.[0]?.coursePath || null,
    hasMeta,
    localColor: finding.color || '',
    remoteColor: conflict.remoteColor || '',
    localPlaces: (finding.anchors || []).map(placeLabel).filter(Boolean),
    remotePlaces: (conflict.remoteAnchors || []).map(placeLabel).filter(Boolean),
    localTopics: topicLabels(finding.topicIds),
    remoteTopics: topicLabels(conflict.remoteTopicIds),
    localTime: noteVideoTime(finding),
    remoteTime: conflict.remoteTimeSec === undefined ? null : conflict.remoteTimeSec
  }
}

function publicStatus() {
  const config = getNotionConfig()
  const conflicts = config.enabled
    ? readFindingList()
        .filter((finding) => finding.notion?.conflict)
        .map(noteConflictView)
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
    projectConflicts: config.enabled
      ? listStoredProjects()
          .filter((project) => project.notion?.conflict)
          .map(projectConflictView)
      : [],
    projectDeleteConflicts: (readState().projectTombstones || [])
      .filter((item) => item.conflict)
      .map((item) => {
        const parsed = projectFromBody(item.conflict.remoteBody)
        return {
          projectId: item.projectId,
          title: item.snapshot?.title || 'Proyecto',
          remoteTitle: item.conflict.remoteTitle || '',
          remoteBody: parsed
            ? projectText({ title: item.conflict.remoteTitle, ...parsed })
            : item.conflict.remoteBody || ''
        }
      }),
    progressConflicts: listProgressConflicts(),
    migrating: Boolean(migrating) || (rowWrites && !readState().rowSchema)
  }
}

function publish(force = false) {
  const send = () => {
    statusPublishedAt = Date.now()
    hooks.notifyStatus(publicStatus())
  }
  const now = Date.now()
  if (force || !statusPublishedAt || now - statusPublishedAt >= 400) {
    if (statusTimer) {
      clearTimeout(statusTimer)
      statusTimer = null
    }
    send()
    return
  }
  if (statusTimer) return
  statusTimer = setTimeout(() => {
    statusTimer = null
    send()
  }, 400)
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

function notifyProjects() {
  hooks.notifyProjects()
}

const PROJECT_STATUS_LABEL = {
  todo: 'Por hacer',
  in_progress: 'En curso',
  done: 'Hecho'
}

function projectText(project) {
  const status = PROJECT_STATUS_LABEL[project?.status] || PROJECT_STATUS_LABEL.todo
  const notes = String(project?.notes || '').trim()
  return [status, notes].filter(Boolean).join('\n\n')
}

function projectConflictView(project) {
  const remote = project.notion?.conflict || {}
  const parsed = projectFromBody(remote.remoteBody)
  return {
    projectId: project.id,
    coursePath: project.coursePath || '',
    title: project.title || 'Proyecto',
    localBody: projectText(project),
    remoteTitle: remote.remoteTitle || '',
    remoteBody: parsed
      ? projectText({ title: remote.remoteTitle, ...parsed })
      : remote.remoteBody || ''
  }
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

/** Cursor for a note. `timeSec === undefined` leaves the last shared moment unrecorded. */
function noteCursor(page, hash, timeSec, extra = {}) {
  const cursor = cursorFrom(page, hash, extra)
  cursor.wire = 2
  if (timeSec !== undefined) cursor.videoTime = roundTimeSec(timeSec)
  return cursor
}

let rowWrites = false

function rowsReady() {
  return rowWrites || readState().rowSchema === true
}

function noteShapeFromPage(page, finding) {
  const upgraded = (finding?.notion?.wire || 0) >= 2
  let anchors = upgraded
    ? page?.anchors || []
    : page?.anchors?.length
      ? page.anchors
      : finding?.anchors || []
  if (!upgraded && page?.timeSec !== undefined)
    anchors = anchorsWithVideoTime(anchors, page.timeSec)
  else if (upgraded && page?.timeSec != null) anchors = anchorsWithVideoTime(anchors, page.timeSec)
  return {
    title: page?.title,
    body: page?.body,
    color: upgraded ? page?.color || '' : page?.color || finding?.color || '',
    anchors,
    topicIds: upgraded
      ? page?.topicIds || []
      : page?.topicIds?.length
        ? page.topicIds
        : finding?.topicIds || []
  }
}

function remoteNoteHash(page, finding) {
  return noteWireHash(noteShapeFromPage(page, finding))
}

function localNoteHash(finding) {
  return noteWireHash(finding)
}

function videoTimeNeedsSync(finding) {
  const local = noteVideoTime(finding)
  const synced = finding?.notion?.videoTime
  if (synced === undefined) return local != null
  return roundTimeSec(local) !== roundTimeSec(synced)
}

function videoTimesMatch(localTime, remoteTime) {
  if (remoteTime === undefined) return localTime == null
  return roundTimeSec(localTime) === roundTimeSec(remoteTime)
}

/** Local pin wins when this copy moved and Notion did not, or when this copy is newer. */
function preferLocalVideoTime(finding, remote) {
  const remoteMoved =
    Boolean(remote?.editedAt) && remote.editedAt !== finding?.notion?.remoteEditedAt
  const localMoved = (finding?.updatedAt || 0) > (finding?.notion?.syncedAt || 0)
  if (remoteMoved && !localMoved) return false
  if (localMoved && !remoteMoved) return true
  const remoteMs = Date.parse(remote?.editedAt || '') || 0
  return (finding?.updatedAt || 0) >= remoteMs
}

function applyNotion(id, notion, text, timeSec = undefined) {
  withoutNoteWriteHook(() => {
    mutateFinding(id, (finding) => {
      const previous = finding.notion || {}
      const next = { ...notion }
      if (previous.filesPending && next.filesPending === undefined) {
        next.filesPending = previous.filesPending
      }
      if (previous.error === NOTE_FILE_MISS && !next.error) next.error = previous.error
      finding.notion = next
      if (text) {
        finding.title = normalizeTitle(text.title) || null
        finding.body = normalizeBody(text.body)
        finding.bodyHtml = null
        finding.bodyJson = null
        if ('color' in text) finding.color = text.color || null
        if (Array.isArray(text.topicIds)) finding.topicIds = text.topicIds
        if (Array.isArray(text.anchors)) finding.anchors = text.anchors
        finding.updatedAt = Date.now()
      }
      if (timeSec !== undefined && !Array.isArray(text?.anchors)) {
        finding.anchors = anchorsWithVideoTime(finding.anchors, timeSec)
      }
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
        syncedAt: current.syncedAt || null,
        ...(current.videoTime !== undefined ? { videoTime: current.videoTime } : {})
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
  if (!page?.pageId)
    page = await client.createNodePage(marker, place.courseTitle, PAGE_ICONS.course)
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
      if (current && current.title !== place.fileTitle)
        await client.renamePage(cached, place.fileTitle)
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
  if (rowsReady()) return
  const rows = await client.listPages()
  for (const row of rows) {
    if (row.findingId !== findingId || row.pageId === keepPageId) continue
    await client.archivePage(row.pageId)
  }
}

function buildNoteRow(finding) {
  const place = notionPlace(finding, readCourseTitleMap())
  const wire = noteWire(finding)
  const loose = place.courseKey === 'course:__loose__'
  return {
    kind: 'note',
    externalId: finding.id,
    parentExternalId: place.fileKey || (loose ? '' : place.courseKey),
    courseKey: loose ? '' : place.courseKey,
    title: wire.title || 'Sin título',
    body: wire.body,
    seconds: noteVideoTime(finding),
    color: wire.color,
    anchors: wire.anchors,
    anchorsText: anchorsToText(wire.anchors),
    topicIds: wire.topicIds,
    topicIdsText: topicIdsToText(wire.topicIds),
    emoji: PAGE_ICONS.note
  }
}

async function saveNoteRow(client, finding, remote) {
  const row = buildNoteRow(finding)
  if (remote?.pageId && (remote.kind === 'note' || remote.parentType === 'data_source_id')) {
    row.pageId = remote.pageId
  } else if (finding.notion?.pageId && rowsReady()) {
    row.pageId = finding.notion.pageId
  }
  row.databaseRow = Boolean(row.pageId)
  const page = await client.saveRow(row)
  const fileFetch = await reconcileNoteFiles(client, page?.pageId, finding.body, { remove: true })
  return page ? { ...page, fileFetch } : page
}

async function saveNotePage(client, finding, remote) {
  if (rowsReady()) return saveNoteRow(client, finding, remote)
  const parentId = await ensurePlace(client, finding)
  const timeSec = noteVideoTime(finding)
  const title = noteWire(finding).title
  let page = remote
  if (page?.pageId) {
    const parent = await client.pageParent(page.pageId)
    if (parent?.type === 'page_id' && parent.id === parentId) {
      page = await client.updatePage(
        page.pageId,
        finding.id,
        title,
        finding.body,
        PAGE_ICONS.note,
        'finding',
        null,
        timeSec
      )
    } else {
      const body = finding.body
      page = await client.createPage(
        finding.id,
        title,
        body,
        parentId,
        PAGE_ICONS.note,
        null,
        'finding',
        null,
        timeSec
      )
      await client.archivePage(remote.pageId)
    }
  } else {
    page = await client.createPage(
      finding.id,
      title,
      finding.body,
      parentId,
      PAGE_ICONS.note,
      null,
      'finding',
      null,
      timeSec
    )
  }
  await retireFlatCopies(client, finding.id, page.pageId)
  const fileFetch = await reconcileNoteFiles(client, page?.pageId, finding.body, { remove: true })
  return page ? { ...page, fileFetch } : page
}

const MAX_NOTE_ASSET_BYTES = 20 * 1024 * 1024

/** One pass so pictures skipped by an older sync get sent or fetched. */
function queueImageUploads() {
  const state = readState()
  if (state.imagesQueued) return
  for (const finding of readFindingList()) {
    if (finding.notion?.conflict || !finding.notion?.pageId) continue
    if (!noteAssetNames(finding.body || '').length) continue
    const pending = jobs.get(finding.id)
    if (pending?.op === 'delete') continue
    jobs.set(finding.id, {
      op: 'upsert',
      remote: Boolean(pending?.remote),
      attempts: pending?.attempts || 0,
      files: true
    })
  }
  state.imagesQueued = true
  writeState(state)
}

/** Notes that still have a scene file need one upsert so the JSON reaches Notion. */
function queueDrawingUploads() {
  const state = readState()
  if (state.drawingsAsJson) return
  const alreadyJson = state.drawingShare === 'json'
  state.drawingsAsJson = true
  state.drawingShare = ''
  writeState(state)
  if (alreadyJson) return
  for (const finding of readFindingList()) {
    const names = noteAssetNames(finding.body || '')
    if (names.some((name) => String(name).toLowerCase().endsWith('.excalidraw'))) {
      enqueueNotionUpsert(finding.id)
    }
  }
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

function filesNeedFetch(notion) {
  return Array.isArray(notion?.filesPending?.names) && notion.filesPending.names.length > 0
}

function recordNoteFiles(id, result) {
  if (!result) return
  withoutNoteWriteHook(() => {
    mutateFinding(id, (finding) => {
      const current = finding.notion || {}
      if (!result.missing.length) {
        if (!current.filesPending && current.error !== NOTE_FILE_MISS) return
        const next = {
          ...current,
          error: current.error === NOTE_FILE_MISS ? null : current.error
        }
        delete next.filesPending
        finding.notion = next
        return
      }
      const tries = (current.filesPending?.tries || 0) + 1
      const next = { ...current }
      if (tries >= NOTE_FILE_TRIES) {
        delete next.filesPending
        next.error = NOTE_FILE_MISS
      } else {
        next.filesPending = { tries, names: result.missing }
      }
      finding.notion = next
    })
  })
}

/**
 * Download files this computer lacks and upload local files the page lacks.
 * `remove` drops page files the note no longer names. A pull leaves them, so a
 * receive does not write to Notion unless a local file is actually missing there.
 * Pass `assets` from a page just read to skip a second block list.
 */
async function reconcileNoteFiles(client, pageId, body, { assets, remove = false } = {}) {
  const empty = { fetched: false, missing: [] }
  if (!pageId) return empty
  const names = noteAssetNames(body)
  if (!names.length) return empty
  const planned = notionAssetsToUpload(names)
  const wanted = new Set(planned.map((item) => item.name))
  const remote = Array.isArray(assets) ? assets : await client.listNoteAssets(pageId)
  if (remove) {
    for (const item of remote) {
      if (wanted.has(item.name) || !item.blockId) continue
      await client.deleteBlock(item.blockId)
    }
  }
  const present = new Set()
  const byName = new Map()
  for (const item of remote) {
    if (!wanted.has(item.name)) continue
    present.add(item.name)
    byName.set(item.name, item)
  }
  const missing = []
  let fetched = false
  for (const name of wanted) {
    const onPage = byName.get(name)
    if (!noteAttachmentExists(name)) {
      if (!onPage?.url) {
        missing.push(name)
        continue
      }
      try {
        const bytes = await client.downloadAsset(onPage.url)
        if (!bytes?.byteLength) {
          missing.push(name)
          continue
        }
        saveNoteAttachmentBytes(name, bytes)
        fetched = true
      } catch {
        missing.push(name)
      }
      continue
    }
    if (present.has(name)) continue
    const local = readNoteAttachment(name)
    if (!local || local.size > MAX_NOTE_ASSET_BYTES) continue
    const plan = planned.find((item) => item.name === name)
    try {
      await client.attachNoteFile(
        pageId,
        name,
        local.bytes,
        plan?.contentType || local.contentType,
        plan?.filename || name
      )
    } catch (error) {
      if (remove) throw error
      missing.push(name)
    }
  }
  return { fetched, missing }
}

async function syncNoteFiles(client, id, page, body) {
  if (page?.fileFetch) {
    recordNoteFiles(id, page.fileFetch)
    return page.fileFetch
  }
  const result = await reconcileNoteFiles(client, page?.pageId, body, {
    assets: page?.assets,
    remove: false
  })
  recordNoteFiles(id, result)
  return result
}

async function placeExisting(client, finding, remote) {
  if (rowsReady()) return remote
  const parentId = await ensurePlace(client, finding)
  const parent = await client.pageParent(remote.pageId)
  if (parent?.type === 'page_id' && parent.id === parentId) {
    await retireFlatCopies(client, finding.id, remote.pageId)
    const fileFetch = await reconcileNoteFiles(client, remote.pageId, remote.body)
    return { ...remote, fileFetch }
  }
  const created = await client.createPage(
    finding.id,
    remote.title,
    remote.body,
    parentId,
    PAGE_ICONS.note,
    null,
    'finding',
    null,
    remote.timeSec !== undefined ? remote.timeSec : noteVideoTime(finding)
  )
  await client.archivePage(remote.pageId)
  await retireFlatCopies(client, finding.id, created.pageId)
  const fileFetch = await reconcileNoteFiles(client, created.pageId, remote.body, {
    remove: true
  })
  return {
    ...remote,
    pageId: created.pageId,
    editedAt: created.editedAt || remote.editedAt,
    fileFetch
  }
}

function finishWrite(id, page, localHash, timeSec) {
  if (!page?.pageId) throw new Error('Notion no devolvió la página')
  const remoteHash =
    page.body === undefined
      ? localHash
      : rowsReady()
        ? remoteNoteHash(page, {
            notion: { wire: 2 },
            anchors: page.anchors,
            color: page.color,
            topicIds: page.topicIds
          })
        : wireHash(page.title, page.body)
  const sharedTime = page.timeSec !== undefined ? page.timeSec : timeSec
  if (page?.body !== undefined && remoteHash !== localHash) {
    applyNotion(
      id,
      noteCursor(page, remoteHash, sharedTime, { pulledAt: Date.now() }),
      page,
      sharedTime
    )
    return
  }
  applyNotion(id, noteCursor(page, localHash, sharedTime))
}

function noteSyncAction(finding, remote) {
  if (rowsReady() && (finding.notion?.wire || 0) < 2) {
    const bodyAction = decideSync({
      hasRemote: Boolean(remote),
      localHash: wireHash(noteWire(finding).title, finding.body),
      remoteHash: remote ? wireHash(remote.title, remote.body) : null,
      ackedHash: finding.notion?.ackedHash || null
    })
    if (bodyAction === 'conflict') return 'conflict'
    if (bodyAction === 'pull') return 'pull'
    return remote ? 'push' : 'create'
  }
  const localHash = rowsReady() ? localNoteHash(finding) : wireHash(noteWire(finding).title, finding.body)
  return decideSync({
    hasRemote: Boolean(remote),
    localHash,
    remoteHash: remote
      ? rowsReady()
        ? remoteNoteHash(remote, finding)
        : wireHash(remote.title, remote.body)
      : null,
    ackedHash: finding.notion?.ackedHash || null
  })
}

async function writeLocal(client, finding) {
  const remote = await loadRemote(client, finding)
  const page = await saveNotePage(client, finding, remote)
  const localHash = rowsReady() ? localNoteHash(finding) : wireHash(noteWire(finding).title, finding.body)
  finishWrite(finding.id, page, localHash, noteVideoTime(finding))
  recordNoteFiles(finding.id, page?.fileFetch)
}

async function reconcileUpsert(client, id, job = {}) {
  let finding = readFinding(id)
  if (!finding && rowsReady()) {
    const remote = await loadKindPage(client, 'note', id, null)
    if (!remote) return
    const shape = noteShapeFromPage(remote, { notion: { wire: 2 } })
    const created = findingFromLegacyNote(
      {
        id,
        title: shape.title,
        body: shape.body,
        color: shape.color,
        topicIds: shape.topicIds,
        anchors: shape.anchors
      },
      shape.anchors?.[0]?.coursePath || null
    )
    created.notion = noteCursor(remote, noteWireHash(shape), remote.timeSec, {
      pulledAt: Date.now()
    })
    withoutNoteWriteHook(() => restoreFinding(created))
    await syncNoteFiles(client, id, remote, shape.body)
    notifyNotes()
    return
  }
  if (!finding || finding.notion?.conflict) return

  const localHash = rowsReady() ? localNoteHash(finding) : wireHash(noteWire(finding).title, finding.body)
  if (
    !job.remote &&
    (finding.notion?.wire || 0) >= 2 &&
    finding.notion?.ackedHash === localHash &&
    !videoTimeNeedsSync(finding)
  ) {
    if ((job.files || filesNeedFetch(finding.notion)) && finding.notion?.pageId) {
      const result = await reconcileNoteFiles(client, finding.notion.pageId, finding.body)
      recordNoteFiles(id, result)
      if (result.fetched) notifyNotes()
    }
    return
  }
  const remote = await loadRemote(client, finding)
  const action = noteSyncAction(finding, remote)

  if (action === 'create' || action === 'push') {
    const page = await saveNotePage(client, finding, remote)
    finishWrite(id, page, localHash, noteVideoTime(finding))
    recordNoteFiles(id, page?.fileFetch)
    notifyNotes()
    return
  }

  if (action === 'pull') {
    const placed = await placeExisting(client, finding, remote)
    const shape = rowsReady() ? noteShapeFromPage(placed, finding) : placed
    const hash = rowsReady() ? noteWireHash(shape) : wireHash(placed.title, placed.body)
    applyNotion(
      id,
      noteCursor(placed, hash, placed.timeSec, { pulledAt: Date.now() }),
      shape,
      Array.isArray(shape.anchors) ? undefined : placed.timeSec
    )
    await syncNoteFiles(client, id, placed, shape.body ?? placed.body)
    notifyNotes()
    return
  }

  if (action === 'relink') {
    const localTime = noteVideoTime(finding)
    const remoteTime = remote.timeSec
    if (!videoTimesMatch(localTime, remoteTime)) {
      if (remoteTime === undefined || preferLocalVideoTime(finding, remote)) {
        const page = await saveNotePage(client, finding, remote)
        finishWrite(id, page, localHash, localTime)
        recordNoteFiles(id, page?.fileFetch)
      } else {
        const placed = await placeExisting(client, finding, remote)
        applyNotion(id, noteCursor(placed, localHash, remoteTime), null, remoteTime)
        await syncNoteFiles(client, id, placed, placed.body)
      }
      notifyNotes()
      return
    }
    const placed = await placeExisting(client, finding, remote)
    applyNotion(id, noteCursor(placed, localHash, localTime))
    await syncNoteFiles(client, id, placed, placed.body)
    notifyNotes()
    return
  }

  const placed = await placeExisting(client, finding, remote)
  const remoteShape = rowsReady() ? noteShapeFromPage(placed, finding) : null
  applyNotion(id, {
    pageId: placed.pageId,
    ackedHash: finding.notion?.ackedHash || null,
    remoteEditedAt: placed.editedAt || null,
    conflict: {
      remoteTitle: placed.title || '',
      remoteBody: placed.body || '',
      remoteEditedAt: placed.editedAt || null,
      ...(remoteShape
        ? {
            remoteColor: remoteShape.color || '',
            remoteAnchors: remoteShape.anchors || [],
            remoteTopicIds: remoteShape.topicIds || [],
            remoteTimeSec: placed.timeSec === undefined ? null : placed.timeSec
          }
        : {})
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
    publish(true)
    return
  }
  if (!jobs.size) return
  const batch = new Map(jobs)
  jobs.clear()
  syncTotal = batch.size
  syncDone = 0
  syncing = true
  publish(true)
  let retryDelay = 0
  try {
    const client = clientFromConfig()
    await client.loadSchema()
    await ensureRowSchema(client)
    for (const [id, job] of batch) {
      if (!getNotionConfig().enabled) {
        jobs.set(id, job)
        continue
      }
      try {
        if (job.op === 'playlist-upsert') {
          await reconcilePlaylist(client, job.playlistId, { refresh: job.refresh })
        } else if (job.op === 'playlist-delete')
          await reconcilePlaylistDelete(client, job.playlistId)
        else if (job.op === 'progress-upsert') await reconcileProgress(client, job.coursePath, job)
        else if (job.op === 'topic-upsert') await reconcileTopic(client, job.topicId)
        else if (job.op === 'topic-delete') await reconcileTopicDelete(client, job.topicId)
        else if (job.op === 'project-upsert')
          await reconcileProject(client, job.projectId, job.coursePath)
        else if (job.op === 'project-delete') await reconcileProjectDelete(client, job.projectId)
        else if (job.op === 'intent-upsert') await reconcileIntent(client)
        else if (job.op === 'delete') await reconcileDelete(client, id)
        else await reconcileUpsert(client, id, job)
        clearFailure()
        syncDone += 1
        publish()
      } catch (error) {
        noteFailure(error)
        if (job.op === 'playlist-upsert') rememberPlaylistError(job.playlistId, lastError)
        else if (job.op === 'progress-upsert') rememberProgressError(job.coursePath, lastError)
        else if (job.op === 'topic-upsert') rememberTopicError(job.topicId, lastError)
        else if (job.op === 'project-upsert')
          rememberProjectError(job.projectId, job.coursePath, lastError)
        else if (
          job.op !== 'delete' &&
          job.op !== 'playlist-delete' &&
          job.op !== 'topic-delete' &&
          job.op !== 'project-delete' &&
          job.op !== 'intent-upsert'
        ) {
          rememberError(id, lastError)
        }
        if (requeueJob(id, job, error)) {
          const wait = error.status === 429 ? 5000 : isSaveConflict(error) ? 1500 : 15000
          retryDelay = Math.max(retryDelay, wait)
        }
        if (job.op === 'playlist-upsert' || job.op === 'playlist-delete') notifyPlaylists()
        else if (job.op === 'progress-upsert') notifyProgress()
        else notifyNotes()
        syncDone += 1
        publish(true)
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
    publish(true)
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
  return (
    findFindingByPageId(page.pageId) ||
    (page.findingId ? findFindingRecord(page.findingId) : null)
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
  for (const finding of readFindingList()) {
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
  const known = findFindingByPageId(pageId)
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
  if (page.timeSec !== undefined && !anchor.projectId) anchor.timeSec = roundTimeSec(page.timeSec)
  const fileFetch = await reconcileNoteFiles(client, page.pageId, page.body, {
    assets: page.assets
  })
  const existing = linkedFinding(page)
  if (existing) recordNoteFiles(existing.id, fileFetch)
  if (existing) {
    let changed = false
    const sameText = wireHash(existing.title, existing.body) === wireHash(page.title, page.body)
    const localTime = noteVideoTime(existing)
    const remoteTime = page.timeSec
    const pushLocalTime =
      sameText &&
      remoteTime !== undefined &&
      !videoTimesMatch(localTime, remoteTime) &&
      preferLocalVideoTime(existing, page)
    const sharedTime = pushLocalTime ? localTime : remoteTime
    if (shouldRetarget(existing, anchor)) {
      if (sharedTime === undefined) {
        if (localTime != null && !anchor.projectId) anchor.timeSec = localTime
      } else if (!anchor.projectId) anchor.timeSec = roundTimeSec(sharedTime)
      const next = findingFromLegacyNote({ ...existing, anchors: [anchor] }, anchor.coursePath)
      withoutNoteWriteHook(() => {
        mutateFinding(existing.id, (finding) => {
          finding.anchors = next.anchors
        })
      })
      changed = true
    } else if (
      sameText &&
      sharedTime !== undefined &&
      roundTimeSec(sharedTime) !== roundTimeSec(localTime) &&
      !pushLocalTime
    ) {
      withoutNoteWriteHook(() => {
        mutateFinding(existing.id, (finding) => {
          finding.anchors = anchorsWithVideoTime(finding.anchors, sharedTime)
        })
      })
      changed = true
    }
    if (!page.findingId && sameText) {
      const stamped = await client.updatePage(
        page.pageId,
        existing.id,
        page.title,
        page.body,
        page.icon,
        'finding',
        null,
        sharedTime
      )
      const hash = wireHash(stamped?.title, stamped?.body)
      const writtenTime = stamped?.timeSec !== undefined ? stamped.timeSec : sharedTime
      if (stamped?.pageId) {
        withoutNoteWriteHook(() =>
          applyNotion(existing.id, noteCursor(stamped, hash, writtenTime), null, writtenTime)
        )
        sharedIdsConfirmed.add(page.pageId)
      }
      return changed
    }
    if (page.findingId) sharedIdsConfirmed.add(page.pageId)
    if (existing.notion?.conflict) return changed
    if (page.editedAt && page.editedAt !== existing.notion?.remoteEditedAt) {
      if (sameText) {
        if (pushLocalTime) {
          jobs.set(existing.id, { op: 'upsert' })
          noteQueued(recent?.probe, existing.id, 'tiempo')
          return changed
        }
        withoutNoteWriteHook(() =>
          applyNotion(
            existing.id,
            noteCursor(page, wireHash(page.title, page.body), sharedTime),
            null,
            sharedTime
          )
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
      (await client.updatePage(
        page.pageId,
        id,
        page.title,
        page.body,
        page.icon,
        'finding',
        null,
        page.timeSec
      )) || page
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
  const adoptedTime = adopted.timeSec !== undefined ? adopted.timeSec : page.timeSec
  finding.notion = noteCursor(adopted, hash, adoptedTime, { pulledAt: Date.now() })
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
    notePrepare('Notas', index + 1, courseRows.length)
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

let migrating = null

async function archiveLegacyPage(client, legacyId, keptId) {
  if (!legacyId || legacyId === keptId) return
  try {
    const parent = await client.pageParent(legacyId)
    if (parent?.type === 'page_id') await client.archivePage(legacyId)
  } catch {
    // The nested page is already gone.
  }
}

async function migrateToRows(client) {
  notePrepare('Pasando Notion a filas…')
  await client.loadSchema()
  const remotePages = await client.listPages()
  const recent = { byId: new Map(), complete: false, probe: null }
  try {
    await importSharedNotes(client, remotePages, recent)
  } catch (error) {
    noteFailure(error)
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

  rowWrites = true
  try {
    const titles = readCourseTitleMap()
    const notes = readFindingList().filter((finding) => !finding.notion?.conflict)
    const playlists = listPlaylistRecords().filter((playlist) => !playlist.notion?.conflict)
    const progressRows = listCourseProgressRecords().filter((course) => {
      if (course.notion?.conflict) return false
      const local = localProgress(course.id)
      return !progressIsEmpty(local) || Boolean(course.notion?.pageId)
    })
    const files = new Map()
    const courses = new Map()
    for (const finding of readFindingList()) {
      const place = notionPlace(finding, titles)
      if (place.fileKey) files.set(place.fileKey, place)
      if (place.courseKey && place.courseKey !== 'course:__loose__')
        courses.set(place.courseKey, place)
    }
    const topics = listTopics().filter((topic) => !topic?.notion?.conflict)
    const projects = listStoredProjects().filter((project) => !project?.notion?.conflict)
    const migrationTotal =
      notes.length +
      playlists.length +
      progressRows.length +
      files.size +
      courses.size +
      topics.length +
      projects.length +
      2
    let migrationDone = 0
    const migrationStep = (label) => {
      migrationDone += 1
      notePrepare(label, migrationDone, migrationTotal)
    }
    for (const finding of notes) {
      migrationStep(`Nota · ${noteWire(finding).title || finding.id}`)
      const legacyId = finding.notion?.pageId || null
      const page = await client.saveRow(buildNoteRow(finding))
      const fileFetch = await reconcileNoteFiles(client, page?.pageId, finding.body, {
        remove: true
      })
      await archiveLegacyPage(client, legacyId, page.pageId)
      finishWrite(
        finding.id,
        page,
        localNoteHash(readFinding(finding.id) || finding),
        noteVideoTime(finding)
      )
      recordNoteFiles(finding.id, fileFetch)
    }
    for (const playlist of playlists) {
      migrationStep(`Lista · ${playlist.title || playlist.id}`)
      const legacyId = playlist.notion?.pageId || null
      const page = await savePlaylistPage(client, playlist, null)
      await archiveLegacyPage(client, legacyId, page?.pageId)
      if (page?.pageId) {
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
    }
    for (const course of progressRows) {
      migrationStep(`Progreso · ${courseTitle(course.id)}`)
      const local = localProgress(course.id)
      const legacyId = course.notion?.pageId || null
      const page = await saveProgressPage(client, course.id, local, null)
      await archiveLegacyPage(client, legacyId, page?.pageId)
      if (page?.pageId) {
        const hash = progressSyncHash(course.id, local)
        writeCourseProgress(course.id, { notion: cursorFrom(page, hash) })
      }
    }
    for (const place of files.values()) {
      migrationStep(`Archivo · ${place.fileTitle || 'Archivo'}`)
      const legacyId = readNodes()[place.fileKey] || null
      const page = await client.saveRow({
        kind: 'file',
        externalId: place.fileKey,
        parentExternalId: place.courseKey,
        courseKey: place.courseKey,
        title: place.fileTitle || 'Archivo',
        emoji: PAGE_ICONS.file
      })
      await archiveLegacyPage(client, legacyId, page.pageId)
      if (page?.pageId) writeNode(place.fileKey, page.pageId)
    }
    for (const [courseKey, place] of courses) {
      migrationStep(`Curso · ${place.courseTitle || courseKey}`)
      const folder = courseKey.slice('course:'.length)
      const existing = await client.findNode(`node:${courseKey}`)
      await client.saveRow({
        kind: 'course',
        externalId: courseKey,
        courseKey,
        title: place.courseTitle || courseTitle(folder),
        nodeMarker: `node:${courseKey}`,
        pageId: existing?.pageId || null,
        emoji: PAGE_ICONS.course
      })
    }
    migrationStep('Cerrando páginas anteriores')
    await archiveSection(client, PLAYLIST_MARKER, 'playlist')
    await archiveSection(client, PROGRESS_MARKER, 'progress')
    for (const topic of topics) {
      migrationStep(`Tema · ${topic.title || topic.id}`)
      await reconcileTopic(client, topic.id)
    }
    for (const project of projects) {
      migrationStep(`Proyecto · ${project.title || project.id}`)
      await reconcileProject(client, project.id, project.coursePath)
    }
    migrationStep('Intención')
    await reconcileIntent(client)
    const state = readState()
    state.rowSchema = true
    state.pollWatermark = new Date().toISOString()
    writeState(state)
  } finally {
    rowWrites = readState().rowSchema === true
  }
}

async function archiveSection(client, marker, kind) {
  const section = await client.findNode(marker)
  if (!section?.pageId) return
  const children = await client.listChildPages(section.pageId)
  for (const child of children) {
    const page = await client.readPage(child.pageId)
    const matches =
      (kind === 'playlist' && page?.playlistId) || (kind === 'progress' && page?.progressId)
    if (matches) await client.archivePage(child.pageId)
  }
  const left = await client.listChildPages(section.pageId)
  if (!left.length) await client.archivePage(section.pageId)
}

async function ensureRowSchema(client) {
  if (readState().rowSchema) return
  if (!migrating) {
    migrating = migrateToRows(client).finally(() => {
      migrating = null
    })
  }
  await migrating
}

function topicKey(id) {
  return `topic:${id}`
}

function projectJobKey(id) {
  return `project:${id}`
}

function rememberTopicError(id, message) {
  const topic = readTopic(id)
  if (!topic) return
  withoutNoteWriteHook(() => {
    upsertTopic({
      id,
      title: topic.title,
      summary: topic.summary,
      aliases: topic.aliases,
      notion: { ...(topic.notion || {}), error: message }
    })
  })
}

function rememberProjectError(id, coursePath, message) {
  const project = readStoredProject(coursePath, id)
  if (!project) return
  withoutNoteWriteHook(() => {
    upsertProject(project.coursePath || coursePath, {
      id,
      title: project.title,
      notes: project.notes,
      status: project.status,
      sectionId: project.sectionId,
      fileRelativePath: project.fileRelativePath,
      notion: { ...(project.notion || {}), error: message }
    })
  })
}

async function loadKindPage(client, kind, id, pageId) {
  if (pageId) {
    const direct = await client.readPage(pageId)
    if (direct && (direct.kind === kind || direct.externalId === id)) return direct
  }
  const found = await client.findRow(kind, id)
  if (!found?.pageId) return null
  return client.readPage(found.pageId)
}

async function reconcileTopic(client, id) {
  let topic = readTopic(id)
  if (!topic) {
    const remote = await loadKindPage(client, 'topic', id, null)
    const parsed = remote ? topicFromBody(remote.body) : null
    if (!remote || !parsed) return
    const hash = wireHash(remote.title, topicWire({ title: remote.title, ...parsed }).body)
    withoutNoteWriteHook(() => {
      upsertTopic({
        id,
        title: remote.title,
        summary: parsed.summary,
        aliases: parsed.aliases,
        notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
      })
    })
    return
  }
  if (topic.notion?.conflict) return
  const wire = topicWire(topic)
  const localHash = wireHash(wire.title, wire.body)
  const remote = await loadKindPage(client, 'topic', id, topic.notion?.pageId)
  const parsed = remote ? topicFromBody(remote.body) : null
  const action = decideSync({
    hasRemote: Boolean(remote && (parsed || remote.kind === 'topic')),
    localHash,
    remoteHash: parsed
      ? wireHash(remote.title, topicWire({ title: remote.title, ...parsed }).body)
      : null,
    ackedHash: topic.notion?.ackedHash || null
  })
  if (action === 'pull' && parsed) {
    const hash = wireHash(remote.title, topicWire({ title: remote.title, ...parsed }).body)
    withoutNoteWriteHook(() => {
      upsertTopic({
        id,
        title: remote.title,
        summary: parsed.summary,
        aliases: parsed.aliases,
        notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
      })
    })
    return
  }
  if (action === 'conflict' && remote) {
    withoutNoteWriteHook(() => {
      upsertTopic({
        id,
        title: topic.title,
        summary: topic.summary,
        aliases: topic.aliases,
        notion: {
          pageId: remote.pageId,
          ackedHash: topic.notion?.ackedHash || null,
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
    return
  }
  if (action !== 'create' && action !== 'push' && action !== 'relink') return
  const page = await client.saveRow({
    kind: 'topic',
    externalId: id,
    title: wire.title,
    body: wire.body,
    pageId: remote?.pageId || null,
    databaseRow: Boolean(remote?.pageId),
    emoji: PAGE_ICONS.topic
  })
  const hash = page?.body === undefined ? localHash : wireHash(page.title, page.body)
  withoutNoteWriteHook(() => {
    upsertTopic({
      id,
      title: topic.title,
      summary: topic.summary,
      aliases: topic.aliases,
      notion: cursorFrom(page, hash)
    })
  })
}

function rememberTopicDelete(topic) {
  const state = readState()
  state.topicTombstones = (state.topicTombstones || []).filter((item) => item.topicId !== topic.id)
  state.topicTombstones.push({
    topicId: topic.id,
    pageId: topic.notion?.pageId || null,
    ackedHash: topic.notion?.ackedHash || null,
    snapshot: {
      title: topic.title || '',
      summary: topic.summary || '',
      aliases: topic.aliases || []
    },
    conflict: null
  })
  writeState(state)
}

async function reconcileTopicDelete(client, topicId) {
  const tomb = (readState().topicTombstones || []).find((item) => item.topicId === topicId)
  if (!tomb || tomb.conflict) return
  const remote = tomb.pageId
    ? await client.readPage(tomb.pageId)
    : await loadKindPage(client, 'topic', topicId, null)
  const parsed = remote ? topicFromBody(remote.body) : null
  const action = decideDelete({
    hasRemote: Boolean(remote),
    remoteHash: parsed
      ? wireHash(remote.title, topicWire({ title: remote.title, ...parsed }).body)
      : null,
    ackedHash: tomb.ackedHash
  })
  const drop = (extra) => {
    const state = readState()
    state.topicTombstones = (state.topicTombstones || [])
      .filter((item) => item.topicId !== topicId)
      .concat(extra || [])
    writeState(state)
  }
  if (action === 'drop') {
    drop()
    return
  }
  if (action === 'archive') {
    await client.archivePage(remote.pageId)
    drop()
    return
  }
  drop([
    {
      ...tomb,
      conflict: {
        remoteTitle: remote.title || '',
        remoteBody: remote.body || '',
        remoteEditedAt: remote.editedAt || null
      }
    }
  ])
}

async function reconcileProject(client, id, coursePath) {
  const project =
    readStoredProject(coursePath, id) || listStoredProjects().find((item) => item.id === id)
  if (!project || project.notion?.conflict) return
  const wire = projectWire(project)
  const localHash = wireHash(wire.title, wire.body)
  const remote = await loadKindPage(client, 'project', id, project.notion?.pageId)
  const parsed = remote ? projectFromBody(remote.body) : null
  const action = decideSync({
    hasRemote: Boolean(remote && parsed),
    localHash,
    remoteHash: parsed
      ? wireHash(remote.title, projectWire({ title: remote.title, ...parsed }).body)
      : null,
    ackedHash: project.notion?.ackedHash || null
  })
  const folder = project.coursePath || coursePath
  if (action === 'pull' && parsed) {
    const hash = wireHash(remote.title, projectWire({ title: remote.title, ...parsed }).body)
    withoutNoteWriteHook(() => {
      upsertProject(folder, {
        id,
        title: remote.title,
        notes: parsed.notes,
        status: parsed.status,
        sectionId: parsed.sectionId || null,
        fileRelativePath: parsed.fileRelativePath || null,
        notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
      })
    })
    notifyProjects()
    return
  }
  if (action === 'conflict' && remote) {
    withoutNoteWriteHook(() => {
      upsertProject(folder, {
        id,
        notion: {
          pageId: remote.pageId,
          ackedHash: project.notion?.ackedHash || null,
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
    notifyProjects()
    return
  }
  if (action !== 'create' && action !== 'push' && action !== 'relink') return
  const page = await client.saveRow({
    kind: 'project',
    externalId: id,
    parentExternalId: folder ? `course:${folder}` : '',
    courseKey: folder ? `course:${folder}` : '',
    title: wire.title,
    body: wire.body,
    status: wire.status,
    pageId: remote?.pageId || null,
    databaseRow: Boolean(remote?.pageId),
    emoji: PAGE_ICONS.project
  })
  const hash = page?.body === undefined ? localHash : wireHash(page.title, page.body)
  withoutNoteWriteHook(() => {
    upsertProject(folder, { id, notion: cursorFrom(page, hash) })
  })
}

function rememberProjectDelete(project) {
  const state = readState()
  state.projectTombstones = (state.projectTombstones || []).filter(
    (item) => item.projectId !== project.id
  )
  state.projectTombstones.push({
    projectId: project.id,
    coursePath: project.coursePath || '',
    pageId: project.notion?.pageId || null,
    ackedHash: project.notion?.ackedHash || null,
    snapshot: {
      title: project.title || '',
      notes: project.notes || '',
      status: project.status || 'todo',
      sectionId: project.sectionId || null,
      fileRelativePath: project.fileRelativePath || null,
      linkedFolderPath: project.linkedFolderPath || null
    },
    conflict: null
  })
  writeState(state)
}

async function reconcileProjectDelete(client, projectId) {
  const tomb = (readState().projectTombstones || []).find((item) => item.projectId === projectId)
  if (!tomb || tomb.conflict) return
  const remote = tomb.pageId
    ? await client.readPage(tomb.pageId)
    : await loadKindPage(client, 'project', projectId, null)
  const parsed = remote ? projectFromBody(remote.body) : null
  const action = decideDelete({
    hasRemote: Boolean(remote),
    remoteHash: parsed
      ? wireHash(remote.title, projectWire({ title: remote.title, ...parsed }).body)
      : null,
    ackedHash: tomb.ackedHash
  })
  const write = (items) => {
    const state = readState()
    state.projectTombstones = items
    writeState(state)
  }
  const rest = () =>
    (readState().projectTombstones || []).filter((item) => item.projectId !== projectId)
  if (action === 'drop') {
    write(rest())
    return
  }
  if (action === 'archive') {
    await client.archivePage(remote.pageId)
    write(rest())
    return
  }
  write(
    rest().concat([
      {
        ...tomb,
        conflict: {
          remoteTitle: remote.title || '',
          remoteBody: remote.body || '',
          remoteEditedAt: remote.editedAt || null
        }
      }
    ])
  )
}

async function reconcileIntent(client) {
  const intent = readPlaylistIntentRecord()
  const wire = intentWire(intent)
  const localHash = wireHash(wire.title, wire.body)
  const remote = await loadKindPage(client, 'intent', PLAYLIST_INTENT_ID, intent?.notion?.pageId)
  const parsed = remote ? intentFromBody(remote.body) : null
  if (!String(intent?.goal || '').trim() && !(intent?.interests || []).length && !remote) return
  const action = decideSync({
    hasRemote: Boolean(remote && parsed),
    localHash,
    remoteHash: parsed ? wireHash(parsed.title, parsed.body) : null,
    ackedHash: intent?.notion?.ackedHash || null
  })
  if (action === 'pull' && parsed) {
    const data = JSON.parse(remote.body)
    const hash = wireHash(parsed.title, parsed.body)
    withoutNoteWriteHook(() => {
      savePlaylistIntent({
        goal: data.goal,
        interests: data.interests,
        notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
      })
    })
    return
  }
  if (action === 'conflict' && remote) {
    withoutNoteWriteHook(() => {
      savePlaylistIntent({
        goal: intent.goal,
        interests: intent.interests,
        notion: {
          pageId: remote.pageId,
          ackedHash: intent.notion?.ackedHash || null,
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
    return
  }
  if (action !== 'create' && action !== 'push' && action !== 'relink') return
  const page = await client.saveRow({
    kind: 'intent',
    externalId: PLAYLIST_INTENT_ID,
    title: wire.title,
    body: wire.body,
    pageId: remote?.pageId || null,
    databaseRow: Boolean(remote?.pageId),
    emoji: PAGE_ICONS.intent
  })
  const hash = page?.body === undefined ? localHash : wireHash(page.title, page.body)
  withoutNoteWriteHook(() => {
    savePlaylistIntent({
      goal: intent.goal,
      interests: intent.interests,
      notion: cursorFrom(page, hash)
    })
  })
}

function rowCursorEdited(row) {
  const kind = row?.kind || ''
  const id = row?.externalId || row?.findingId || row?.playlistId || row?.progressId || ''
  if (kind === 'note' || (!kind && row?.findingId)) {
    const finding = findFindingRecord(row.externalId || row.findingId)
    return finding?.notion?.remoteEditedAt || ''
  }
  if (kind === 'playlist') return readPlaylist(id)?.notion?.remoteEditedAt || ''
  if (kind === 'progress') return readCourseProgressRecord(id)?.notion?.remoteEditedAt || ''
  if (kind === 'topic') return readTopic(id)?.notion?.remoteEditedAt || ''
  if (kind === 'project')
    return listStoredProjects().find((item) => item.id === id)?.notion?.remoteEditedAt || ''
  if (kind === 'intent') return readPlaylistIntentRecord()?.notion?.remoteEditedAt || ''
  return ''
}

function noteConflictIsCurrent(id, editedAt) {
  const finding = findFindingRecord(id)
  if (!finding?.notion?.conflict || !editedAt) return false
  return (finding.notion.conflict.remoteEditedAt || '') === editedAt
}

function enqueueChangedRow(row) {
  const kind =
    row?.kind ||
    (row?.playlistId ? 'playlist' : row?.progressId ? 'progress' : row?.findingId ? 'note' : '')
  const id = row?.externalId || row?.findingId || row?.playlistId || row?.progressId || ''
  if (!kind || !id || kind === 'course' || kind === 'file') return false
  if (row.editedAt && row.editedAt === rowCursorEdited(row)) return false
  if (kind === 'note') {
    if (saveConflictParked(id) || noteConflictIsCurrent(id, row.editedAt)) return false
    const pending = jobs.get(id)
    jobs.set(id, { op: 'upsert', remote: true, attempts: pending?.attempts || 0 })
    return true
  }
  if (kind === 'playlist') {
    const key = playlistKey(id)
    if (saveConflictParked(key)) return false
    const pending = jobs.get(key)
    jobs.set(key, {
      op: 'playlist-upsert',
      playlistId: id,
      remote: true,
      attempts: pending?.attempts || 0
    })
    return true
  }
  if (kind === 'progress') {
    const key = progressKey(id)
    if (saveConflictParked(key)) return false
    const pending = jobs.get(key)
    jobs.set(key, {
      op: 'progress-upsert',
      coursePath: id,
      remote: true,
      attempts: pending?.attempts || 0
    })
    return true
  }
  if (kind === 'topic') {
    const key = topicKey(id)
    if (saveConflictParked(key)) return
    jobs.set(key, { op: 'topic-upsert', topicId: id, attempts: jobs.get(key)?.attempts || 0 })
    return
  }
  if (kind === 'project') {
    const key = projectJobKey(id)
    if (saveConflictParked(key)) return
    const project = listStoredProjects().find((item) => item.id === id)
    jobs.set(key, {
      op: 'project-upsert',
      projectId: id,
      coursePath: project?.coursePath || row.courseKey?.replace(/^course:/, '') || '',
      attempts: jobs.get(key)?.attempts || 0
    })
    return
  }
  if (kind === 'intent') {
    jobs.set('intent:playlist-intent', {
      op: 'intent-upsert',
      attempts: jobs.get('intent:playlist-intent')?.attempts || 0
    })
  }
}

function queueLocalRowDrift() {
  for (const finding of readFindingList()) {
    if (finding.notion?.conflict || saveConflictParked(finding.id)) continue
    const hash = localNoteHash(finding)
    if (
      finding.notion?.ackedHash !== hash ||
      (finding.notion?.wire || 0) < 2 ||
      filesNeedFetch(finding.notion)
    ) {
      const pending = jobs.get(finding.id)
      jobs.set(finding.id, {
        op: 'upsert',
        remote: Boolean(pending?.remote),
        attempts: pending?.attempts || 0
      })
    }
  }
  for (const playlist of listPlaylistRecords()) {
    if (playlist.notion?.conflict) continue
    const key = playlistKey(playlist.id)
    if (saveConflictParked(key)) continue
    const wire = playlistWire(playlist)
    if (
      playlist.notion?.ackedHash !== wireHash(wire.title, wire.body) ||
      !playlist.notion?.pageId
    ) {
      const pending = jobs.get(key)
      jobs.set(key, {
        op: 'playlist-upsert',
        playlistId: playlist.id,
        attempts: pending?.attempts || 0
      })
    }
  }
  for (const course of listCourseProgressRecords()) {
    if (course.notion?.conflict) continue
    const key = progressKey(course.id)
    if (saveConflictParked(key)) continue
    const local = localProgress(course.id)
    const hash = progressSyncHash(course.id, local)
    const missing = !course.notion?.pageId && !progressIsEmpty(local)
    if (
      (course.notion?.ackedHash && course.notion.ackedHash !== hash) ||
      missing ||
      (!course.notion?.ackedHash && !progressIsEmpty(local))
    ) {
      const pending = jobs.get(key)
      jobs.set(key, {
        op: 'progress-upsert',
        coursePath: course.id,
        remote: Boolean(pending?.remote),
        attempts: pending?.attempts || 0
      })
    }
  }
  for (const topic of listTopics()) {
    if (topic.notion?.conflict) continue
    const key = topicKey(topic.id)
    if (saveConflictParked(key)) continue
    const wire = topicWire(topic)
    if (topic.notion?.ackedHash !== wireHash(wire.title, wire.body)) {
      jobs.set(key, {
        op: 'topic-upsert',
        topicId: topic.id,
        attempts: jobs.get(key)?.attempts || 0
      })
    }
  }
  for (const project of listStoredProjects()) {
    if (project.notion?.conflict) continue
    const key = projectJobKey(project.id)
    if (saveConflictParked(key)) continue
    const wire = projectWire(project)
    if (project.notion?.ackedHash !== wireHash(wire.title, wire.body)) {
      jobs.set(key, {
        op: 'project-upsert',
        projectId: project.id,
        coursePath: project.coursePath,
        attempts: jobs.get(key)?.attempts || 0
      })
    }
  }
  const intent = readPlaylistIntentRecord()
  if (intent && !intent.notion?.conflict) {
    const wire = intentWire(intent)
    const hash = wireHash(wire.title, wire.body)
    if ((intent.goal || intent.interests?.length) && intent.notion?.ackedHash !== hash) {
      jobs.set('intent:playlist-intent', {
        op: 'intent-upsert',
        attempts: jobs.get('intent:playlist-intent')?.attempts || 0
      })
    }
  }
  for (const tomb of readState().topicTombstones || []) {
    if (tomb.conflict) continue
    const key = topicKey(tomb.topicId)
    if (!saveConflictParked(key)) jobs.set(key, { op: 'topic-delete', topicId: tomb.topicId })
  }
  for (const tomb of readState().projectTombstones || []) {
    if (tomb.conflict) continue
    const key = projectJobKey(tomb.projectId)
    if (!saveConflictParked(key)) {
      jobs.set(key, {
        op: 'project-delete',
        projectId: tomb.projectId,
        coursePath: tomb.coursePath || ''
      })
    }
  }
}

function parkedIdentity(row) {
  return {
    pageId: row.pageId,
    kind: row.kind || '',
    externalId: row.externalId || row.findingId || row.playlistId || row.progressId || '',
    findingId: row.findingId || '',
    playlistId: row.playlistId || '',
    progressId: row.progressId || '',
    courseKey: row.courseKey || '',
    editedAt: row.editedAt || ''
  }
}

function jobIdForRow(row) {
  const kind =
    row?.kind ||
    (row?.playlistId ? 'playlist' : row?.progressId ? 'progress' : row?.findingId ? 'note' : '')
  const id = row?.externalId || row?.findingId || row?.playlistId || row?.progressId || ''
  if (kind === 'note') return id
  if (kind === 'playlist') return playlistKey(id)
  if (kind === 'progress') return progressKey(id)
  if (kind === 'topic') return topicKey(id)
  if (kind === 'project') return projectJobKey(id)
  if (kind === 'intent') return 'intent:playlist-intent'
  return ''
}

function rememberParked(row, parked, seen) {
  if (!row?.pageId || seen.has(row.pageId)) return
  const kind =
    row.kind ||
    (row.playlistId ? 'playlist' : row.progressId ? 'progress' : row.findingId ? 'note' : '')
  if (!kind || kind === 'course' || kind === 'file') return
  if (row.editedAt && row.editedAt === rowCursorEdited({ ...row, kind })) return
  seen.add(row.pageId)
  enqueueChangedRow({ ...row, kind })
  parked.push(parkedIdentity({ ...row, kind }))
}

async function queueRowPoll(client) {
  const startedAt = new Date().toISOString()
  const state = readState()
  const watermark = state.pollWatermark || ''
  notePrepare(watermark ? 'Revisando cambios…' : 'Leyendo la base…')
  let changed = null
  try {
    changed = await client.listPages(watermark ? { editedAfter: watermark } : {})
    if (changed) notePrepare(`Revisando ${changed.length} páginas`)
  } catch (error) {
    noteFailure(error)
    return
  }
  const parked = []
  const seen = new Set()
  for (const row of changed || []) rememberParked(row, parked, seen)
  for (const item of state.parked || []) {
    if (!item?.pageId || seen.has(item.pageId)) continue
    let editedAt = item.editedAt || ''
    try {
      editedAt = (await client.pageEditedAt(item.pageId)) || ''
    } catch {
      parked.push(item)
      seen.add(item.pageId)
      continue
    }
    const cursor = rowCursorEdited({ ...item, editedAt })
    const jobId = jobIdForRow({ ...item, editedAt })
    if (
      editedAt &&
      editedAt === item.editedAt &&
      editedAt !== cursor &&
      (noteConflictIsCurrent(item.externalId || item.findingId, editedAt) ||
        jobs.has(jobId) ||
        saveConflictParked(jobId))
    ) {
      parked.push({ ...item, editedAt })
      seen.add(item.pageId)
      continue
    }
    rememberParked({ ...item, editedAt }, parked, seen)
  }
  if (localDriftGeneration !== driftedGeneration) {
    queueLocalRowDrift()
    driftedGeneration = localDriftGeneration
  }
  state.pollWatermark = startedAt
  state.parked = parked
  writeState(state)
}

async function queuePending() {
  if (!getNotionConfig().enabled) return
  queueDrawingUploads()
  queueImageUploads()
  notePrepare('Revisando Notion…')
  const client = clientFromConfig()
  try {
    await ensureRowSchema(client)
  } catch (error) {
    noteFailure(error)
    clearPrepare()
    publish()
    return
  }
  if (rowsReady()) {
    const probe = {
      at: new Date().toISOString(),
      error: null,
      recentCount: 0,
      recentOldest: null,
      recentComplete: true,
      skipped: 0,
      opened: 0,
      queued: []
    }
    const errorBefore = lastError
    lastProbe = probe
    try {
      await queueRowPoll(client)
    } catch (error) {
      noteFailure(error)
    }
    probe.error = lastError !== errorBefore ? lastError : null
    clearPrepare()
    publish()
    return
  }
  let remotePages = null
  let recent = { pages: [], complete: false }
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
  const recentById = new Map((recent.pages || []).map((page) => [notionPageKey(page.pageId), page]))
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
  const findings = readFindingList().filter((finding) => !finding.notion?.conflict)
  const courseTitles = readCourseTitleMap()
  const remoteByFinding = new Map()
  for (const page of remotePages || []) {
    if (page.findingId && !String(page.findingId).startsWith('node:')) {
      remoteByFinding.set(page.findingId, page)
    }
  }
  const rowIds = new Set((remotePages || []).map((page) => page.pageId))
  for (const finding of findings) {
    const localHash = wireHash(noteWire(finding).title, finding.body)
    const row = (remotePages || []).find((page) => page.pageId === finding.notion?.pageId)
    const remote =
      row ||
      recentById.get(notionPageKey(finding.notion?.pageId)) ||
      remoteByFinding.get(finding.id)
    const localChanged = !finding.notion?.ackedHash || finding.notion.ackedHash !== localHash
    const timeChanged = videoTimeNeedsSync(finding)
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
    if (localChanged || timeChanged || remoteChanged || needsPlace || missingHere) {
      const pending = jobs.get(finding.id)
      jobs.set(finding.id, { op: 'upsert', attempts: pending?.attempts || 0 })
      noteQueued(
        probe,
        finding.id,
        [
          localChanged ? 'local' : '',
          timeChanged ? 'tiempo' : '',
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
  progress: '✅',
  topic: '🏷️',
  project: '🎯',
  intent: '✨'
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
  if (rowsReady()) {
    if (playlist?.notion?.pageId) {
      const direct = await client.readPage(playlist.notion.pageId)
      if (direct && (direct.kind === 'playlist' || direct.playlistId === playlist.id)) return direct
    }
    const found = await client.findRow('playlist', playlist.id)
    if (!found?.pageId) return null
    return client.readPage(found.pageId)
  }
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
  if (rowsReady()) {
    return client.saveRow({
      kind: 'playlist',
      externalId: playlist.id,
      title: wire.title,
      body: wire.body,
      pageId: remote?.pageId || null,
      databaseRow: Boolean(remote?.pageId),
      childTitles: titles,
      emoji: PAGE_ICONS.playlist
    })
  }
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
      applyPlaylist(
        id,
        cursorFrom(remote, hash, listShapeExtra(remote, { pulledAt: Date.now() })),
        remote
      )
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
    writePlaylistTombstones(
      readPlaylistTombstones().filter((item) => item.playlistId !== playlistId)
    )
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
    notePrepare(known?.title ? `Listas · ${known.title}` : 'Listas', index + 1, children.length)
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
    notePrepare(page.title ? `Listas · ${page.title}` : 'Listas', index + 1, children.length)
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
  if (children.length) notePrepare('Listas', children.length, children.length)
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
      lastOpenedAt: course?.lastOpenedAt || 0,
      lastViewedAt: course?.lastViewedAt || 0,
      excitement: course?.excitement || 0,
      excitementAt: course?.excitementAt || 0
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

function withLocalPlayback(coursePath, data) {
  const course = readCourseProgressRecord(coursePath)
  const lessons = {}
  for (const [key, lesson] of Object.entries(data?.lessons || {})) {
    lessons[key] = {
      ...lesson,
      positionSec: course?.lessons?.[key]?.positionSec || lesson.positionSec || 0
    }
  }
  return {
    ...data,
    lessons,
    lastPositionSec: course?.lastPositionSec || data?.lastPositionSec || 0
  }
}

async function applyProgress(coursePath, data, notion) {
  const next = withLocalPlayback(coursePath, data)
  const course = readCourseProgressRecord(coursePath)
  const lastViewedAt = Math.max(Number(course?.lastViewedAt) || 0, Number(data?.lastViewedAt) || 0)
  writeCourseProgress(coursePath, {
    lessons: next.lessons,
    replaceLessons: true,
    lastLessonRelativePath: next.lastLessonRelativePath || null,
    lastLessonTitle: next.lastLessonTitle || null,
    lastPositionSec: next.lastPositionSec || 0,
    lastOpenedAt: next.lastOpenedAt || course?.lastOpenedAt || null,
    lastViewedAt: lastViewedAt || null,
    excitement: next.excitement || 0,
    excitementAt: next.excitementAt || null,
    inProcess: Boolean(next.inProcess),
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
  if (rowsReady()) {
    if (course?.notion?.pageId) {
      const direct = await client.readPage(course.notion.pageId)
      if (direct?.progressId || direct?.kind === 'progress') return direct
    }
    const found = await client.findRow('progress', course?.id)
    if (!found?.pageId) return null
    return client.readPage(found.pageId)
  }
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
  if (rowsReady()) {
    return client.saveRow({
      kind: 'progress',
      externalId: coursePath,
      courseKey: `course:${coursePath}`,
      title: courseTitle(coursePath),
      body: wire.body,
      inProcess: Boolean(data.inProcess),
      pageId: remote?.pageId || null,
      databaseRow: Boolean(remote?.pageId),
      emoji: PAGE_ICONS.progress
    })
  }
  const parentId = await ensureProgressSection(client)
  const title = courseTitle(coursePath)
  if (remote?.pageId) {
    const parent = await client.pageParent(remote.pageId)
    if (parent?.type === 'page_id' && parent.id === parentId) {
      return client.updatePage(
        remote.pageId,
        coursePath,
        title,
        wire.body,
        PAGE_ICONS.progress,
        'progress'
      )
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

async function reconcileProgress(client, coursePath, job = {}) {
  const course = readCourseProgressRecord(coursePath) || { id: coursePath }
  if (course.notion?.conflict) return
  const local = localProgress(coursePath)
  if (progressIsEmpty(local) && !course.notion?.pageId && !job.remote) return
  const localHash = progressSyncHash(coursePath, local)
  if (!job.remote && course.notion?.ackedHash === localHash) return
  const sectionId = course.notion?.pageId ? null : await ensureProgressSection(client)
  const remote = await loadProgressRemote(client, { ...course, id: coursePath }, sectionId)
  const remoteData = remote ? progressFromBody(remote.body) : null
  const action = decideSync({
    hasRemote: Boolean(remote && remoteData),
    localHash,
    remoteHash: remoteData ? progressSyncHash(coursePath, remoteData) : null,
    ackedHash: course.notion?.ackedHash || null
  })
  if ((action === 'create' || action === 'push') && progressIsEmpty(local) && !remote) return
  if (action === 'create' || action === 'push') {
    const page = await saveProgressPage(client, coursePath, local, remote)
    if (!page?.pageId) throw new Error('Notion no devolvió el progreso')
    writeCourseProgress(coursePath, {
      notion: cursorFrom(page, localHash)
    })
    return
  }
  if (!remoteData) return
  if (action === 'relink' && remote?.body && String(remote.body).includes('"positionSec"')) {
    const page = await saveProgressPage(client, coursePath, local, remote)
    writeCourseProgress(coursePath, { notion: cursorFrom(page || remote, localHash) })
    return
  }
  if (action === 'pull' || action === 'relink') {
    const hash = action === 'relink' ? localHash : progressSyncHash(coursePath, remoteData)
    await applyProgress(
      coursePath,
      remoteData,
      cursorFrom(remote, hash, action === 'pull' ? { pulledAt: Date.now() } : {})
    )
    return
  }
  const merged = mergeCourseProgress(local, remoteData)
  if (!merged) return
  if (local.inProcess === remoteData.inProcess) {
    const page = await saveProgressPage(client, coursePath, merged, remote)
    const hash = progressSyncHash(coursePath, merged)
    await applyProgress(coursePath, merged, cursorFrom(page || remote, hash))
    return
  }
  writeCourseProgress(coursePath, {
    lessons: merged.lessons,
    lastLessonRelativePath: merged.lastLessonRelativePath || null,
    lastLessonTitle: merged.lastLessonTitle || null,
    lastPositionSec: merged.lastPositionSec || 0,
    lastOpenedAt: merged.lastOpenedAt || null,
    lastViewedAt: merged.lastViewedAt || null,
    excitement: merged.excitement || 0,
    excitementAt: merged.excitementAt || null,
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
  publish(true)
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
    const localHash = progressSyncHash(coursePath, local)
    const remote = remoteById.get(coursePath)
    const acked = course?.notion?.ackedHash || ''
    const localChanged = Boolean(acked) && acked !== localHash
    const remoteChanged = Boolean(remote && remote.editedAt !== course?.notion?.remoteEditedAt)
    const missingPage = !remote && !progressIsEmpty(local)
    const adoptRemote = Boolean(remote) && !acked
    if (!localChanged && !remoteChanged && !missingPage && !adoptRemote) continue
    const pending = jobs.get(key)
    jobs.set(key, {
      op: 'progress-upsert',
      coursePath,
      remote: true,
      attempts: pending?.attempts || 0
    })
    noteQueued(
      lastProbe,
      key,
      adoptRemote
        ? 'sin cursor'
        : remoteChanged
          ? 'notion'
          : localChanged
            ? 'local'
            : 'falta la página'
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
    notifyProjects: nextHooks.notifyProjects || (() => {}),
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
  const pending = jobs.get(id)
  jobs.set(id, { op: 'upsert', remote: Boolean(pending?.remote), attempts: pending?.attempts || 0 })
  bumpLocalDrift()
  schedule(1200)
}

export function enqueueNotionDelete(finding) {
  if (!getNotionConfig().enabled || !finding?.id) return
  rememberDelete(finding)
  if (!finding.notion?.pageId) return
  jobs.set(finding.id, { op: 'delete' })
  bumpLocalDrift()
  schedule(1200)
}

export function enqueueNotionProgress(coursePath, { soon = false } = {}) {
  const keyName = path.basename(String(coursePath || ''))
  if (!keyName || !getNotionConfig().enabled) return
  const key = progressKey(keyName)
  conflictCooldown.delete(key)
  const course = readCourseProgressRecord(keyName)
  if (course?.notion?.conflict) return
  const hash = progressSyncHash(keyName, localProgress(keyName))
  if (course?.notion?.ackedHash === hash) return
  const pending = jobs.get(key)
  jobs.set(key, {
    op: 'progress-upsert',
    coursePath: keyName,
    remote: Boolean(pending?.remote),
    attempts: pending?.attempts || 0
  })
  bumpLocalDrift()
  if (soon || !timer) schedule(soon ? 1200 : 8000)
}

export function localProgressTrack(coursePath) {
  return progressTrackKey(localProgress(coursePath))
}

export function localProgressSyncKey(coursePath) {
  return progressSyncKey(localProgress(coursePath))
}

export function enqueueNotionPlaylistUpsert(id) {
  if (!id || !getNotionConfig().enabled) return
  const key = playlistKey(id)
  conflictCooldown.delete(key)
  if (jobs.get(key)?.op === 'playlist-delete') return
  const playlist = readPlaylist(id)
  if (!playlist || playlist.notion?.conflict) return
  const pending = jobs.get(key)
  jobs.set(key, {
    op: 'playlist-upsert',
    playlistId: id,
    remote: Boolean(pending?.remote),
    attempts: pending?.attempts || 0
  })
  bumpLocalDrift()
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

export function enqueueNotionTopicUpsert(id) {
  if (!id || !getNotionConfig().enabled) return
  const key = topicKey(id)
  conflictCooldown.delete(key)
  const topic = readTopic(id)
  if (!topic || topic.notion?.conflict) return
  jobs.set(key, { op: 'topic-upsert', topicId: id, attempts: jobs.get(key)?.attempts || 0 })
  bumpLocalDrift()
  schedule(1200)
}

export function enqueueNotionTopicDelete(topic) {
  if (!getNotionConfig().enabled || !topic?.id) return
  const key = topicKey(topic.id)
  rememberTopicDelete(topic)
  if (!topic.notion?.pageId) {
    jobs.delete(key)
    return
  }
  jobs.set(key, { op: 'topic-delete', topicId: topic.id })
  bumpLocalDrift()
  schedule(1200)
}

export function enqueueNotionProjectUpsert(coursePath, id) {
  const folder = path.basename(String(coursePath || ''))
  if (!id || !folder || !getNotionConfig().enabled) return
  const key = projectJobKey(id)
  conflictCooldown.delete(key)
  const project = readStoredProject(folder, id)
  if (!project || project.notion?.conflict) return
  const wire = projectWire(project)
  if (project.notion?.pageId && project.notion.ackedHash === wireHash(wire.title, wire.body)) return
  jobs.set(key, {
    op: 'project-upsert',
    projectId: id,
    coursePath: folder,
    attempts: jobs.get(key)?.attempts || 0
  })
  bumpLocalDrift()
  schedule(1200)
}

export function enqueueNotionProjectDelete(project) {
  if (!getNotionConfig().enabled || !project?.id) return
  const key = projectJobKey(project.id)
  rememberProjectDelete(project)
  if (!project.notion?.pageId) {
    jobs.delete(key)
    return
  }
  jobs.set(key, {
    op: 'project-delete',
    projectId: project.id,
    coursePath: project.coursePath || ''
  })
  bumpLocalDrift()
  schedule(1200)
}

export function enqueueNotionIntent() {
  if (!getNotionConfig().enabled) return
  const key = 'intent:playlist-intent'
  conflictCooldown.delete(key)
  const intent = readPlaylistIntentRecord()
  if (intent?.notion?.conflict) return
  jobs.set(key, { op: 'intent-upsert', attempts: jobs.get(key)?.attempts || 0 })
  bumpLocalDrift()
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
  bumpLocalDrift()
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
  const findings = readFindingList()
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
      `- ${clipDebug(noteWire(finding).title || finding.id)} | página ${finding.notion?.pageId || 'no'} | cursor ${finding.notion?.ackedHash ? 'sí' : 'no'} | editada ${finding.notion?.remoteEditedAt || '—'} | conflicto ${finding.notion?.conflict ? 'sí' : 'no'}`
    )
  }
  if (pendingNotes.length > 40)
    lines.push(`- y ${pendingNotes.length - 40} más sin cursor o en conflicto`)
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

  notionClient = null
  notionClientKey = ''
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
    notionClient = client
    notionClientKey = `${nextToken}\n${resolvedId}`
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
      applyNotion(
        findingId,
        noteCursor(remote, hash, remote.timeSec, { pulledAt: Date.now() }),
        remote,
        remote.timeSec
      )
      await syncNoteFiles(client, findingId, remote, remote.body)
    } else if (choice === 'both') {
      const remote = await loadRemote(client, finding)
      if (!remote) throw new Error('La página de Notion ya no está')
      await reconcileNoteFiles(client, remote.pageId, remote.body, { assets: remote.assets })
      const copy = withoutNoteWriteHook(() =>
        forkFinding(findingId, {
          title: normalizeTitle(remote.title) || null,
          body: remote.body || ''
        })
      )
      if (remote.timeSec !== undefined) {
        withoutNoteWriteHook(() => {
          mutateFinding(copy.id, (item) => {
            item.anchors = anchorsWithVideoTime(item.anchors, remote.timeSec)
            item.notion = { ...(item.notion || {}), videoTime: roundTimeSec(remote.timeSec) }
          })
        })
      }
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
        anchors:
          remote.timeSec !== undefined
            ? anchorsWithVideoTime(tomb.snapshot?.anchors, remote.timeSec)
            : tomb.snapshot?.anchors,
        notion: noteCursor(remote, hash, remote.timeSec, { pulledAt: Date.now() })
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
      const remote = await loadPlaylistRemote(client, playlist, await ensurePlaylistSection(client))
      if (!remote) throw new Error('La página de Notion ya no está')
      const parsed = playlistFromBody(remote.body)
      if (!parsed) throw new Error('La página de Notion ya no es una lista')
      const hash = wireHash(remote.title, remote.body)
      applyPlaylist(
        playlistId,
        cursorFrom(remote, hash, listShapeExtra(remote, { pulledAt: Date.now() })),
        remote
      )
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
      applyPlaylist(
        playlistId,
        cursorFrom(remote, hash, listShapeExtra(remote, { pulledAt: Date.now() })),
        remote
      )
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

async function pushProject(client, project) {
  const wire = projectWire(project)
  const localHash = wireHash(wire.title, wire.body)
  const remote = await loadKindPage(client, 'project', project.id, project.notion?.pageId)
  const folder = project.coursePath || ''
  const page = await client.saveRow({
    kind: 'project',
    externalId: project.id,
    parentExternalId: folder ? `course:${folder}` : '',
    courseKey: folder ? `course:${folder}` : '',
    title: wire.title,
    body: wire.body,
    status: wire.status,
    pageId: remote?.pageId || null,
    databaseRow: Boolean(remote?.pageId),
    emoji: PAGE_ICONS.project
  })
  if (!page?.pageId) throw new Error('Notion no devolvió la página')
  const hash = page.body === undefined ? localHash : wireHash(page.title, page.body)
  withoutNoteWriteHook(() => {
    upsertProject(folder, { id: project.id, notion: cursorFrom(page, hash) })
  })
}

function dropProjectTombstone(projectId) {
  const state = readState()
  state.projectTombstones = (state.projectTombstones || []).filter(
    (item) => item.projectId !== projectId
  )
  writeState(state)
}

export async function resolveNotionProjectConflict(projectId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const project = listStoredProjects().find((item) => item.id === projectId)
  if (!project?.notion?.conflict) throw new Error('Ese proyecto no está en conflicto')
  const client = clientFromConfig()
  return oneAtATime(async () => {
    await client.loadSchema()
    if (choice === 'local') {
      await pushProject(client, readStoredProject(project.coursePath, projectId) || project)
    } else if (choice === 'remote') {
      const remote = await loadKindPage(client, 'project', projectId, project.notion?.pageId)
      const parsed = remote ? projectFromBody(remote.body) : null
      if (!remote || !parsed) throw new Error('La página de Notion ya no es un proyecto')
      const hash = wireHash(remote.title, projectWire({ title: remote.title, ...parsed }).body)
      withoutNoteWriteHook(() => {
        upsertProject(project.coursePath, {
          id: projectId,
          title: remote.title,
          notes: parsed.notes,
          status: parsed.status,
          sectionId: parsed.sectionId || null,
          fileRelativePath: parsed.fileRelativePath || null,
          notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
        })
      })
      notifyProjects()
    } else {
      throw new Error('Elección desconocida')
    }
    publish()
    return publicStatus()
  })
}

export async function resolveNotionProjectDelete(projectId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const tomb = (readState().projectTombstones || []).find((item) => item.projectId === projectId)
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
      const parsed = projectFromBody(remote.body)
      if (!parsed) throw new Error('La página de Notion ya no es un proyecto')
      const hash = wireHash(remote.title, projectWire({ title: remote.title, ...parsed }).body)
      withoutNoteWriteHook(() => {
        restoreProject(tomb.coursePath, {
          id: projectId,
          title: remote.title || tomb.snapshot?.title || 'Proyecto',
          notes: parsed.notes,
          status: parsed.status,
          sectionId: parsed.sectionId || tomb.snapshot?.sectionId || null,
          fileRelativePath: parsed.fileRelativePath || tomb.snapshot?.fileRelativePath || null,
          linkedFolderPath: tomb.snapshot?.linkedFolderPath || null,
          notion: cursorFrom(remote, hash, { pulledAt: Date.now() })
        })
      })
      notifyProjects()
    } else {
      throw new Error('Elección desconocida')
    }
    dropProjectTombstone(projectId)
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
    const hash = progressSyncHash(keyName, next)
    await applyProgress(keyName, next, cursorFrom(page || remote, hash))
    publish()
    return publicStatus()
  })
}
