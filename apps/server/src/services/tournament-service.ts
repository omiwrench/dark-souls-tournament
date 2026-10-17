import { randomInt, randomUUID } from 'node:crypto'
import { desc, eq, inArray } from 'drizzle-orm'
import {
  type CreateNodeMatchSchema,
  type CreateTournamentSchema,
  type MatchDetail,
  type MatchSummary,
  type NodeMatch,
  type PlayerRecord,
  type ResolvedBracket,
  type TournamentDetail,
  type TournamentSummary,
  generateBracket,
  resolveBracket,
  validateRuleset,
} from '@dst/shared'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { players, rulesets, tournaments } from '../db/schema'
import { HttpError, notFound } from '../http/errors'
import type { Hub } from '../ws/hub'
import type { MatchService } from './match-service'

type TournamentRow = typeof tournaments.$inferSelect

export class TournamentService {
  constructor(
    private readonly db: Db,
    private readonly matches: MatchService,
    private readonly hub: Hub,
    private readonly now: () => number,
  ) {}

  list(): TournamentSummary[] {
    const rows = this.db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).all()
    return rows.map((row) => {
      const { champion } = this.resolve(row, this.matches.list({ tournamentId: row.id }))
      return {
        ...this.summaryBase(row),
        playerCount: row.seeding.length,
        champion: champion ? (this.players(row.seeding).get(champion) ?? null) : null,
      }
    })
  }

  get(id: string): TournamentDetail {
    const row = this.find(id)
    const matchList = this.matches.list({ tournamentId: id })
    const { champion } = this.resolve(row, matchList)
    const playersById = this.players(row.seeding)
    return {
      ...this.summaryBase(row),
      champion: champion ? (playersById.get(champion) ?? null) : null,
      rulesetId: row.rulesetId,
      seeding: row.seeding.map((playerId) => playersById.get(playerId)!),
      bracket: row.bracket,
      matches: matchList,
    }
  }

  create(input: z.output<typeof CreateTournamentSchema>): TournamentDetail {
    const known = this.players(input.playerIds)
    const missing = input.playerIds.find((playerId) => !known.has(playerId))
    if (missing) throw notFound(`Player ${missing}`)
    const ruleset = this.db.select().from(rulesets).where(eq(rulesets.id, input.rulesetId)).get()
    if (!ruleset) throw notFound('Ruleset')
    const issues = validateRuleset(ruleset.definition)
    if (issues.length)
      throw new HttpError(400, 'invalid_ruleset', 'The ruleset has problems', issues)

    const seeding = input.seeding === 'random' ? shuffle(input.playerIds) : input.playerIds
    const id = randomUUID()
    this.db
      .insert(tournaments)
      .values({
        id,
        name: input.name,
        rulesetId: ruleset.id,
        seeding,
        bracket: generateBracket(seeding.length, input.format),
        createdAt: new Date(this.now()).toISOString(),
      })
      .run()
    return this.get(id)
  }

  /** Deletes the tournament and every match played in it. */
  delete(id: string) {
    this.find(id)
    this.matches.deleteForTournament(id)
    this.db.delete(tournaments).where(eq(tournaments.id, id)).run()
    this.hub.publish('matches', { type: 'matches.changed' })
  }

  /** Creates the match for a bracket node once both players are known, or returns it. */
  createNodeMatch(
    id: string,
    nodeId: string,
    input: z.output<typeof CreateNodeMatchSchema>,
  ): MatchDetail {
    const row = this.find(id)
    const resolved = this.resolve(row, this.matches.list({ tournamentId: id }))
    const node = resolved.nodes.get(nodeId)
    if (!node) throw notFound('Bracket match')
    if (node.match) return this.matches.get(node.match.matchId)
    const [a, b] = node.entrants
    if (node.state !== 'ready' || a.kind !== 'player' || b.kind !== 'player') {
      throw new HttpError(409, 'not_ready', 'Both players for this match are not known yet')
    }
    return this.matches.create(
      {
        player1Id: a.playerId,
        player2Id: b.playerId,
        rulesetId: row.rulesetId,
        playerSetup: input.playerSetup,
      },
      { id, nodeId },
    )
  }

  /** Is the player part of any tournament? Then they can't be deleted. */
  isPlayerSeeded(playerId: string): boolean {
    return this.db
      .select({ seeding: tournaments.seeding })
      .from(tournaments)
      .all()
      .some((t) => t.seeding.includes(playerId))
  }

  private resolve(row: TournamentRow, matchList: MatchSummary[]): ResolvedBracket {
    const byNode = new Map<string, NodeMatch>()
    for (const match of matchList) {
      if (!match.bracketNodeId) continue
      byNode.set(match.bracketNodeId, {
        matchId: match.id,
        finished: match.status === 'finished',
        winner: match.winner,
      })
    }
    return resolveBracket(row.bracket, row.seeding, byNode)
  }

  private summaryBase(row: TournamentRow) {
    const ruleset = this.db
      .select({ name: rulesets.name })
      .from(rulesets)
      .where(eq(rulesets.id, row.rulesetId))
      .get()
    return {
      id: row.id,
      name: row.name,
      format: row.bracket.format,
      rulesetName: ruleset?.name ?? '(deleted ruleset)',
      createdAt: row.createdAt,
    }
  }

  private find(id: string): TournamentRow {
    const row = this.db.select().from(tournaments).where(eq(tournaments.id, id)).get()
    if (!row) throw notFound('Tournament')
    return row
  }

  private players(ids: string[]): Map<string, PlayerRecord> {
    if (!ids.length) return new Map()
    const rows = this.db.select().from(players).where(inArray(players.id, ids)).all()
    return new Map(rows.map((p) => [p.id, p]))
  }
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}
