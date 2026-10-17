import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { MatchDetail, TournamentDetail } from '@dst/shared'
import { command, createPlayer, testApp } from '../test/helpers'

let app: FastifyInstance
beforeEach(async () => {
  app = await testApp()
})
afterEach(() => app.close())

async function createTournament(playerCount: number, format: object = { kind: 'single' }) {
  const players = []
  for (let i = 1; i <= playerCount; i++) players.push(await createPlayer(app, `P${i}`))
  const res = await app.inject({
    method: 'POST',
    url: '/api/tournaments',
    payload: {
      name: 'Bell Cup',
      rulesetId: 'bell-rush',
      playerIds: players.map((p) => p.id),
      seeding: 'manual',
      format,
    },
  })
  if (res.statusCode !== 201) throw new Error(res.body)
  return res.json() as TournamentDetail
}

const get = async (id: string) =>
  (await app.inject({ method: 'GET', url: `/api/tournaments/${id}` })).json() as TournamentDetail

function openNode(tournamentId: string, nodeId: string) {
  return app.inject({
    method: 'POST',
    url: `/api/tournaments/${tournamentId}/nodes/${nodeId}/match`,
    payload: {},
  })
}

/** Plays a node's match: the player in `winner` slot rings the bell. Returns its id. */
async function play(tournamentId: string, nodeId: string, winner: 1 | 2) {
  const match = (await openNode(tournamentId, nodeId)).json() as MatchDetail
  await command(app, match.id, { type: 'start', countdownMs: 0 })
  const res = await command(app, match.id, {
    type: 'completeObjective',
    player: winner,
    objectiveId: 'bell-of-awakening',
  })
  if (res.statusCode !== 200) throw new Error(res.body)
  return match.id
}

describe('tournaments', () => {
  it('creates a seeded bracket', async () => {
    const tournament = await createTournament(3)
    expect(tournament).toMatchObject({
      name: 'Bell Cup',
      rulesetName: 'Bell Rush',
      format: { kind: 'single', thirdPlace: false },
      champion: null,
      matches: [],
    })
    expect(tournament.seeding.map((p) => p.name)).toEqual(['P1', 'P2', 'P3'])
    expect(tournament.bracket.size).toBe(4)

    const list = await app.inject({ method: 'GET', url: '/api/tournaments' })
    expect(list.json()).toEqual([expect.objectContaining({ playerCount: 3, champion: null })])
  })

  it('shuffles random seeding', async () => {
    const players = []
    for (let i = 1; i <= 8; i++) players.push(await createPlayer(app, `R${i}`))
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Random',
        rulesetId: 'bell-rush',
        playerIds: players.map((p) => p.id),
        seeding: 'random',
        format: { kind: 'double' },
      },
    })
    const seeded = (res.json() as TournamentDetail).seeding.map((p) => p.id)
    expect([...seeded].sort()).toEqual(players.map((p) => p.id).sort())
  })

  it('validates input', async () => {
    const p1 = await createPlayer(app, 'Alone')
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: {
        name: 'Tiny',
        rulesetId: 'bell-rush',
        playerIds: [p1.id],
        seeding: 'manual',
        format: { kind: 'single' },
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('plays through to a champion', async () => {
    // 3 players: P1 has a bye, P2 plays P3, the winner meets P1 in the final.
    const tournament = await createTournament(3)
    expect((await openNode(tournament.id, 'W2-1')).json().error.code).toBe('not_ready')

    await play(tournament.id, 'W1-2', 2) // P3 beats P2
    const final = (await openNode(tournament.id, 'W2-1')).json() as MatchDetail
    expect(final.players.map((p) => p.name)).toEqual(['P1', 'P3'])
    // Opening it again returns the same match.
    expect((await openNode(tournament.id, 'W2-1')).json().id).toBe(final.id)

    await play(tournament.id, 'W2-1', 1)
    const done = await get(tournament.id)
    expect(done.champion?.name).toBe('P1')
    expect(done.matches.map((m) => m.bracketNodeId).sort()).toEqual(['W1-2', 'W2-1'])
  })

  it('removes a later match that has not started when a result changes', async () => {
    const tournament = await createTournament(4)
    const semi = await play(tournament.id, 'W1-1', 1)
    await play(tournament.id, 'W1-2', 1)
    const final = (await openNode(tournament.id, 'W2-1')).json() as MatchDetail

    // Undo the bell in the first semifinal: the final's line-up is no longer known.
    const detail = (await app.inject({ method: 'GET', url: `/api/matches/${semi}` })).json()
    const res = await command(app, semi, { type: 'undo', targetSeq: detail.events.at(-1).seq })
    expect(res.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/matches/${final.id}` })).statusCode).toBe(
      404,
    )
  })

  it('locks a result once a later match has started', async () => {
    const tournament = await createTournament(4)
    const semi = await play(tournament.id, 'W1-1', 1)
    await play(tournament.id, 'W1-2', 1)
    const final = (await openNode(tournament.id, 'W2-1')).json() as MatchDetail
    await command(app, final.id, { type: 'start', countdownMs: 0 })

    const detail = (await app.inject({ method: 'GET', url: `/api/matches/${semi}` })).json()
    const undo = await command(app, semi, { type: 'undo', targetSeq: detail.events.at(-1).seq })
    expect(undo.statusCode).toBe(409)
    expect(undo.json().error.code).toBe('bracket_locked')
    const remove = await app.inject({ method: 'DELETE', url: `/api/matches/${semi}` })
    expect(remove.json().error.code).toBe('bracket_locked')
  })

  it('protects players in a tournament and deletes tournaments with their matches', async () => {
    const tournament = await createTournament(2)
    const matchId = await play(tournament.id, 'W1-1', 1)
    const player = tournament.seeding[0]!

    const blocked = await app.inject({ method: 'DELETE', url: `/api/players/${player.id}` })
    expect(blocked.statusCode).toBe(409)

    const res = await app.inject({ method: 'DELETE', url: `/api/tournaments/${tournament.id}` })
    expect(res.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/matches/${matchId}` })).statusCode).toBe(
      404,
    )
  })
})
