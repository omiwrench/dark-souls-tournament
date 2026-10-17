import { randomUUID } from 'node:crypto'
import { asc, eq, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { PlayerInputSchema, PlayerPatchSchema, type PlayerRecord } from '@dst/shared'
import type { Db } from '../db/client'
import { matches, players } from '../db/schema'
import { HttpError, notFound, parse } from '../http/errors'
import type { TournamentService } from '../services/tournament-service'

export function playerRoutes(
  app: FastifyInstance,
  { db, now, tournaments }: { db: Db; now: () => number; tournaments: TournamentService },
) {
  app.get('/api/players', async (): Promise<PlayerRecord[]> =>
    db.select().from(players).orderBy(asc(players.name)).all(),
  )

  app.post('/api/players', async (request, reply): Promise<PlayerRecord> => {
    const input = parse(PlayerInputSchema, request.body)
    const player = { id: randomUUID(), ...input, createdAt: new Date(now()).toISOString() }
    db.insert(players).values(player).run()
    reply.code(201)
    return player
  })

  app.patch<{ Params: { id: string } }>('/api/players/:id', async (request) => {
    const input = parse(PlayerPatchSchema, request.body)
    const where = eq(players.id, request.params.id)
    const player = Object.keys(input).length
      ? db.update(players).set(input).where(where).returning().get()
      : db.select().from(players).where(where).get()
    if (!player) throw notFound('Player')
    return player
  })

  app.delete<{ Params: { id: string } }>('/api/players/:id', async (request, reply) => {
    const { id } = request.params
    const played = db
      .select({ id: matches.id })
      .from(matches)
      .where(or(eq(matches.player1Id, id), eq(matches.player2Id, id)))
      .limit(1)
      .get()
    if (played) throw new HttpError(409, 'in_use', 'This player has matches and cannot be deleted')
    if (tournaments.isPlayerSeeded(id)) {
      throw new HttpError(409, 'in_use', 'This player is in a tournament and cannot be deleted')
    }
    if (db.delete(players).where(eq(players.id, id)).run().changes === 0) throw notFound('Player')
    reply.code(204)
  })
}
