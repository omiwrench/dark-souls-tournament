import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { bellRush } from '@dst/shared'
import { testApp } from '../test/helpers'

let app: FastifyInstance
beforeEach(async () => {
  app = await testApp()
})
afterEach(() => app.close())

const { id: _id, ...bellRushBody } = bellRush

describe('rulesets', () => {
  it('seeds Bell Rush', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/rulesets' })
    expect(list.json()).toEqual([
      expect.objectContaining({ id: 'bell-rush', name: 'Bell Rush', objectiveCount: 40 }),
    ])
    const one = await app.inject({ method: 'GET', url: '/api/rulesets/bell-rush' })
    expect(one.json().ruleset).toEqual(bellRush)
  })

  it('creates with a server-assigned id, updates and deletes', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/rulesets',
      payload: { ...bellRushBody, id: 'ignored', name: 'Bell Rush 2' },
    })
    expect(created.statusCode).toBe(201)
    const { ruleset } = created.json()
    expect(ruleset.id).not.toBe('ignored')

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/rulesets/${ruleset.id}`,
      payload: { ...bellRushBody, name: 'Bell Rush II', timeLimitMs: 60_000 },
    })
    expect(updated.json().ruleset).toMatchObject({ id: ruleset.id, name: 'Bell Rush II' })

    const deleted = await app.inject({ method: 'DELETE', url: `/api/rulesets/${ruleset.id}` })
    expect(deleted.statusCode).toBe(204)
  })

  it('duplicates', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rulesets/bell-rush/duplicate' })
    expect(res.json().ruleset).toMatchObject({
      name: 'Bell Rush (copy)',
      objectives: bellRush.objectives,
    })
  })

  it('refuses invalid rulesets with the list of problems', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rulesets',
      payload: { ...bellRushBody, timeLimitMs: null, objectives: [] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatchObject({
      code: 'invalid_ruleset',
      issues: expect.arrayContaining([expect.objectContaining({ path: 'timeLimitMs' })]),
    })
  })
})
