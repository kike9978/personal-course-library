import {
  blocksToBody,
  bodyToBlocks,
  chunkRichText,
  findingIdFromBlocks,
  markerBlocks,
  markerFromBlocks,
  normalizeBody,
  normalizeTitle,
  plainRichText
} from '../../shared/notionSync.js'

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
    { method = 'GET', body, attempt = 0, version = apiVersion } = {}
  ) {
    if (!version) throw new Error('Falta la versión de la API de Notion')
    let response
    try {
      response = await fetchImpl(`https://api.notion.com/v1${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': version,
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch (error) {
      const wrapped = new Error(error?.message || 'No se pudo hablar con Notion')
      wrapped.status = 0
      throw wrapped
    }

    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleepImpl(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000)
      return request(pathname, { method, body, attempt: attempt + 1, version })
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

  async function loadSchema() {
    if (schema) return schema
    await useCurrentVersion()
    const dataSourceId = await resolveDataSourceId()
    const source = await request(`/data_sources/${dataSourceId}`)
    let titleName = null
    let findingName = null
    let nodeName = null
    for (const [name, property] of Object.entries(source.properties || {})) {
      if (property?.type === 'title') titleName = name
      if (property?.type === 'rich_text' && name === 'Finding') findingName = name
      if (property?.type === 'rich_text' && name === 'Nodo') nodeName = name
    }
    if (!titleName) throw new Error('La base de Notion no tiene una propiedad de título')
    const properties = {}
    if (!findingName) properties.Finding = { rich_text: {} }
    if (!nodeName) properties.Nodo = { rich_text: {} }
    if (Object.keys(properties).length) {
      await request(`/data_sources/${dataSourceId}`, {
        method: 'PATCH',
        body: { properties }
      })
      findingName = findingName || 'Finding'
      nodeName = nodeName || 'Nodo'
    }
    schema = { titleName, findingName, nodeName, dataSourceId }
    return schema
  }

  function propertiesFor(names, findingId, title) {
    return {
      [names.titleName]: { title: chunkRichText(normalizeTitle(title)) },
      [names.findingName]: { rich_text: chunkRichText(String(findingId || '')) }
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

  async function listChildren(blockId) {
    const blocks = []
    let cursor = ''
    do {
      const query = new URLSearchParams({ page_size: '100' })
      if (cursor) query.set('start_cursor', cursor)
      const data = await request(`/blocks/${blockId}/children?${query}`)
      blocks.push(...(data.results || []))
      cursor = data.has_more ? data.next_cursor || '' : ''
    } while (cursor)
    return blocks
  }

  async function listPages() {
    const names = await loadSchema()
    const pages = []
    let cursor = ''
    do {
      const data = await request(`/data_sources/${names.dataSourceId}/query`, {
        method: 'POST',
        body: {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {})
        }
      })
      for (const page of data.results || []) {
        if (page.archived || page.in_trash) continue
        pages.push({
          pageId: page.id,
          findingId: plainRichText(page.properties?.[names.findingName]?.rich_text).trim(),
          nodeMarker: plainRichText(page.properties?.[names.nodeName]?.rich_text).trim(),
          parentType: page.parent?.type || '',
          editedAt: page.last_edited_time || null
        })
      }
      cursor = data.has_more ? data.next_cursor || '' : ''
    } while (cursor)
    return pages
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
      return {
        ...summary,
        body: blocksToBody(blocks),
        findingId: findingIdFromBlocks(blocks) || fromProperty,
        marker: markerFromBlocks(blocks)
      }
    } catch (error) {
      if (error.status === 404 || error.code === 'object_not_found') return null
      throw error
    }
  }

  async function replaceContent(pageId, children) {
    const existing = await listChildren(pageId)
    for (const block of existing) {
      if (block.type === 'child_page' || block.archived || block.in_trash) continue
      await request(`/blocks/${block.id}`, { method: 'DELETE' })
    }
    if (!children.length) return
    await request(`/blocks/${pageId}/children`, {
      method: 'PATCH',
      body: { children }
    })
  }

  async function writeBody(pageId, body, findingId) {
    const existing = await listChildren(pageId)
    const stamped = findingIdFromBlocks(existing)
    await replaceContent(pageId, bodyToBlocks(body, stamped || findingId || null))
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

  async function createPage(findingId, title, body, parentPageId = null, emoji = null, marker = null) {
    const names = await loadSchema()
    const children = marker ? markerBlocks(marker) : bodyToBlocks(body, findingId)
    const inDatabase = !parentPageId
    const icon = emojiIcon(emoji)
    const page = await request('/pages', {
      method: 'POST',
      body: {
        parent: inDatabase
          ? { type: 'data_source_id', data_source_id: names.dataSourceId }
          : { type: 'page_id', page_id: parentPageId },
        ...(icon ? { icon } : {}),
        properties: inDatabase
          ? propertiesFor(names, findingId, title)
          : pageTitleProperties(title, false, names),
        ...(children.length ? { children } : {})
      }
    })
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

  async function updatePage(pageId, findingId, title, body, emoji = null) {
    const names = await loadSchema()
    const current = await request(`/pages/${pageId}`)
    const inDatabase = current.parent?.type !== 'page_id'
    const properties = inDatabase
      ? propertiesFor(names, findingId, title)
      : pageTitleProperties(title, false, names)
    const icon = emojiIcon(emoji)
    await request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: { properties, ...(icon ? { icon } : {}) }
    })
    await writeBody(pageId, normalizeBody(body), findingId)
    return readPage(pageId)
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
      if (isMissing(error)) return null
      throw error
    }
  }

  async function recentPages() {
    const data = await request('/search', {
      method: 'POST',
      body: {
        page_size: 100,
        sort: { direction: 'descending', timestamp: 'last_edited_time' }
      }
    })
    return (data.results || [])
      .filter((item) => item?.object === 'page' && item.id)
      .map((item) => ({
        pageId: item.id,
        editedAt: item.last_edited_time || null
      }))
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
    findNode,
    readPage,
    createPage,
    createNodePage,
    updatePage,
    writeMarker,
    renamePage,
    setPageIcon,
    listChildPages,
    pageParent,
    recentPages,
    archivePage,
    acceptedDatabaseId: () => acceptedId
  }
}
