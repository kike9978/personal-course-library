import {
  anchorsFromText,
  blocksToBody,
  bodyToBlocks,
  playlistBlocks,
  playlistBodyFromBlocks,
  playlistIsLegacy,
  chunkRichText,
  findingIdFromBlocks,
  timeSecFromBlocks,
  playlistIdFromBlocks,
  progressIdFromBlocks,
  fileNameFromCaption,
  markerBlocks,
  markerFromBlocks,
  noteAssetsFromBlocks,
  normalizeBody,
  normalizeTitle,
  plainRichText,
  topicIdsFromText
} from '../../shared/notionSync.js'

const KIND_OPTIONS = [
  'course',
  'file',
  'note',
  'playlist',
  'progress',
  'topic',
  'project',
  'intent',
  'source'
]
// inbox / kept / archived are the states of a saved link (Fuentes).
const STATUS_OPTIONS = ['todo', 'in_progress', 'paused', 'done', 'inbox', 'kept', 'archived']

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])

// Newest first. Notion requires a version on every request and only publishes a
// new date when a change would break older clients. The previous date keeps
// working, so a version this app has not learned yet does not stop sync.
const KNOWN_VERSIONS = ['2026-03-11', '2025-09-03']

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

export function createNotionClient({
  token,
  databaseId,
  candidateIds,
  fetchImpl = global.fetch,
  sleepImpl = sleep
}) {
  if (!token) throw new Error('Falta el token de Notion')
  const candidates = (
    Array.isArray(candidateIds) && candidateIds.length ? candidateIds : databaseId ? [databaseId] : []
  ).filter(Boolean)
  if (!candidates.length) throw new Error('Falta la base de Notion')

  let schema = null
  let apiVersion = null
  let acceptedId = databaseId || candidates[0] || ''

  async function request(
    pathname,
    { method = 'GET', body, attempt = 0, conflictAttempt = 0, version = apiVersion } = {}
  ) {
    if (!version) throw new Error('Falta la versión de la API de Notion')
    let response
    const timeout = new AbortController()
    const timeoutId = setTimeout(() => timeout.abort(), 20000)
    try {
      response = await fetchImpl(`https://api.notion.com/v1${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': version,
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal
      })
    } catch (error) {
      const aborted = error?.name === 'AbortError'
      const wrapped = new Error(
        aborted ? 'Notion no respondió a tiempo' : error?.message || 'No se pudo hablar con Notion'
      )
      wrapped.status = 0
      throw wrapped
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleepImpl(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000)
      return request(pathname, { method, body, attempt: attempt + 1, conflictAttempt, version })
    }

    const data = await readJson(response)
    if (!response.ok) {
      // Notion returns this when two saves land on the same page. The same request is safe to repeat.
      if ((response.status === 409 || data.code === 'conflict_error') && conflictAttempt < 3) {
        await sleepImpl(400 * 2 ** conflictAttempt)
        return request(pathname, {
          method,
          body,
          attempt,
          conflictAttempt: conflictAttempt + 1,
          version
        })
      }
      const error = new Error(data.message || `Notion respondió ${response.status}`)
      error.status = response.status
      error.code = data.code
      throw error
    }
    return data
  }

  function keepsTryingVersion(error) {
    return error?.status === 400
  }

  async function useCurrentVersion() {
    if (apiVersion) return apiVersion
    let lastError = null
    for (const candidate of KNOWN_VERSIONS) {
      try {
        await request('/users/me', { version: candidate })
        apiVersion = candidate
        return apiVersion
      } catch (error) {
        if (!keepsTryingVersion(error)) throw error
        lastError = error
      }
    }
    throw lastError || new Error('Notion no acepta ninguna versión de la API que esta app conoce')
  }

  function isMissing(error) {
    return error?.status === 404 || error?.code === 'object_not_found'
  }

  async function sharedDataSourceIds() {
    try {
      const data = await request('/search', {
        method: 'POST',
        body: { page_size: 20, sort: { direction: 'descending', timestamp: 'last_edited_time' } }
      })
      return (data.results || [])
        .filter((item) => item?.object === 'data_source' && item.id)
        .map((item) => item.id)
    } catch {
      return []
    }
  }

  async function lookupDataSource(id) {
    try {
      const database = await request(`/databases/${id}`)
      const source = (database.data_sources || []).find((item) => item?.id)
      if (source?.id) return source.id
      if (database.properties) return id
    } catch (error) {
      if (!isMissing(error)) throw error
    }

    try {
      const source = await request(`/data_sources/${id}`)
      if (source?.object === 'data_source' && source.id) return source.id
    } catch (error) {
      if (!isMissing(error)) throw error
    }

    try {
      const children = await listChildren(id)
      const child = children.find((block) => block.type === 'child_database' && block.id)
      if (!child) return null
      const nested = await request(`/databases/${child.id}`)
      const nestedSource = (nested.data_sources || []).find((item) => item?.id)
      return nestedSource?.id || null
    } catch (error) {
      if (!isMissing(error)) throw error
      return null
    }
  }

  async function resolveDataSourceId() {
    for (const id of candidates) {
      const sourceId = await lookupDataSource(id)
      if (sourceId) {
        acceptedId = id
        return sourceId
      }
    }
    const sources = await sharedDataSourceIds()
    if (sources.length === 1) {
      acceptedId = sources[0]
      return acceptedId
    }
    const missing = new Error(
      'Notion no encuentra esa base. Ábrela, elige ··· → Conexiones y añade la integración.'
    )
    missing.status = 404
    missing.code = 'object_not_found'
    throw missing
  }

  function selectOptions(names) {
    return names.map((name) => ({ name }))
  }

  async function loadSchema() {
    if (schema) return schema
    await useCurrentVersion()
    const dataSourceId = await resolveDataSourceId()
    const source = await request(`/data_sources/${dataSourceId}`)
    const found = {}
    let titleName = null
    for (const [name, property] of Object.entries(source.properties || {})) {
      if (property?.type === 'title') titleName = name
      found[name] = property?.type || ''
    }
    if (!titleName) throw new Error('La base de Notion no tiene una propiedad de título')
    const properties = {}
    const expect = {
      Finding: 'rich_text',
      Nodo: 'rich_text',
      Kind: 'select',
      Id: 'rich_text',
      Parent: 'rich_text',
      Course: 'rich_text',
      Seconds: 'number',
      'In progress': 'checkbox',
      Color: 'rich_text',
      Status: 'select',
      Anchors: 'rich_text',
      'Topic ids': 'rich_text',
      URL: 'url'
    }
    for (const [name, type] of Object.entries(expect)) {
      if (found[name] === type) continue
      if (type === 'rich_text') properties[name] = { rich_text: {} }
      else if (type === 'number') properties[name] = { number: { format: 'number' } }
      else if (type === 'checkbox') properties[name] = { checkbox: {} }
      else if (type === 'url') properties[name] = { url: {} }
      else if (name === 'Kind') properties[name] = { select: { options: selectOptions(KIND_OPTIONS) } }
      else if (name === 'Status') properties[name] = { select: { options: selectOptions(STATUS_OPTIONS) } }
    }
    if (Object.keys(properties).length) {
      await request(`/data_sources/${dataSourceId}`, {
        method: 'PATCH',
        body: { properties }
      })
    }
    schema = {
      titleName,
      findingName: 'Finding',
      nodeName: 'Nodo',
      kindName: 'Kind',
      idName: 'Id',
      parentName: 'Parent',
      courseName: 'Course',
      secondsName: 'Seconds',
      inProcessName: 'In progress',
      colorName: 'Color',
      statusName: 'Status',
      anchorsName: 'Anchors',
      topicIdsName: 'Topic ids',
      urlName: 'URL',
      dataSourceId
    }
    return schema
  }

  function richProperty(value) {
    const text = String(value ?? '')
    if (!text) return { rich_text: [] }
    return { rich_text: chunkRichText(text) }
  }

  function propertiesFor(names, findingId, title, extra = null) {
    const properties = {
      [names.titleName]: { title: chunkRichText(normalizeTitle(title)) },
      [names.findingName]: { rich_text: chunkRichText(String(findingId || '')) }
    }
    if (!extra) return properties
    return { ...properties, ...rowProperties(names, { ...extra, title, externalId: extra.externalId || findingId }) }
  }

  function rowProperties(names, row) {
    const seconds = row.seconds == null || row.seconds === '' ? null : Number(row.seconds)
    return {
      [names.titleName]: { title: chunkRichText(normalizeTitle(row.title)) },
      [names.kindName]: { select: row.kind ? { name: row.kind } : null },
      [names.idName]: richProperty(row.externalId),
      [names.parentName]: richProperty(row.parentExternalId),
      [names.courseName]: richProperty(row.courseKey),
      [names.secondsName]: { number: Number.isFinite(seconds) ? seconds : null },
      [names.inProcessName]: { checkbox: Boolean(row.inProcess) },
      [names.colorName]: richProperty(row.color),
      [names.statusName]: { select: row.status ? { name: row.status } : null },
      [names.anchorsName]: richProperty(row.anchorsText),
      [names.topicIdsName]: richProperty(row.topicIdsText),
      ...(row.kind === 'note' && names.findingName
        ? { [names.findingName]: { rich_text: chunkRichText(String(row.externalId || '')) } }
        : {}),
      ...(row.kind === 'source' && names.urlName
        ? { [names.urlName]: { url: row.url ? String(row.url) : null } }
        : {}),
      ...(row.nodeMarker && names.nodeName
        ? { [names.nodeName]: { rich_text: chunkRichText(String(row.nodeMarker)) } }
        : {})
    }
  }

  function selectValue(property) {
    return property?.select?.name || ''
  }

  function rowFields(page, names) {
    const props = page?.properties || {}
    const seconds = props[names.secondsName]?.number
    return {
      kind: selectValue(props[names.kindName]),
      externalId: plainRichText(props[names.idName]?.rich_text).trim(),
      parentExternalId: plainRichText(props[names.parentName]?.rich_text).trim(),
      courseKey: plainRichText(props[names.courseName]?.rich_text).trim(),
      seconds: typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : null,
      inProcess: props[names.inProcessName]?.checkbox === true,
      color: plainRichText(props[names.colorName]?.rich_text).trim(),
      status: selectValue(props[names.statusName]),
      anchors: anchorsFromText(plainRichText(props[names.anchorsName]?.rich_text)),
      topicIds: topicIdsFromText(plainRichText(props[names.topicIdsName]?.rich_text)),
      url: names.urlName ? String(props[names.urlName]?.url || '') : ''
    }
  }

  function pageTitle(page, titleName) {
    const named = plainRichText(page?.properties?.[titleName]?.title)
    if (String(named || '').trim()) return normalizeTitle(named)
    return normalizeTitle(plainRichText(page?.properties?.title?.title))
  }

  function pageSummary(page, titleName) {
    if (!page) return null
    return {
      pageId: page.id,
      title: pageTitle(page, titleName),
      editedAt: page.last_edited_time || null,
      archived: page.archived === true || page.in_trash === true,
      icon: page.icon?.type === 'emoji' ? page.icon.emoji : null
    }
  }

  function advanceCursor(data, seen) {
    const cursor = data?.has_more ? data.next_cursor || '' : ''
    if (!cursor || seen.has(cursor)) return ''
    seen.add(cursor)
    return cursor
  }

  async function listChildren(blockId) {
    const blocks = []
    const seen = new Set()
    let cursor = ''
    do {
      const query = new URLSearchParams({ page_size: '100' })
      if (cursor) query.set('start_cursor', cursor)
      const data = await request(`/blocks/${blockId}/children?${query}`)
      blocks.push(...(data.results || []))
      cursor = advanceCursor(data, seen)
    } while (cursor)
    return blocks
  }

  async function listPages({ editedAfter } = {}) {
    const names = await loadSchema()
    const pages = []
    const seen = new Set()
    let cursor = ''
    do {
      const data = await request(`/data_sources/${names.dataSourceId}/query`, {
        method: 'POST',
        body: {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(editedAfter
            ? {
                filter: {
                  timestamp: 'last_edited_time',
                  last_edited_time: { on_or_after: editedAfter }
                }
              }
            : {})
        }
      })
      for (const page of data.results || []) {
        if (page.archived || page.in_trash) continue
        const fields = rowFields(page, names)
        pages.push({
          pageId: page.id,
          title: pageTitle(page, names.titleName),
          findingId: plainRichText(page.properties?.[names.findingName]?.rich_text).trim(),
          nodeMarker: plainRichText(page.properties?.[names.nodeName]?.rich_text).trim(),
          parentType: page.parent?.type || '',
          editedAt: page.last_edited_time || null,
          ...fields,
          timeSec: fields.seconds
        })
      }
      cursor = advanceCursor(data, seen)
    } while (cursor)
    return pages
  }

  async function listRows(kind, externalId) {
    const names = await loadSchema()
    const id = String(externalId || '')
    if (!id) return []
    const filters = [{ property: names.idName, rich_text: { equals: id } }]
    if (kind) filters.push({ property: names.kindName, select: { equals: kind } })
    let data
    try {
      data = await request(`/data_sources/${names.dataSourceId}/query`, {
        method: 'POST',
        body: {
          page_size: 25,
          filter: filters.length === 1 ? filters[0] : { and: filters }
        }
      })
    } catch (error) {
      // Filtering on a Kind no row has used yet is a validation error, not "no rows".
      // The option appears when the first row of that kind is written.
      if (kind && error?.status === 400 && /select option .* not found/i.test(error?.message || '')) {
        return []
      }
      throw error
    }
    return (data.results || [])
      .filter((item) => !item.archived && !item.in_trash)
      .map((page) => ({
        pageId: page.id,
        editedAt: page.last_edited_time || null,
        ...rowFields(page, names)
      }))
  }

  async function findRow(kind, externalId) {
    const rows = await listRows(kind, externalId)
    return rows[0] || null
  }

  async function findPage(findingId) {
    const names = await loadSchema()
    const data = await request(`/data_sources/${names.dataSourceId}/query`, {
      method: 'POST',
      body: {
        page_size: 5,
        filter: {
          property: names.findingName,
          rich_text: { equals: String(findingId || '') }
        }
      }
    })
    const page = (data.results || []).find((item) => !item.archived && !item.in_trash)
    return pageSummary(page, names.titleName)
  }

  async function readPage(pageId) {
    const names = await loadSchema()
    try {
      const page = await request(`/pages/${pageId}`)
      const summary = pageSummary(page, names.titleName)
      if (!summary || summary.archived) return null
      const blocks = await listChildren(pageId)
      const fromProperty = plainRichText(page.properties?.[names.findingName]?.rich_text).trim()
      const fields = rowFields(page, names)
      const playlistId =
        fields.kind === 'playlist'
          ? fields.externalId || playlistIdFromBlocks(blocks)
          : playlistIdFromBlocks(blocks)
      const progressId =
        fields.kind === 'progress'
          ? fields.externalId || progressIdFromBlocks(blocks)
          : progressIdFromBlocks(blocks)
      const blockTime = timeSecFromBlocks(blocks)
      return {
        ...summary,
        parentType: page.parent?.type || '',
        body: playlistId ? playlistBodyFromBlocks(blocks) : blocksToBody(blocks),
        findingId:
          fields.kind === 'note'
            ? fields.externalId || findingIdFromBlocks(blocks) || fromProperty
            : findingIdFromBlocks(blocks) || fromProperty,
        timeSec: fields.seconds != null ? fields.seconds : blockTime,
        playlistId,
        playlistLegacy: playlistId ? playlistIsLegacy(blocks) : false,
        progressId,
        marker: markerFromBlocks(blocks),
        assets: noteAssetsFromBlocks(blocks),
        ...fields
      }
    } catch (error) {
      if (error.status === 404 || error.code === 'object_not_found') return null
      throw error
    }
  }

  function keepsBlock(block) {
    if (block.type === 'child_page' || block.archived || block.in_trash) return true
    return Boolean(fileNameFromCaption(plainRichText(block[block.type]?.caption)))
  }

  async function replaceContent(pageId, children) {
    const existing = await listChildren(pageId)
    for (const block of existing) {
      if (keepsBlock(block)) continue
      await request(`/blocks/${block.id}`, { method: 'DELETE' })
    }
    await appendChildren(pageId, children)
  }

  async function appendChildren(blockId, children) {
    for (let index = 0; index < children.length; index += 100) {
      await request(`/blocks/${blockId}/children`, {
        method: 'PATCH',
        body: { children: children.slice(index, index + 100) }
      })
    }
  }

  function pageChildren(body, findingId, kind, childTitles, timeSec) {
    if (kind === 'playlist') return playlistBlocks(body, findingId, childTitles)
    if (kind === 'source') {
      return [...bodyToBlocks(body, findingId, kind, timeSec), ...sourceLinkBlocks(body)]
    }
    return bodyToBlocks(body, findingId, kind, timeSec)
  }

  /**
   * A playable video or a bookmark under a link's data, so the page is useful in Notion.
   * These blocks carry no text, so they never change the synced body.
   */
  function sourceLinkBlocks(body) {
    let url = ''
    let kind = ''
    try {
      const data = JSON.parse(String(body || ''))
      url = String(data?.url || '')
      kind = String(data?.kind || '')
    } catch {
      return []
    }
    if (!/^https?:\/\//i.test(url)) return []
    if (kind === 'youtube') {
      return [{ object: 'block', type: 'video', video: { type: 'external', external: { url } } }]
    }
    return [{ object: 'block', type: 'bookmark', bookmark: { url } }]
  }

  function contentBlocks(existing) {
    return (existing || []).filter((block) => block?.type !== 'child_page' && !keepsBlock(block))
  }

  async function writeBody(pageId, body, findingId, kind = 'finding', childTitles = null, timeSec = undefined) {
    const existing = await listChildren(pageId)
    const stamped =
      kind === 'playlist'
        ? playlistIdFromBlocks(existing)
        : kind === 'progress'
          ? progressIdFromBlocks(existing)
          : findingIdFromBlocks(existing)
    const time =
      kind === 'finding' ? (timeSec !== undefined ? timeSec : timeSecFromBlocks(existing)) : undefined
    const children = pageChildren(body, stamped || findingId || null, kind, childTitles, time)
    const current = contentBlocks(existing)
    const canPatch =
      kind !== 'playlist' &&
      children.length === 1 &&
      children[0].type === 'code' &&
      current.length === 1 &&
      current[0].type === 'code' &&
      current[0].id
    if (canPatch) {
      const patched = await request(`/blocks/${current[0].id}`, {
        method: 'PATCH',
        body: { code: children[0].code }
      })
      return { patched: true, editedAt: patched?.last_edited_time || null }
    }
    await replaceContent(pageId, children)
    return { patched: false, editedAt: null }
  }

  async function writeMarker(pageId, marker) {
    await replaceContent(pageId, markerBlocks(marker))
  }

  function pageTitleProperties(title, inDatabase, names) {
    const rich = chunkRichText(normalizeTitle(title))
    if (!inDatabase) return { title: { title: rich } }
    return { [names.titleName]: { title: rich } }
  }

  function emojiIcon(emoji) {
    return emoji ? { type: 'emoji', emoji } : undefined
  }

  async function createPage(
    findingId,
    title,
    body,
    parentPageId = null,
    emoji = null,
    marker = null,
    kind = 'finding',
    childTitles = null,
    timeSec = undefined
  ) {
    const names = await loadSchema()
    const inDatabase = !parentPageId
    const children = marker
      ? markerBlocks(marker)
      : pageChildren(body, findingId, kind, childTitles, inDatabase ? undefined : timeSec)
    const first = children.slice(0, 100)
    const rest = children.slice(100)
    const icon = emojiIcon(emoji)
    const rowKind = kind === 'playlist' ? 'playlist' : kind === 'progress' ? 'progress' : 'note'
    const page = await request('/pages', {
      method: 'POST',
      body: {
        parent: inDatabase
          ? { type: 'data_source_id', data_source_id: names.dataSourceId }
          : { type: 'page_id', page_id: parentPageId },
        ...(icon ? { icon } : {}),
        properties: inDatabase
          ? propertiesFor(names, findingId, title, {
              kind: rowKind,
              externalId: findingId,
              seconds: timeSec === undefined ? null : timeSec
            })
          : pageTitleProperties(title, false, names),
        ...(first.length ? { children: first } : {})
      }
    })
    if (rest.length && page?.id) await appendChildren(page.id, rest)
    const summary = pageSummary(page, inDatabase ? names.titleName : 'title')
    return summary ? { ...summary, body: normalizeBody(body) } : null
  }

  async function createNodePage(marker, title, emoji = null) {
    const names = await loadSchema()
    const icon = emojiIcon(emoji)
    const page = await request('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'data_source_id', data_source_id: names.dataSourceId },
        ...(icon ? { icon } : {}),
        properties: {
          ...pageTitleProperties(title, true, names),
          [names.nodeName]: { rich_text: chunkRichText(marker) }
        }
      }
    })
    return pageSummary(page, names.titleName)
  }

  async function findNode(marker) {
    const names = await loadSchema()
    const data = await request(`/data_sources/${names.dataSourceId}/query`, {
      method: 'POST',
      body: {
        page_size: 1,
        filter: {
          property: names.nodeName,
          rich_text: { equals: String(marker || '') }
        }
      }
    })
    const page = (data.results || []).find((item) => !item.archived && !item.in_trash)
    return pageSummary(page, names.titleName)
  }

  async function updatePage(
    pageId,
    findingId,
    title,
    body,
    emoji = null,
    kind = 'finding',
    childTitles = null,
    timeSec = undefined
  ) {
    const names = await loadSchema()
    const current = await request(`/pages/${pageId}`)
    const inDatabase = current.parent?.type !== 'page_id'
    const properties = inDatabase
      ? propertiesFor(names, findingId, title)
      : pageTitleProperties(title, false, names)
    const icon = emojiIcon(emoji)
    const saved = await request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { properties, ...(icon ? { icon } : {}) }
    })
    const wrote = await writeBody(pageId, normalizeBody(body), findingId, kind, childTitles, timeSec)
    if (wrote.patched) {
      return {
        pageId,
        title: normalizeTitle(title),
        body: normalizeBody(body),
        editedAt: wrote.editedAt || saved?.last_edited_time || (await pageEditedAt(pageId)) || null,
        timeSec: kind === 'finding' && timeSec !== undefined ? timeSec : undefined,
        findingId: kind === 'finding' ? String(findingId || '') : '',
        playlistId: kind === 'playlist' ? String(findingId || '') : '',
        progressId: kind === 'progress' ? String(findingId || '') : '',
        playlistLegacy: false
      }
    }
    return readPage(pageId)
  }

  async function saveRow(row) {
    const names = await loadSchema()
    const kind = row?.kind || 'note'
    const externalId = String(row?.externalId || '')
    let pageId = row?.pageId || null
    const trustRow = row?.databaseRow === true && Boolean(pageId)
    if (pageId && !trustRow) {
      const parent = await pageParent(pageId)
      if (!parent || parent.type === 'page_id') pageId = null
    }
    if (!pageId && externalId) {
      const found = await findRow(kind, externalId)
      pageId = found?.pageId || null
    }
    const properties = rowProperties(names, { ...row, kind, externalId })
    const icon = emojiIcon(row?.emoji)
    const writeKind = kind === 'note' ? 'finding' : kind
    const skipBody = kind === 'course' || kind === 'file'
    if (!pageId) {
      const children = skipBody
        ? []
        : pageChildren(row?.body || '', externalId, writeKind, row?.childTitles || null, undefined).slice(0, 100)
      const page = await request('/pages', {
        method: 'POST',
        body: {
          parent: { type: 'data_source_id', data_source_id: names.dataSourceId },
          ...(icon ? { icon } : {}),
          properties,
          ...(children.length ? { children } : {})
        }
      })
      return {
        pageId: page.id,
        title: normalizeTitle(row?.title),
        body: normalizeBody(row?.body || ''),
        editedAt: page.last_edited_time || null,
        timeSec: row?.seconds == null ? undefined : row.seconds,
        kind,
        externalId,
        color: row?.color || '',
        anchors: row?.anchors || [],
        topicIds: row?.topicIds || [],
        status: row?.status || '',
        inProcess: Boolean(row?.inProcess)
      }
    }
    try {
      const saved = await request(`/pages/${pageId}`, {
        method: 'PATCH',
        body: { properties, ...(icon ? { icon } : {}) }
      })
      let editedAt = saved?.last_edited_time || null
      if (!skipBody) {
        const wrote = await writeBody(
          pageId,
          normalizeBody(row?.body || ''),
          externalId,
          writeKind,
          row?.childTitles || null,
          undefined
        )
        if (wrote.editedAt) editedAt = wrote.editedAt
        else editedAt = (await pageEditedAt(pageId)) || editedAt
      }
      return {
        pageId,
        title: normalizeTitle(row?.title),
        body: normalizeBody(row?.body || ''),
        editedAt,
        timeSec: row?.seconds == null ? undefined : row.seconds,
        kind,
        externalId,
        color: row?.color || '',
        anchors: row?.anchors || [],
        topicIds: row?.topicIds || [],
        status: row?.status || '',
        inProcess: Boolean(row?.inProcess),
        playlistLegacy: false
      }
    } catch (error) {
      if (!/archived ancestor/i.test(error?.message || '')) throw error
      const created = await request('/pages', {
        method: 'POST',
        body: {
          parent: { type: 'data_source_id', data_source_id: names.dataSourceId },
          ...(icon ? { icon } : {}),
          properties,
          ...(() => {
            if (skipBody) return {}
            const children = pageChildren(
              row?.body || '',
              externalId,
              writeKind,
              row?.childTitles || null,
              undefined
            ).slice(0, 100)
            return children.length ? { children } : {}
          })()
        }
      })
      return {
        pageId: created.id,
        title: normalizeTitle(row?.title),
        body: normalizeBody(row?.body || ''),
        editedAt: created.last_edited_time || null,
        timeSec: row?.seconds == null ? undefined : row.seconds,
        kind,
        externalId,
        color: row?.color || '',
        anchors: row?.anchors || [],
        topicIds: row?.topicIds || [],
        status: row?.status || '',
        inProcess: Boolean(row?.inProcess)
      }
    }
  }

  async function setPageIcon(pageId, emoji) {
    const icon = emojiIcon(emoji)
    if (!icon) return
    await request(`/pages/${pageId}`, { method: 'PATCH', body: { icon } })
  }

  async function listChildPages(pageId) {
    const blocks = await listChildren(pageId)
    return blocks
      .filter((block) => block.type === 'child_page' && !block.archived && !block.in_trash)
      .map((block) => ({
        pageId: block.id,
        editedAt: block.last_edited_time || null
      }))
  }

  async function renamePage(pageId, title) {
    const names = await loadSchema()
    const current = await request(`/pages/${pageId}`)
    const inDatabase = current.parent?.type !== 'page_id'
    await request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { properties: pageTitleProperties(title, inDatabase, names) }
    })
  }

  async function pageParent(pageId) {
    try {
      const page = await request(`/pages/${pageId}`)
      if (page.archived || page.in_trash) return null
      return {
        type: page.parent?.type || '',
        id: page.parent?.page_id || null
      }
    } catch (error) {
      if (isMissing(error) || /archived ancestor/i.test(error?.message || '')) return null
      throw error
    }
  }

  async function pageEditedAt(pageId) {
    await useCurrentVersion()
    try {
      const page = await request(`/pages/${pageId}`)
      if (!page || page.archived || page.in_trash) return null
      return page.last_edited_time || null
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  async function recentPages({ before } = {}) {
    await useCurrentVersion()
    const pages = []
    const seen = new Set()
    let cursor = ''
    let complete = true
    let hops = 0
    const cap = 300
    do {
      hops += 1
      const data = await request('/search', {
        method: 'POST',
        body: {
          page_size: 100,
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
          ...(cursor ? { start_cursor: cursor } : {})
        }
      })
      const batch = (data.results || [])
        .filter((item) => item?.object === 'page' && item.id)
        .map((item) => ({
          pageId: item.id,
          editedAt: item.last_edited_time || null
        }))
      pages.push(...batch)
      const oldest = batch.length ? batch[batch.length - 1].editedAt : ''
      const more = Boolean(data.has_more && data.next_cursor)
      if (!more) {
        complete = true
        break
      }
      if (before && oldest && oldest <= before) {
        complete = true
        break
      }
      if (pages.length >= cap || hops >= 8) {
        complete = false
        break
      }
      cursor = advanceCursor(data, seen)
    } while (cursor)
    return { pages, complete }
  }

  async function listNoteAssets(pageId) {
    return noteAssetsFromBlocks(await listChildren(pageId))
  }

  function assetBlock(name, uploadId) {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
    const caption = [{ type: 'text', text: { content: `file:${name}` } }]
    if (IMAGE_EXTENSIONS.has(ext)) {
      return {
        object: 'block',
        type: 'image',
        image: { type: 'file_upload', file_upload: { id: uploadId }, caption }
      }
    }
    return {
      object: 'block',
      type: 'file',
      file: { type: 'file_upload', file_upload: { id: uploadId }, caption }
    }
  }

  async function sendFile(uploadId, filename, bytes, contentType) {
    const version = await useCurrentVersion()
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: contentType || 'application/octet-stream' }), filename)
    let response
    try {
      response = await fetchImpl(`https://api.notion.com/v1/file_uploads/${uploadId}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': version
        },
        body: form
      })
    } catch (error) {
      const wrapped = new Error(error?.message || 'No se pudo subir el archivo a Notion')
      wrapped.status = 0
      throw wrapped
    }
    const data = await readJson(response)
    if (!response.ok) {
      const error = new Error(data.message || `Notion respondió ${response.status}`)
      error.status = response.status
      error.code = data.code
      throw error
    }
    return data
  }

  async function attachNoteFile(pageId, name, bytes, contentType, uploadName = name) {
    const version = await useCurrentVersion()
    const filename = uploadName || name
    const type = contentType || 'application/octet-stream'
    const created = await request('/file_uploads', {
      method: 'POST',
      version,
      body: {
        mode: 'single_part',
        filename,
        content_type: type
      }
    })
    await sendFile(created.id, filename, bytes, type)
    await request(`/blocks/${pageId}/children`, {
      method: 'PATCH',
      version,
      body: { children: [assetBlock(name, created.id)] }
    })
  }

  async function downloadAsset(url) {
    let response
    try {
      response = await fetchImpl(url)
    } catch (error) {
      const wrapped = new Error(error?.message || 'No se pudo descargar el archivo')
      wrapped.status = 0
      throw wrapped
    }
    if (!response.ok) {
      const error = new Error(`Notion respondió ${response.status}`)
      error.status = response.status
      throw error
    }
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer)
  }

  async function deleteBlock(blockId) {
    if (!blockId) return
    await request(`/blocks/${blockId}`, { method: 'DELETE' })
  }

  /** Upload a file to Notion and return its upload id, to place in a block. */
  async function uploadFile(filename, bytes, contentType) {
    const version = await useCurrentVersion()
    const type = contentType || 'application/octet-stream'
    const created = await request('/file_uploads', {
      method: 'POST',
      version,
      body: { mode: 'single_part', filename, content_type: type }
    })
    await sendFile(created.id, filename, bytes, type)
    return created.id
  }

  /**
   * A flashcard deck row (kind "deck"): create or find it, set its title, then
   * replace the page content with `children`. One way: the app owns the deck.
   */
  async function saveDeckPage({ deckId, title, children, pageId: knownPageId = null, emoji = null }) {
    const names = await loadSchema()
    const externalId = String(deckId || '')
    let pageId = knownPageId
    if (pageId) {
      const parent = await pageParent(pageId).catch(() => null)
      if (!parent || parent.type === 'page_id') pageId = null
    }
    // Before the first deck exists the "deck" option may be missing; a failed lookup means "not there yet".
    if (!pageId) pageId = (await findRow('deck', externalId).catch(() => null))?.pageId || null
    const properties = rowProperties(names, { kind: 'deck', externalId, title })
    const icon = emojiIcon(emoji)
    if (!pageId) {
      const page = await request('/pages', {
        method: 'POST',
        body: {
          parent: { type: 'data_source_id', data_source_id: names.dataSourceId },
          ...(icon ? { icon } : {}),
          properties
        }
      })
      pageId = page.id
    } else {
      await request(`/pages/${pageId}`, {
        method: 'PATCH',
        body: { properties, ...(icon ? { icon } : {}) }
      })
    }
    await replaceContent(pageId, children || [])
    return { pageId, editedAt: (await pageEditedAt(pageId)) || null }
  }

  async function archivePage(pageId) {
    const version = await useCurrentVersion()
    await request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: version >= '2026-03-11' ? { in_trash: true } : { archived: true }
    })
  }

  return {
    loadSchema,
    listPages,
    findPage,
    findRow,
    listRows,
    saveRow,
    findNode,
    readPage,
    createPage,
    createNodePage,
    updatePage,
    writeMarker,
    renamePage,
    setPageIcon,
    listChildPages,
    listNoteAssets,
    attachNoteFile,
    downloadAsset,
    deleteBlock,
    pageParent,
    pageEditedAt,
    recentPages,
    archivePage,
    uploadFile,
    saveDeckPage,
    acceptedDatabaseId: () => acceptedId
  }
}
