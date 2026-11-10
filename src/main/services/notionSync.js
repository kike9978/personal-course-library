import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getNotionConfig, setNotionConfig } from './config.js'
import { readCourseTitleMap } from './courses.js'
import { createNotionClient } from './notionClient.js'
import {
  forkFinding,
  listFindingRecords,
  mutateFinding,
  readFinding,
  restoreFinding,
  withoutNoteWriteHook
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
  notionPlace,
  wireHash
} from '../../shared/notionSync.js'

const STATE_FILE = 'notion-sync.json'

let jobs = new Map()
const sharedIdsConfirmed = new Set()
const sharedFileInfo = new Map()
let timer = null
let pollTimer = null
let remoteCheck = null
let draining = null
let syncing = false
let lastError = null
let hooks = {
  notifyNotes() {},
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
      nodes: data.nodes && typeof data.nodes === 'object' ? data.nodes : {}
    }
  } catch {
    return { tombstones: [], nodes: {} }
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
        nodes: state.nodes || {}
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

function describeError(error) {
  return notionErrorMessage({
    status: error?.status,
    code: error?.code,
    message: error?.message
  })
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
          coursePath: finding.anchors?.[0]?.coursePath || null
        }))
    : []
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
    lastError,
    queued: jobs.size,
    conflicts,
    deleteConflicts
  }
}

function publish() {
  hooks.notifyStatus(publicStatus())
}

function notifyNotes() {
  hooks.notifyNotes()
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
  return page
}

async function placeExisting(client, finding, remote) {
  const parentId = await ensurePlace(client, finding)
  const parent = await client.pageParent(remote.pageId)
  if (parent?.type === 'page_id' && parent.id === parentId) {
    await retireFlatCopies(client, finding.id, remote.pageId)
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
    draining = drain().finally(() => {
      draining = null
    })
  }
  return draining
}

async function drain() {
  if (!getNotionConfig().enabled) {
    jobs.clear()
    publish()
    return
  }
  if (!jobs.size) return
  const batch = new Map(jobs)
  jobs.clear()
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
        if (job.op === 'delete') await reconcileDelete(client, id)
        else await reconcileUpsert(client, id)
        lastError = null
      } catch (error) {
        lastError = describeError(error)
        if (job.op !== 'delete') rememberError(id, lastError)
        if (isRetryableNotionError(error)) {
          jobs.set(id, job)
          retryDelay = Math.max(retryDelay, error.status === 429 ? 5000 : 15000)
        }
        notifyNotes()
      }
    }
  } catch (error) {
    lastError = describeError(error)
    for (const [id, job] of batch) jobs.set(id, job)
    retryDelay = 30000
  } finally {
    syncing = false
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

async function takeSharedNote(client, pageId, place, seen) {
  if (!pageId || seen.has(pageId)) return false
  const anchor = anchorFromNotion({
    courseMarker: place.courseMarker,
    fileMarker: place.fileMarker,
    fileTitle: place.fileTitle,
    filePageId: place.filePageId
  })
  const known = listFindingRecords().find((finding) => finding.notion?.pageId === pageId)
  if (
    known &&
    sharedIdsConfirmed.has(pageId) &&
    place.editedAt &&
    known.notion?.remoteEditedAt === place.editedAt &&
    !shouldRetarget(known, anchor)
  ) {
    seen.add(pageId)
    return false
  }
  seen.add(pageId)
  const page = await client.readPage(pageId)
  if (!page) return false
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
      jobs.set(existing.id, { op: 'upsert' })
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

async function importSharedNotes(client, rows) {
  let changed = false
  const seen = new Set()
  for (const row of rows || []) {
    const courseMarker = String(row.nodeMarker || '')
    if (!courseMarker.startsWith('node:')) {
      if (row.findingId && !String(row.findingId).startsWith('node:')) {
        changed =
          (await takeSharedNote(client, row.pageId, { editedAt: row.editedAt }, seen)) || changed
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
            seen
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
              seen
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
            seen
          )) || changed
      }
    }
  }
  if (changed) notifyNotes()
}

async function queuePending() {
  if (!getNotionConfig().enabled) return
  let remotePages = null
  let recent = []
  const client = clientFromConfig()
  try {
    remotePages = await client.listPages()
  } catch (error) {
    lastError = describeError(error)
  }
  try {
    recent = await client.recentPages()
  } catch {
    recent = []
  }
  if (remotePages) {
    try {
      await paintIcons(client, remotePages)
    } catch {
      // The next pass sets any icon that did not land.
    }
    try {
      await importSharedNotes(client, remotePages)
    } catch (error) {
      lastError = describeError(error)
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
  const recentById = new Map(recent.map((page) => [page.pageId, page]))
  const rowIds = new Set((remotePages || []).map((page) => page.pageId))
  for (const finding of findings) {
    const localHash = wireHash(finding.title, finding.body)
    const row = (remotePages || []).find((page) => page.pageId === finding.notion?.pageId)
    const remote =
      row || recentById.get(finding.notion?.pageId) || remoteByFinding.get(finding.id)
    const localChanged = !finding.notion?.ackedHash || finding.notion.ackedHash !== localHash
    const remoteChanged = Boolean(
      remote?.editedAt && remote.editedAt !== finding.notion?.remoteEditedAt
    )
    const place = notionPlace(finding, courseTitles)
    const canPlace = Boolean(place.fileKey) || place.courseKey !== 'course:__loose__'
    const needsPlace = Boolean(row && row.parentType !== 'page_id' && canPlace)
    const missingHere =
      Array.isArray(remotePages) &&
      Boolean(finding.notion?.pageId) &&
      !row &&
      !(await pageBelongsToRows(client, finding.notion.pageId, rowIds))
    if (localChanged || remoteChanged || needsPlace || missingHere) {
      jobs.set(finding.id, { op: 'upsert' })
    }
  }
  for (const tomb of readTombstones()) {
    if (tomb.conflict) continue
    const remote = remoteByFinding.get(tomb.findingId)
    const remoteChanged =
      !remotePages || !remote || remote.editedAt !== tomb.snapshot?.notion?.remoteEditedAt
    if (remoteChanged) jobs.set(tomb.findingId, { op: 'delete' })
  }
}

const PAGE_ICONS = {
  course: '📚',
  file: '📄',
  note: '📝'
}

let iconsPainted = false

async function paintIcons(client, rows) {
  if (iconsPainted) return
  const fileIds = new Set(Object.values(readNodes()))
  for (const row of rows) {
    if (!String(row.nodeMarker || '').startsWith('node:')) continue
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
  remoteCheck = queuePending().finally(() => {
    remoteCheck = null
    if (jobs.size) schedule(0)
  })
  return remoteCheck
}

export function startNotionSync(nextHooks = {}) {
  hooks = {
    notifyNotes: nextHooks.notifyNotes || (() => {}),
    notifyStatus: nextHooks.notifyStatus || (() => {})
  }
  const enabled = getNotionConfig().enabled
  setRemoteWatch(enabled)
  if (enabled) void pollNotionChanges()
}

export function enqueueNotionUpsert(id) {
  if (!id || !getNotionConfig().enabled) return
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

export function getNotionSyncStatus() {
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
    setRemoteWatch(false)
    lastError = null
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
    lastError = describeError(error)
    publish()
    throw new Error(lastError)
  }

  lastError = null
  setRemoteWatch(true)
  await queuePending()
  schedule(0)
  publish()
  return publicStatus()
}

export async function syncNotionNow(findingId) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  if (findingId) {
    const finding = readFinding(findingId)
    if (finding?.notion?.conflict) {
      throw new Error('Esa anotación está en conflicto. Elige una versión antes de sincronizar.')
    }
    jobs.set(findingId, { op: 'upsert' })
  } else {
    await queuePending()
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
}

export async function resolveNotionDelete(findingId, choice) {
  if (!getNotionConfig().enabled) throw new Error('La sincronización con Notion está apagada')
  await flushQueued()
  const tomb = readTombstones().find((item) => item.findingId === findingId)
  if (!tomb?.conflict) throw new Error('Ese borrado no está en conflicto')
  const client = clientFromConfig()
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
}
