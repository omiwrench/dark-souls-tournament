import type { Variant } from '../ruleset/schema'
import { isCountingDown, matchTime } from './clock'
import { type Command, DEFAULT_COUNTDOWN_MS } from './commands'
import { type EventBody, type MatchEvent, type NewEvent, isUndoable } from './events'
import { type MatchState, findObjective, maxCount } from './reducer'

export type DecideErrorCode =
  | 'not_started'
  | 'already_started'
  | 'counting_down'
  | 'not_live'
  | 'not_paused'
  | 'match_ended'
  | 'time_expired'
  | 'invalid_time'
  | 'unknown_objective'
  | 'unknown_variant'
  | 'unknown_penalty'
  | 'unknown_side_event'
  | 'unknown_event'
  | 'limit_reached'
  | 'invalid_player'
  | 'invalid_penalty'
  | 'not_undoable'
  | 'already_voided'
  | 'invalid_amendment'
  | 'not_in_tiebreaker'

export type DecideResult =
  | { ok: true; events: NewEvent[] }
  | { ok: false; error: { code: DecideErrorCode; message: string } }

const fail = (code: DecideErrorCode, message: string): DecideResult => ({
  ok: false,
  error: { code, message },
})

/**
 * Turns a command into events, or rejects it. `now` is the server's wall clock (epoch ms).
 * Before calling this the server should append any due expiry, see `checkExpiry`.
 */
export function decide(state: MatchState, command: Command, now: number): DecideResult {
  const { ruleset } = state.setup
  const currentTime = matchTime(state.clock, now)
  const ok = (body: EventBody, matchTimeMs = currentTime): DecideResult => ({
    ok: true,
    events: [{ matchTimeMs, body }],
  })

  switch (command.type) {
    case 'start':
      if (state.status !== 'ready') return fail('already_started', 'The match has already started')
      return ok(
        { type: 'match.started', countdownMs: command.countdownMs ?? DEFAULT_COUNTDOWN_MS },
        0,
      )

    case 'pause':
      if (isCountingDown(state.clock, now)) return countingDown()
      if (state.status !== 'live') return fail('not_live', 'The clock is not running')
      return ok({ type: 'clock.paused' })

    case 'resume':
      if (state.status !== 'paused') return fail('not_paused', 'The clock is not paused')
      return ok({ type: 'clock.resumed' })

    case 'endMatch':
      if (state.status === 'ready') return notStarted()
      if (isCountingDown(state.clock, now)) return countingDown()
      if (state.end) return fail('match_ended', 'The match has already ended')
      return ok({ type: 'match.endedByHost', reason: command.reason })

    case 'resolveTiebreaker':
      if (state.status !== 'tiebreaker') {
        return fail('not_in_tiebreaker', 'The match is not waiting for a tiebreaker')
      }
      return ok({ type: 'tiebreaker.resolved', winner: command.winner })

    case 'completeObjective': {
      const objective = findObjective(ruleset, command.objectiveId)
      if (!objective) return fail('unknown_objective', `Unknown objective "${command.objectiveId}"`)
      const variantError = checkVariants(objective.variants, command.variantIds)
      if (variantError) return variantError
      const count = state.players[command.player - 1]!.objectiveCounts[objective.id] ?? 0
      if (count >= maxCount(objective)) {
        return fail('limit_reached', `${objective.name} can't be completed again by this player`)
      }
      return logged(state, now, command.matchTimeMs, {
        type: 'objective.completed',
        player: command.player,
        objectiveId: objective.id,
        variantIds: command.variantIds ?? [],
      })
    }

    case 'logDeath': {
      const variantError = checkVariants(ruleset.deaths.variants, command.variantIds)
      if (variantError) return variantError
      return logged(state, now, command.matchTimeMs, {
        type: 'death',
        player: command.player,
        variantIds: command.variantIds ?? [],
      })
    }

    case 'givePenalty': {
      let deduction: number
      if (command.penaltyId !== undefined) {
        const penalty = ruleset.penalties.find((p) => p.id === command.penaltyId)
        if (!penalty) return fail('unknown_penalty', `Unknown penalty "${command.penaltyId}"`)
        deduction = penalty.deduction
      } else {
        if (!command.reason) return fail('invalid_penalty', 'An ad-hoc penalty needs a reason')
        deduction = command.deduction ?? 0
      }
      return logged(state, now, command.matchTimeMs, {
        type: 'penalty',
        player: command.player,
        penaltyId: command.penaltyId,
        reason: command.reason,
        deduction,
      })
    }

    case 'logSideEvent': {
      const sideEvent = ruleset.sideEvents.find((s) => s.id === command.sideEventId)
      if (!sideEvent) {
        return fail('unknown_side_event', `Unknown side event "${command.sideEventId}"`)
      }
      if (sideEvent.scope === 'player' && command.player === undefined) {
        return fail('invalid_player', `${sideEvent.name} needs a player`)
      }
      if (sideEvent.scope === 'general' && command.player !== undefined) {
        return fail('invalid_player', `${sideEvent.name} is not about a player`)
      }
      return logged(state, now, command.matchTimeMs, {
        type: 'sideEvent',
        player: command.player,
        sideEventId: sideEvent.id,
      })
    }

    case 'undo': {
      const target = findTarget(state, command.targetSeq)
      if (!target.ok) return target.result
      if (!isUndoable(target.event.body)) {
        return fail('not_undoable', 'That event cannot be undone')
      }
      return ok({ type: 'event.voided', targetSeq: command.targetSeq })
    }

    case 'setVariants': {
      const target = findTarget(state, command.targetSeq)
      if (!target.ok) return target.result
      const body = effectiveBody(state, command.targetSeq) ?? target.event.body
      let available: Variant[]
      if (body.type === 'objective.completed') {
        available = findObjective(ruleset, body.objectiveId)?.variants ?? []
      } else if (body.type === 'death') {
        available = ruleset.deaths.variants
      } else {
        return fail('invalid_amendment', 'That event has no variants')
      }
      const variantError = checkVariants(available, command.variantIds)
      if (variantError) return variantError
      return ok({
        type: 'event.amended',
        targetSeq: command.targetSeq,
        changes: { variantIds: command.variantIds },
      })
    }

    case 'amend': {
      const target = findTarget(state, command.targetSeq)
      if (!target.ok) return target.result
      const { changes } = command
      if (changes.matchTimeMs === undefined && changes.player === undefined) {
        return fail('invalid_amendment', 'Nothing to change')
      }
      const body = effectiveBody(state, command.targetSeq) ?? target.event.body
      const amendable = ['objective.completed', 'death', 'penalty', 'sideEvent']
      if (!amendable.includes(body.type)) {
        return fail('invalid_amendment', 'That event cannot be changed')
      }
      if (changes.player !== undefined && !('player' in body && body.player !== undefined)) {
        return fail('invalid_amendment', 'That event is not about a player')
      }
      if (changes.matchTimeMs !== undefined) {
        if (changes.matchTimeMs > currentTime) {
          return fail('invalid_time', 'An event cannot be moved into the future')
        }
        const isEnding = state.end?.seq === command.targetSeq
        if (state.end && !isEnding && changes.matchTimeMs >= state.end.matchTimeMs) {
          return fail('invalid_time', 'An event cannot be moved to after the end of the match')
        }
      }
      return ok({ type: 'event.amended', targetSeq: command.targetSeq, changes })
    }
  }
}

/**
 * Returns the expiry event when the time limit has been reached but not yet recorded.
 * The server calls this from its timer and before handling each command.
 */
export function checkExpiry(state: MatchState, now: number): NewEvent | null {
  const { clock } = state
  if (state.status === 'ready' || state.end || clock.limitMs === null) return null
  if (matchTime(clock, now) < clock.limitMs) return null
  return { matchTimeMs: clock.limitMs, body: { type: 'match.timeExpired' } }
}

/** Shared checks for events that log something that happened in the game. */
function logged(
  state: MatchState,
  now: number,
  requestedTime: number | undefined,
  body: EventBody,
): DecideResult {
  if (state.status === 'ready') return notStarted()
  if (isCountingDown(state.clock, now)) return countingDown()
  const currentTime = matchTime(state.clock, now)

  if (state.end) {
    // After the end, only backdated events from before the end are accepted.
    if (requestedTime === undefined) {
      return fail('match_ended', 'The match has ended. Give a time to log something from before.')
    }
    if (requestedTime >= state.end.matchTimeMs) {
      return fail('invalid_time', 'That time is after the end of the match')
    }
  } else {
    const { limitMs } = state.clock
    if (limitMs !== null && currentTime >= limitMs) {
      return fail('time_expired', 'The time limit has been reached')
    }
    if (requestedTime !== undefined && requestedTime > currentTime) {
      return fail('invalid_time', 'An event cannot be logged in the future')
    }
  }
  return { ok: true, events: [{ matchTimeMs: requestedTime ?? currentTime, body }] }
}

function checkVariants(available: Variant[], ids: string[] | undefined): DecideResult | null {
  const unknown = (ids ?? []).find((id) => !available.some((v) => v.id === id))
  return unknown ? fail('unknown_variant', `Unknown variant "${unknown}"`) : null
}

function findTarget(
  state: MatchState,
  seq: number,
): { ok: true; event: MatchEvent } | { ok: false; result: DecideResult } {
  const event = state.events.find((e) => e.seq === seq)
  if (!event) return { ok: false, result: fail('unknown_event', `No event #${seq}`) }
  if (state.voided.has(seq)) {
    return { ok: false, result: fail('already_voided', 'That event has already been undone') }
  }
  return { ok: true, event }
}

const effectiveBody = (state: MatchState, seq: number) =>
  state.timeline.find((entry) => entry.seq === seq)?.body

const notStarted = () => fail('not_started', 'The match has not started')
const countingDown = () => fail('counting_down', 'The countdown is still running')
