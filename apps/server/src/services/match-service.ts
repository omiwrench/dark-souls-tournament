import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, inArray, type SQL } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import {
  type CachedMatchStatus,
  type Command,
  type CreateMatchSchema,
  type DecideResult,
  type MatchDetail,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
  type NewEvent,
  type PlayerRecord,
  checkExpiry,
  decide,
  msUntilExpiry,
  reduceMatch,
  validateRuleset,
} from '@dst/shared'
import type { z } from 'zod'
import type { Db } from '../db/client'
import { matchEvents, matches, players, rulesets } from '../db/schema'
import { HttpError, notFound } from '../http/errors'
import type { Hub } from '../ws/hub'

type MatchRow = typeof matches.$inferSelect
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type ListFilter = { status?: CachedMatchStatus[]; tournamentId?: string }

/**
 * Owns everything that touches a match: creating it, running commands through `decide`,
 * appending events, keeping the cached columns current, broadcasting, and the expiry timers.
 */
export class MatchService {
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly db: Db,
    private readonly hub: Hub,
    private readonly now: () => number,
    private readonly log: FastifyBaseLogger,
  ) {}

  list(filter: ListFilter = {}): MatchSummary[] {
    const conditions: SQL[] = []
    if (filter.status?.length) conditions.push(inArray(matches.status, filter.status))
    if (filter.tournamentId) conditions.push(eq(matches.tournamentId, filter.tournamentId))
    const rows = this.db
      .select()
      .from(matches)
      .where(and(...conditions))
      .orderBy(desc(matches.createdAt))
      .all()
    const playersById = this.playersById(rows.flatMap((r) => [r.player1Id, r.player2Id]))
    return rows.map((row) => toSummary(row, playersById))
  }

  get(id: string): MatchDetail {
    const row = this.db.select().from(matches).where(eq(matches.id, id)).get()
    if (!row) throw notFound('Match')
    const playersById = this.playersById([row.player1Id, row.player2Id])
    return {
      ...toSummary(row, playersById),
      playerSetup: row.playerSetup,
      ruleset: row.rulesetSnapshot,
      events: this.loadEvents(this.db, id),
    }
  }

  /** Events after `sinceSeq`, or `null` if the match doesn't exist. */
  eventsSince(id: string, sinceSeq: number): MatchEvent[] | null {
    const exists = this.db.select({ id: matches.id }).from(matches).where(eq(matches.id, id)).get()
    return exists ? this.loadEvents(this.db, id, sinceSeq) : null
  }

  create(input: z.output<typeof CreateMatchSchema>, tournament?: { id: string; nodeId: string }) {
    const playersById = this.playersById([input.player1Id, input.player2Id])
    for (const playerId of [input.player1Id, input.player2Id]) {
      if (!playersById.has(playerId)) throw notFound(`Player ${playerId}`)
    }
    const ruleset = this.db.select().from(rulesets).where(eq(rulesets.id, input.rulesetId)).get()
    if (!ruleset) throw notFound('Ruleset')
    const issues = validateRuleset(ruleset.definition)
    if (issues.length) {
      throw new HttpError(400, 'invalid_ruleset', 'The ruleset has problems', issues)
    }

    const id = randomUUID()
    this.db
      .insert(matches)
      .values({
        id,
        tournamentId: tournament?.id ?? null,
        bracketNodeId: tournament?.nodeId ?? null,
        player1Id: input.player1Id,
        player2Id: input.player2Id,
        playerSetup: input.playerSetup,
        rulesetId: ruleset.id,
        rulesetSnapshot: ruleset.definition,
        status: 'ready',
        createdAt: new Date(this.now()).toISOString(),
      })
      .run()
    this.hub.publish('matches', { type: 'matches.changed' })
    return this.get(id)
  }

  delete(id: string) {
    const result = this.db.delete(matches).where(eq(matches.id, id)).run()
    if (result.changes === 0) throw notFound('Match')
    this.clearTimer(id)
    this.hub.publish('matches', { type: 'matches.changed' })
  }

  /** Runs a host command. Throws a 409 with the reason when the command is rejected. */
  handleCommand(id: string, command: Command): MatchEvent[] {
    const outcome = this.apply(id, (state, now) => decide(state, command, now))
    if (outcome.error) throw new HttpError(409, outcome.error.code, outcome.error.message)
    return outcome.appended
  }

  /** On startup: record overdue expiries and schedule timers for running matches. */
  resumeTimers() {
    const running = this.db
      .select({ id: matches.id })
      .from(matches)
      .where(inArray(matches.status, ['live', 'paused']))
      .all()
    for (const { id } of running) this.apply(id, () => null)
  }

  close() {
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
  }

  /**
   * The one place events are written. In a single transaction: load, append any due
   * expiry, run `decideFn`, append its events and update the cache. Then broadcast.
   */
  private apply(id: string, decideFn: (state: MatchState, now: number) => DecideResult | null) {
    const now = this.now()
    const outcome = this.db.transaction((tx) => {
      const row = tx.select().from(matches).where(eq(matches.id, id)).get()
      if (!row) throw notFound('Match')
      const playersById = this.playersById([row.player1Id, row.player2Id], tx)
      const setup = {
        ruleset: row.rulesetSnapshot,
        players: [playersById.get(row.player1Id)!, playersById.get(row.player2Id)!] as const,
      }
      const events = this.loadEvents(tx, id)
      let state = reduceMatch(setup, events)
      const appended: MatchEvent[] = []

      const append = (newEvents: NewEvent[]) => {
        for (const { matchTimeMs, body } of newEvents) {
          const event = {
            seq: events.length + 1,
            at: new Date(now).toISOString(),
            matchTimeMs,
            body,
          }
          tx.insert(matchEvents)
            .values({ matchId: id, ...event })
            .run()
          events.push(event)
          appended.push(event)
        }
        state = reduceMatch(setup, events)
      }

      const expiry = checkExpiry(state, now)
      if (expiry) append([expiry])
      const result = decideFn(state, now)
      if (result?.ok) append(result.events)

      const cache = {
        status: state.status,
        winnerSlot: state.result?.winner ?? null,
        score1: state.players[0].score,
        score2: state.players[1].score,
        finishedAt:
          state.status === 'finished' ? (row.finishedAt ?? new Date(now).toISOString()) : null,
      }
      const cacheChanged =
        cache.status !== row.status ||
        cache.winnerSlot !== row.winnerSlot ||
        cache.score1 !== row.score1 ||
        cache.score2 !== row.score2
      if (appended.length) tx.update(matches).set(cache).where(eq(matches.id, id)).run()

      return {
        appended,
        state,
        cacheChanged: cacheChanged && appended.length > 0,
        error: result && !result.ok ? result.error : null,
      }
    })

    if (outcome.appended.length) {
      this.hub.publish(`match:${id}`, {
        type: 'match.events',
        matchId: id,
        events: outcome.appended,
      })
    }
    if (outcome.cacheChanged) this.hub.publish('matches', { type: 'matches.changed' })
    this.schedule(id, outcome.state)
    return outcome
  }

  private schedule(id: string, state: MatchState) {
    this.clearTimer(id)
    if (state.end) return
    const ms = msUntilExpiry(state.clock, this.now())
    if (ms === null) return
    const timer = setTimeout(() => {
      this.timers.delete(id)
      try {
        this.apply(id, () => null)
      } catch (error) {
        this.log.error({ err: error, matchId: id }, 'Failed to expire match')
      }
    }, ms)
    timer.unref()
    this.timers.set(id, timer)
  }

  private clearTimer(id: string) {
    clearTimeout(this.timers.get(id))
    this.timers.delete(id)
  }

  private loadEvents(db: Db | Tx, id: string, sinceSeq = 0): MatchEvent[] {
    return db
      .select({
        seq: matchEvents.seq,
        at: matchEvents.at,
        matchTimeMs: matchEvents.matchTimeMs,
        body: matchEvents.body,
      })
      .from(matchEvents)
      .where(and(eq(matchEvents.matchId, id), gt(matchEvents.seq, sinceSeq)))
      .orderBy(asc(matchEvents.seq))
      .all()
  }

  private playersById(ids: string[], db: Db | Tx = this.db): Map<string, PlayerRecord> {
    if (!ids.length) return new Map()
    const rows = db
      .select()
      .from(players)
      .where(inArray(players.id, [...new Set(ids)]))
      .all()
    return new Map(rows.map((p) => [p.id, p]))
  }
}

function toSummary(row: MatchRow, playersById: Map<string, PlayerRecord>): MatchSummary {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    players: [playersById.get(row.player1Id)!, playersById.get(row.player2Id)!],
    rulesetName: row.rulesetSnapshot.name,
    status: row.status,
    winner: row.winnerSlot,
    scores: [row.score1, row.score2],
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  }
}
