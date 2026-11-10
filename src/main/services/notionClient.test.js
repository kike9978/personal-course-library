import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createNotionClient } from './notionClient.js'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return JSON.stringify(body)
    }
  }
}

describe('notion client', () => {
  it('adds a Finding property and writes the note as one markdown block', async () => {
    const calls = []
    const fetchImpl = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null
      calls.push({
        url,
        method: options.method || 'GET',
        body,
        version: options.headers?.['Notion-Version']
      })
      if (url.endsWith('/users/me')) {
        return jsonResponse({ object: 'user', id: 'bot' })
      }
      if (url.endsWith('/databases/db-1') && (!options.method || options.method === 'GET')) {
        return jsonResponse({ data_sources: [{ id: 'src-1', name: 'Anotaciones' }] })
      }
      if (url.endsWith('/data_sources/src-1') && (!options.method || options.method === 'GET')) {
        return jsonResponse({
          object: 'data_source',
          id: 'src-1',
          properties: { Nombre: { type: 'title' } }
        })
      }
      if (url.endsWith('/data_sources/src-1') && options.method === 'PATCH') {
        return jsonResponse({ ok: true })
      }
      if (url.endsWith('/pages') && options.method === 'POST') {
        return jsonResponse({ id: 'page-1', last_edited_time: '2026-11-08T00:00:00.000Z' })
      }
      return jsonResponse({ message: 'unexpected' }, 500)
    }

    const client = createNotionClient({
      token: 'secret',
      databaseId: 'db-1',
      fetchImpl
    })
    const page = await client.createPage('finding-1', 'Título', 'Hola\n\nmundo')

    assert.equal(page.pageId, 'page-1')
    const created = calls.find((call) => call.url.endsWith('/pages'))
    assert.equal(created.body.properties.Finding.rich_text[0].text.content, 'finding-1')
    assert.equal(created.body.properties.Nombre.title[0].text.content, 'Título')
    assert.equal(created.body.children[0].type, 'code')
    assert.equal(created.body.children[0].code.rich_text[0].text.content, 'Hola\n\nmundo')
    assert.equal(created.body.parent.data_source_id, 'src-1')
    assert.equal(created.version, '2026-03-11')
    const schemaPatch = calls.find(
      (call) => call.method === 'PATCH' && call.url.endsWith('/data_sources/src-1')
    )
    assert.equal(schemaPatch.body.properties.Nodo.rich_text !== undefined, true)
    assert.equal(
      calls.some((call) => call.method === 'PATCH' && call.url.endsWith('/data_sources/src-1')),
      true
    )
  })

  it('uses the previous version when Notion rejects the newest one', async () => {
    const versions = []
    const fetchImpl = async (url, options = {}) => {
      const version = options.headers?.['Notion-Version']
      versions.push(version)
      if (url.endsWith('/users/me')) {
        if (version === '2026-03-11') {
          return jsonResponse(
            { message: 'Invalid Notion-Version header.', code: 'invalid_request' },
            400
          )
        }
        return jsonResponse({ object: 'user', id: 'bot' })
      }
      if (url.endsWith('/databases/db-1')) {
        return jsonResponse({ data_sources: [{ id: 'src-1', name: 'Anotaciones' }] })
      }
      if (url.endsWith('/data_sources/src-1') && options.method === 'PATCH') {
        return jsonResponse({ ok: true })
      }
      if (url.endsWith('/data_sources/src-1')) {
        return jsonResponse({
          object: 'data_source',
          id: 'src-1',
          properties: { Nombre: { type: 'title' }, Finding: { type: 'rich_text' } }
        })
      }
      if (url.endsWith('/pages')) {
        return jsonResponse({ id: 'page-2', last_edited_time: '2026-11-08T00:00:00.000Z' })
      }
      return jsonResponse({ message: 'unexpected' }, 500)
    }

    const client = createNotionClient({ token: 'secret', databaseId: 'db-1', fetchImpl })
    await client.createPage('finding-2', 'Otra', 'Texto')
    assert.equal(versions.includes('2026-03-11'), true)
    assert.equal(versions.at(-1), '2025-09-03')
  })

  it('creates a note under its file page', async () => {
    const calls = []
    const fetchImpl = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null
      calls.push({ url, method: options.method || 'GET', body })
      if (url.endsWith('/users/me')) return jsonResponse({ object: 'user', id: 'bot' })
      if (url.endsWith('/databases/db-1')) {
        return jsonResponse({ data_sources: [{ id: 'src-1', name: 'Anotaciones' }] })
      }
      if (url.endsWith('/data_sources/src-1') && options.method === 'PATCH') {
        return jsonResponse({ ok: true })
      }
      if (url.endsWith('/data_sources/src-1')) {
        return jsonResponse({
          object: 'data_source',
          id: 'src-1',
          properties: {
            Nombre: { type: 'title' },
            Finding: { type: 'rich_text' },
            Nodo: { type: 'rich_text' }
          }
        })
      }
      if (url.endsWith('/pages') && options.method === 'POST') {
        return jsonResponse({
          id: 'note-1',
          last_edited_time: '2026-11-08T00:00:00.000Z',
          properties: { title: { title: [{ plain_text: 'new note' }] } }
        })
      }
      return jsonResponse({ message: 'unexpected' }, 500)
    }

    const client = createNotionClient({ token: 'secret', databaseId: 'db-1', fetchImpl })
    const page = await client.createPage('note-id', 'new note', 'Hola', 'file-page', '📝')
    const created = calls.find((call) => call.method === 'POST' && call.url.endsWith('/pages'))
    assert.equal(created.body.parent.page_id, 'file-page')
    assert.equal(created.body.icon.emoji, '📝')
    assert.equal(created.body.properties.title.title[0].text.content, 'new note')
    assert.equal(created.body.properties.Finding, undefined)
    assert.equal(created.body.children[0].code.caption[0].text.content, 'finding:note-id')
    assert.equal(created.body.children[0].code.rich_text[0].text.content, 'Hola')
    assert.equal(page.pageId, 'note-1')
  })
})
