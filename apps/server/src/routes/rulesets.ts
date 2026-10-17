import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  type Ruleset,
  RulesetInputSchema,
  type RulesetRecord,
  type RulesetSummary,
  validateRuleset,
} from '@dst/shared'
import type { Db } from '../db/client'
import { rulesets } from '../db/schema'
import { HttpError, notFound, parse } from '../http/errors'

/** Parses the editor's ruleset and refuses rulesets with problems. */
function parseRuleset(id: string, body: unknown): Ruleset {
  const ruleset = { ...parse(RulesetInputSchema, body), id }
  const issues = validateRuleset(ruleset)
  if (issues.length) throw new HttpError(400, 'invalid_ruleset', 'The ruleset has problems', issues)
  return ruleset
}

export function rulesetRoutes(app: FastifyInstance, { db, now }: { db: Db; now: () => number }) {
  const timestamp = () => new Date(now()).toISOString()
  const find = (id: string) => {
    const row = db.select().from(rulesets).where(eq(rulesets.id, id)).get()
    if (!row) throw notFound('Ruleset')
    return row
  }
  const insert = (ruleset: Ruleset): RulesetRecord => {
    const updatedAt = timestamp()
    db.insert(rulesets)
      .values({
        id: ruleset.id,
        name: ruleset.name,
        definition: ruleset,
        createdAt: updatedAt,
        updatedAt,
      })
      .run()
    return { ruleset, updatedAt }
  }

  app.get('/api/rulesets', async (): Promise<RulesetSummary[]> =>
    db
      .select()
      .from(rulesets)
      .orderBy(asc(rulesets.name))
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        description: row.definition.description,
        objectiveCount: row.definition.objectives.length,
        updatedAt: row.updatedAt,
      })),
  )

  app.get<{ Params: { id: string } }>(
    '/api/rulesets/:id',
    async (request): Promise<RulesetRecord> => {
      const row = find(request.params.id)
      return { ruleset: row.definition, updatedAt: row.updatedAt }
    },
  )

  app.post('/api/rulesets', async (request, reply) => {
    const record = insert(parseRuleset(randomUUID(), request.body))
    reply.code(201)
    return record
  })

  app.put<{ Params: { id: string } }>(
    '/api/rulesets/:id',
    async (request): Promise<RulesetRecord> => {
      find(request.params.id)
      const ruleset = parseRuleset(request.params.id, request.body)
      const updatedAt = timestamp()
      db.update(rulesets)
        .set({ name: ruleset.name, definition: ruleset, updatedAt })
        .where(eq(rulesets.id, ruleset.id))
        .run()
      return { ruleset, updatedAt }
    },
  )

  app.post<{ Params: { id: string } }>('/api/rulesets/:id/duplicate', async (request, reply) => {
    const { definition } = find(request.params.id)
    const record = insert({ ...definition, id: randomUUID(), name: `${definition.name} (copy)` })
    reply.code(201)
    return record
  })

  // Matches keep their own snapshot, so deleting a ruleset never affects history.
  app.delete<{ Params: { id: string } }>('/api/rulesets/:id', async (request, reply) => {
    if (db.delete(rulesets).where(eq(rulesets.id, request.params.id)).run().changes === 0) {
      throw notFound('Ruleset')
    }
    reply.code(204)
  })
}
