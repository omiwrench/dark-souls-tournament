import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createMatch, testApp } from '../test/helpers'

let app: FastifyInstance
beforeEach(async () => {
  app = await testApp()
})
afterEach(() => app.close())

describe('players', () => {
  it('creates, lists, renames and deletes', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/players',
      payload: { name: '  Solaire ', color: '#f0c040' },
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()
    expect(created.json()).toMatchObject({ name: 'Solaire', color: '#f0c040' })

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/players/${id}`,
      payload: { name: 'Solaire of Astora' },
    })
    expect(renamed.json()).toMatchObject({ name: 'Solaire of Astora', color: '#f0c040' })

    const list = await app.inject({ method: 'GET', url: '/api/players' })
    expect(list.json()).toHaveLength(1)

    const deleted = await app.inject({ method: 'DELETE', url: `/api/players/${id}` })
    expect(deleted.statusCode).toBe(204)
  })

  it('validates input', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/players', payload: { name: '' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('invalid_request')
    expect(res.json().error.issues[0].path).toBe('name')
  })

  it('refuses to delete players with matches', async () => {
    const match = await createMatch(app)
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/players/${match.players[0].id}`,
    })
    expect(res.statusCode).toBe(409)
  })

  it('returns 404 for unknown players', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/players/nope', payload: {} })
    expect(res.statusCode).toBe(404)
  })
})
