import type { FastifyInstance } from 'fastify'
import { CreateNodeMatchSchema, CreateTournamentSchema } from '@dst/shared'
import { parse } from '../http/errors'
import type { TournamentService } from '../services/tournament-service'

export function tournamentRoutes(
  app: FastifyInstance,
  { tournaments }: { tournaments: TournamentService },
) {
  app.get('/api/tournaments', async () => tournaments.list())

  app.get<{ Params: { id: string } }>('/api/tournaments/:id', async (request) =>
    tournaments.get(request.params.id),
  )

  app.post('/api/tournaments', async (request, reply) => {
    const tournament = tournaments.create(parse(CreateTournamentSchema, request.body))
    reply.code(201)
    return tournament
  })

  app.delete<{ Params: { id: string } }>('/api/tournaments/:id', async (request, reply) => {
    tournaments.delete(request.params.id)
    reply.code(204)
  })

  app.post<{ Params: { id: string; nodeId: string } }>(
    '/api/tournaments/:id/nodes/:nodeId/match',
    async (request) =>
      tournaments.createNodeMatch(
        request.params.id,
        request.params.nodeId,
        parse(CreateNodeMatchSchema, request.body ?? {}),
      ),
  )
}
