import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CommandSchema, type CommandResponse, CreateMatchSchema } from '@dst/shared'
import { parse } from '../http/errors'
import type { MatchService } from '../services/match-service'

const ListQuerySchema = z.object({
  /** Comma-separated, e.g. `live,paused`. */
  status: z
    .string()
    .optional()
    .transform((s) => s?.split(',').filter(Boolean))
    .pipe(z.array(z.enum(['ready', 'live', 'paused', 'tiebreaker', 'finished'])).optional()),
  tournamentId: z.string().optional(),
})

export function matchRoutes(app: FastifyInstance, { matches }: { matches: MatchService }) {
  app.get('/api/matches', async (request) => matches.list(parse(ListQuerySchema, request.query)))

  app.get<{ Params: { id: string } }>('/api/matches/:id', async (request) =>
    matches.get(request.params.id),
  )

  app.post('/api/matches', async (request, reply) => {
    const match = matches.create(parse(CreateMatchSchema, request.body))
    reply.code(201)
    return match
  })

  app.delete<{ Params: { id: string } }>('/api/matches/:id', async (request, reply) => {
    matches.delete(request.params.id)
    reply.code(204)
  })

  app.post<{ Params: { id: string } }>(
    '/api/matches/:id/commands',
    async (request): Promise<CommandResponse> => ({
      events: matches.handleCommand(request.params.id, parse(CommandSchema, request.body)),
    }),
  )
}
