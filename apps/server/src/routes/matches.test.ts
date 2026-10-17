import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { bellRush } from '@dst/shared'
import { command, createMatch, createPlayer, fakeClock, testApp } from '../test/helpers'

const MIN = 60_000
let app: FastifyInstance
afterEach(() => app?.close())

describe('matches', () => {
  it('creates a match with a ruleset snapshot', async () => {
    app = await testApp()
    const match = await createMatch(app)
    expect(match).toMatchObject({
      status: 'ready',
      rulesetName: 'Bell Rush',
      players: [{ name: 'Alice' }, { name: 'Bob' }],
      playerSetup: [{}, {}],
      events: [],
    })
    expect(match.ruleset).toEqual(bellRush)
  })

  it('validates match creation', async () => {
    app = await testApp()
    const alice = await createPlayer(app, 'Alice')
    const create = (payload: object) => app.inject({ method: 'POST', url: '/api/matches', payload })

    const self = await create({ player1Id: alice.id, player2Id: alice.id, rulesetId: 'bell-rush' })
    expect(self.statusCode).toBe(400)
    const ghost = await create({ player1Id: alice.id, player2Id: 'ghost', rulesetId: 'bell-rush' })
    expect(ghost.statusCode).toBe(404)
  })

  it('runs commands and keeps the list in sync', async () => {
    const clock = fakeClock()
    app = await testApp({ now: clock.now })
    const { id } = await createMatch(app)

    expect((await command(app, id, { type: 'start', countdownMs: 0 })).statusCode).toBe(200)
    clock.advance(5 * MIN)
    const res = await command(app, id, {
      type: 'completeObjective',
      player: 1,
      objectiveId: 'asylum-demon',
    })
    expect(res.json().events).toEqual([
      expect.objectContaining({ seq: 2, matchTimeMs: 5 * MIN, body: expect.anything() }),
    ])

    const again = await command(app, id, {
      type: 'completeObjective',
      player: 1,
      objectiveId: 'asylum-demon',
    })
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('limit_reached')

    const invalid = await command(app, id, { type: 'teleport' })
    expect(invalid.statusCode).toBe(400)

    const live = await app.inject({ method: 'GET', url: '/api/matches?status=live,paused' })
    expect(live.json()).toEqual([expect.objectContaining({ id, status: 'live', scores: [500, 0] })])

    await command(app, id, {
      type: 'completeObjective',
      player: 2,
      objectiveId: 'bell-of-awakening',
    })
    const detail = (await app.inject({ method: 'GET', url: `/api/matches/${id}` })).json()
    expect(detail).toMatchObject({ status: 'finished', winner: 2, scores: [500, 5000] })
    expect(detail.finishedAt).toBe(new Date(clock.now()).toISOString())
    expect(detail.events).toHaveLength(3)
  })

  it('expires the match when the time limit is reached', async () => {
    app = await testApp()
    const { id } = await createMatch(app, await shortRuleset(app, 150))
    await command(app, id, { type: 'start', countdownMs: 0 })
    await new Promise((resolve) => setTimeout(resolve, 300))

    const detail = (await app.inject({ method: 'GET', url: `/api/matches/${id}` })).json()
    expect(detail.events.at(-1)).toMatchObject({
      matchTimeMs: 150,
      body: { type: 'match.timeExpired' },
    })
    expect(detail.status).toBe('tiebreaker')
  })

  it('records overdue expiries when the server restarts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dst-'))
    try {
      const clock = fakeClock()
      const dbPath = join(dir, 'test.db')
      app = await testApp({ now: clock.now, dbPath })
      const { id } = await createMatch(app)
      await command(app, id, { type: 'start', countdownMs: 0 })
      await app.close()

      clock.advance(2 * 90 * MIN)
      app = await testApp({ now: clock.now, dbPath })
      const detail = (await app.inject({ method: 'GET', url: `/api/matches/${id}` })).json()
      expect(detail.events.at(-1)).toMatchObject({
        matchTimeMs: 90 * MIN,
        body: { type: 'match.timeExpired' },
      })
    } finally {
      await app.close()
      rmSync(dir, { recursive: true })
    }
  })

  it('deletes matches', async () => {
    app = await testApp()
    const { id } = await createMatch(app)
    expect((await app.inject({ method: 'DELETE', url: `/api/matches/${id}` })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/matches/${id}` })).statusCode).toBe(404)
  })
})

/** A copy of Bell Rush with a very short time limit. Returns its id. */
async function shortRuleset(app: FastifyInstance, timeLimitMs: number): Promise<string> {
  const { id: _id, ...body } = bellRush
  const res = await app.inject({
    method: 'POST',
    url: '/api/rulesets',
    payload: { ...body, timeLimitMs },
  })
  return res.json().ruleset.id
}
