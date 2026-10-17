import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { MatchDetail, PlayerRecord } from '@dst/shared'
import { buildApp } from '../app'

export const migrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** A controllable wall clock. */
export function fakeClock(start = Date.parse('2026-10-17T18:00:00.000Z')) {
  let now = start
  return {
    now: () => now,
    advance(ms: number) {
      now += ms
    },
  }
}

export function testApp(options: { now?: () => number; dbPath?: string } = {}) {
  return buildApp({ dbPath: ':memory:', migrationsDir, ...options })
}

export async function createPlayer(app: FastifyInstance, name: string): Promise<PlayerRecord> {
  const res = await app.inject({ method: 'POST', url: '/api/players', payload: { name } })
  return res.json()
}

/** Two players and a Bell Rush match between them. */
export async function createMatch(app: FastifyInstance, rulesetId = 'bell-rush') {
  const alice = await createPlayer(app, 'Alice')
  const bob = await createPlayer(app, 'Bob')
  const res = await app.inject({
    method: 'POST',
    url: '/api/matches',
    payload: { player1Id: alice.id, player2Id: bob.id, rulesetId },
  })
  if (res.statusCode !== 201) throw new Error(res.body)
  return res.json() as MatchDetail
}

export function command(app: FastifyInstance, matchId: string, payload: object) {
  return app.inject({ method: 'POST', url: `/api/matches/${matchId}/commands`, payload })
}
