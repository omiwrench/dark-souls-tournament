import type {
  Callout,
  CalloutTarget,
  DrinkKind,
  Drinks,
  Objective,
  Ruleset,
  TiebreakerKind,
  Variant,
} from '../ruleset/schema'
import { type Clock, initialClock, matchTime } from './clock'
import { type EventBody, type MatchEvent, type PlayerSlot, isUndoable } from './events'

export type PlayerInfo = { name: string }

/** Everything about a match that isn't an event. */
export type MatchSetup = {
  ruleset: Ruleset
  players: readonly [PlayerInfo, PlayerInfo]
}

/** `ready` = not started. Counting down is derived from the clock, see `isCountingDown`. */
export type MatchStatus = 'ready' | 'live' | 'paused' | 'tiebreaker' | 'finished'

export type DerivedCallout = {
  sourceSeq: number
  matchTimeMs: number
  /** The player the source event is about, if any. */
  actor?: PlayerSlot
  target: CalloutTarget
  /** With `{player}` and `{opponent}` replaced by names. */
  text: string
  drinks?: Drinks
  /** The players this callout makes drink. Spectators aren't tracked. */
  forPlayers: PlayerSlot[]
}

export type DrinkTally = Record<DrinkKind, number>

export type PlayerState = {
  score: number
  objectiveCounts: Record<string, number>
  deaths: number
  penalties: { seq: number; deduction: number; label: string }[]
  drinks: DrinkTally
  /** Drinks this player made the opponent take. */
  drinksCaused: DrinkTally
  /** Starts at 0:00 with score 0, then one point per score change. */
  scoreHistory: { matchTimeMs: number; score: number }[]
}

export type TimelineEntry = {
  seq: number
  at: string
  /** Effective match time, i.e. after amendments. */
  matchTimeMs: number
  /** Effective body, i.e. after amendments. */
  body: EventBody
  player?: PlayerSlot
  label: string
  pointsDelta: number
  callouts: DerivedCallout[]
  /** `ignored` = recorded but has no effect, see `ignoredReason`. */
  status: 'effective' | 'voided' | 'ignored'
  ignoredReason?: string
  amended: boolean
}

export type MatchEnd = {
  reason: 'objective' | 'timeLimit' | 'host'
  matchTimeMs: number
  seq: number
  byPlayer?: PlayerSlot
}

export type MatchResult = { winner: PlayerSlot; decidedBy: 'points' | TiebreakerKind }

export type MatchState = {
  setup: MatchSetup
  status: MatchStatus
  clock: Clock
  players: [PlayerState, PlayerState]
  /** Every non-correction event in match-time order, including voided and ignored ones. */
  timeline: TimelineEntry[]
  callouts: DerivedCallout[]
  end: MatchEnd | null
  result: MatchResult | null
  /** Set while the match waits for the host to pick a winner. */
  pendingTiebreaker: { instruction?: string } | null
  lastSeq: number
  events: readonly MatchEvent[]
  voided: ReadonlySet<number>
}

export const opponentOf = (player: PlayerSlot): PlayerSlot => (player === 1 ? 2 : 1)

const emptyTally = (): DrinkTally => ({ sip: 0, shot: 0, finish: 0 })

function initialPlayer(): PlayerState {
  return {
    score: 0,
    objectiveCounts: {},
    deaths: 0,
    penalties: [],
    drinks: emptyTally(),
    drinksCaused: emptyTally(),
    scoreHistory: [{ matchTimeMs: 0, score: 0 }],
  }
}

/** Computes the full match state from the setup and the stored events (in `seq` order). */
export function reduceMatch(setup: MatchSetup, events: readonly MatchEvent[]): MatchState {
  const { ruleset } = setup

  // Pass 1: corrections. Voids first, so a voided amendment is never applied.
  const voided = new Set<number>()
  for (const event of events) {
    if (event.body.type === 'event.voided') voided.add(event.body.targetSeq)
  }
  const amendments = new Map<number, Extract<EventBody, { type: 'event.amended' }>['changes'][]>()
  for (const event of events) {
    if (event.body.type !== 'event.amended' || voided.has(event.seq)) continue
    const list = amendments.get(event.body.targetSeq) ?? []
    list.push(event.body.changes)
    amendments.set(event.body.targetSeq, list)
  }

  // Pass 2: the clock, in the order things happened in real life.
  let clock = initialClock(ruleset.timeLimitMs)
  for (const event of events) {
    const at = Date.parse(event.at)
    const pause = () => {
      if (clock.runningSince === null) return
      clock = { ...clock, elapsedBeforeMs: matchTime(clock, at), runningSince: null }
    }
    switch (event.body.type) {
      case 'match.started': {
        const startsAt = at + event.body.countdownMs
        clock = { ...clock, startsAt, runningSince: startsAt, elapsedBeforeMs: 0 }
        break
      }
      case 'clock.paused':
      case 'match.timeExpired':
      case 'match.endedByHost':
        pause()
        break
      case 'clock.resumed':
        if (clock.runningSince === null) clock = { ...clock, runningSince: at }
        break
      case 'objective.completed':
        // Logging a match-ending objective stops the clock, even if it's undone later:
        // then the match is simply paused at that point.
        if (findObjective(ruleset, event.body.objectiveId)?.endsMatch) pause()
        break
    }
  }

  // Pass 3: scoring, in match-time order.
  const players: [PlayerState, PlayerState] = [initialPlayer(), initialPlayer()]
  const player = (slot: PlayerSlot) => players[slot - 1]!
  const callouts: DerivedCallout[] = []
  const timeline: TimelineEntry[] = []
  let end: MatchEnd | null = null
  const tiebreakerEntries: TimelineEntry[] = []

  const ordered = events
    .filter((e) => e.body.type !== 'event.voided' && e.body.type !== 'event.amended')
    .map((e) => applyAmendments(e, amendments.get(e.seq)))
    .sort((a, b) => a.event.matchTimeMs - b.event.matchTimeMs || a.event.seq - b.event.seq)

  for (const { event, amended } of ordered) {
    const { body, matchTimeMs, seq } = event
    const entry: TimelineEntry = {
      seq,
      at: event.at,
      matchTimeMs,
      body,
      player: 'player' in body ? body.player : undefined,
      label: labelFor(ruleset, body, setup.players),
      pointsDelta: 0,
      callouts: [],
      status: 'effective',
      amended,
    }
    timeline.push(entry)

    if (voided.has(seq)) {
      entry.status = 'voided'
      continue
    }
    if (body.type === 'tiebreaker.resolved') {
      tiebreakerEntries.push(entry)
      continue
    }
    const affectsPlay = !['match.started', 'clock.paused', 'clock.resumed'].includes(body.type)
    if (end && affectsPlay) {
      entry.status = 'ignored'
      entry.ignoredReason = 'Happened after the match ended'
      continue
    }

    const scoreChange = (slot: PlayerSlot, delta: number) => {
      entry.pointsDelta += delta
      if (delta === 0) return
      const state = player(slot)
      state.score += delta
      state.scoreHistory.push({ matchTimeMs, score: state.score })
    }
    const fire = (list: Callout[], actor: PlayerSlot | undefined) => {
      for (const callout of list) {
        const derived = deriveCallout(callout, actor, seq, matchTimeMs, setup.players)
        entry.callouts.push(derived)
        callouts.push(derived)
        if (!derived.drinks) continue
        for (const slot of derived.forPlayers) {
          player(slot).drinks[derived.drinks.kind] += derived.drinks.amount
        }
        if (actor && derived.target === 'opponent') {
          player(actor).drinksCaused[derived.drinks.kind] += derived.drinks.amount
        }
      }
    }
    const ignore = (reason: string) => {
      entry.status = 'ignored'
      entry.ignoredReason = reason
    }

    switch (body.type) {
      case 'objective.completed': {
        const objective = findObjective(ruleset, body.objectiveId)
        if (!objective) {
          ignore(`Unknown objective "${body.objectiveId}"`)
          break
        }
        const count = player(body.player).objectiveCounts[objective.id] ?? 0
        if (count >= maxCount(objective)) {
          ignore('Already completed the maximum number of times')
          break
        }
        player(body.player).objectiveCounts[objective.id] = count + 1
        const variants = pickVariants(objective.variants, body.variantIds)
        scoreChange(body.player, objective.points + bonus(variants))
        fire(withVariants(objective.callouts, variants), body.player)
        for (const tagCallout of ruleset.tagCallouts) {
          if (objective.tags.includes(tagCallout.tag)) fire(tagCallout.callouts, body.player)
        }
        if (objective.endsMatch) {
          end = { reason: 'objective', matchTimeMs, seq, byPlayer: body.player }
        }
        break
      }
      case 'death': {
        const variants = pickVariants(ruleset.deaths.variants, body.variantIds)
        player(body.player).deaths += 1
        scoreChange(body.player, -ruleset.deaths.deduction + bonus(variants))
        fire(withVariants(ruleset.deaths.callouts, variants), body.player)
        break
      }
      case 'penalty': {
        player(body.player).penalties.push({ seq, deduction: body.deduction, label: entry.label })
        scoreChange(body.player, -body.deduction)
        const penalty = ruleset.penalties.find((p) => p.id === body.penaltyId)
        if (penalty) fire(penalty.callouts, body.player)
        break
      }
      case 'sideEvent': {
        const sideEvent = ruleset.sideEvents.find((s) => s.id === body.sideEventId)
        if (!sideEvent) {
          ignore(`Unknown side event "${body.sideEventId}"`)
          break
        }
        fire(sideEvent.callouts, body.player)
        break
      }
      case 'match.timeExpired':
        end = { reason: 'timeLimit', matchTimeMs, seq }
        break
      case 'match.endedByHost':
        end = { reason: 'host', matchTimeMs, seq }
        break
    }
  }

  // Result.
  let result: MatchResult | null = null
  let pendingTiebreaker: MatchState['pendingTiebreaker'] = null
  if (end) {
    const decided = decideWinner(ruleset, players, end)
    if ('winner' in decided) {
      result = decided
    } else {
      // The latest effective resolution counts; voided ones were skipped above.
      const resolution = tiebreakerEntries.at(-1)
      if (resolution?.body.type === 'tiebreaker.resolved') {
        result = { winner: resolution.body.winner, decidedBy: 'manual' }
      } else {
        pendingTiebreaker = { instruction: decided.instruction }
      }
    }
  }
  for (const entry of tiebreakerEntries) {
    if (result?.decidedBy === 'manual' && entry === tiebreakerEntries.at(-1)) continue
    entry.status = 'ignored'
    entry.ignoredReason =
      result?.decidedBy === 'manual'
        ? 'Overridden by a later decision'
        : 'There is no tie to resolve'
  }

  if (end) {
    clock = { ...clock, runningSince: null, elapsedBeforeMs: end.matchTimeMs }
  }

  let status: MatchStatus
  if (clock.startsAt === null) status = 'ready'
  else if (end) status = result ? 'finished' : 'tiebreaker'
  else status = clock.runningSince === null ? 'paused' : 'live'

  return {
    setup,
    status,
    clock,
    players,
    timeline,
    callouts,
    end: end,
    result,
    pendingTiebreaker,
    lastSeq: events.at(-1)?.seq ?? 0,
    events,
    voided,
  }
}

/** The most recent event Ctrl+Z would undo, or `null`. */
export function lastUndoableSeq(state: MatchState): number | null {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const event = state.events[i]!
    if (isUndoable(event.body) && !state.voided.has(event.seq)) return event.seq
  }
  return null
}

export function findObjective(ruleset: Ruleset, id: string): Objective | undefined {
  return ruleset.objectives.find((o) => o.id === id)
}

export function maxCount(objective: Objective): number {
  return objective.repeat.kind === 'once' ? 1 : (objective.repeat.max ?? Infinity)
}

function applyAmendments(
  event: MatchEvent,
  changes: Extract<EventBody, { type: 'event.amended' }>['changes'][] | undefined,
): { event: MatchEvent; amended: boolean } {
  if (!changes?.length) return { event, amended: false }
  let { body, matchTimeMs } = event
  for (const change of changes) {
    if (change.matchTimeMs !== undefined) matchTimeMs = change.matchTimeMs
    if (change.player !== undefined && 'player' in body) body = { ...body, player: change.player }
    if (change.variantIds !== undefined && 'variantIds' in body) {
      body = { ...body, variantIds: change.variantIds }
    }
  }
  return { event: { ...event, body, matchTimeMs }, amended: true }
}

function pickVariants(available: Variant[], ids: string[]): Variant[] {
  return available.filter((v) => ids.includes(v.id))
}

const bonus = (variants: Variant[]) => variants.reduce((sum, v) => sum + v.bonusPoints, 0)

/** Base callouts plus variant callouts. A `replace` variant drops the base callouts. */
function withVariants(base: Callout[], variants: Variant[]): Callout[] {
  const replace = variants.some((v) => v.calloutMode === 'replace')
  return [...(replace ? [] : base), ...variants.flatMap((v) => v.callouts)]
}

function deriveCallout(
  callout: Callout,
  actor: PlayerSlot | undefined,
  sourceSeq: number,
  matchTimeMs: number,
  players: MatchSetup['players'],
): DerivedCallout {
  let text = callout.text
  let forPlayers: PlayerSlot[] = []
  if (actor) {
    const opponent = opponentOf(actor)
    text = text
      .replaceAll('{player}', players[actor - 1]!.name)
      .replaceAll('{opponent}', players[opponent - 1]!.name)
    if (callout.target === 'actor') forPlayers = [actor]
    if (callout.target === 'opponent') forPlayers = [opponent]
  }
  if (callout.target === 'players' || callout.target === 'everyone') forPlayers = [1, 2]
  return {
    sourceSeq,
    matchTimeMs,
    actor,
    target: callout.target,
    text,
    drinks: callout.drinks,
    forPlayers,
  }
}

function decideWinner(
  ruleset: Ruleset,
  players: [PlayerState, PlayerState],
  end: MatchEnd,
): MatchResult | { instruction?: string } {
  const [p1, p2] = players
  // Lower is better for the comparison helper.
  const lower = (a: number, b: number): PlayerSlot | null => (a < b ? 1 : b < a ? 2 : null)

  if (p1.score !== p2.score) return { winner: p1.score > p2.score ? 1 : 2, decidedBy: 'points' }

  for (const tiebreaker of ruleset.tiebreakers) {
    let winner: PlayerSlot | null = null
    switch (tiebreaker.kind) {
      case 'endedMatch':
        winner = end.byPlayer ?? null
        break
      case 'fewerDeaths':
        winner = lower(p1.deaths, p2.deaths)
        break
      case 'fewerPenalties':
        winner = lower(p1.penalties.length, p2.penalties.length)
        break
      case 'firstToFinalScore':
        winner = lower(p1.scoreHistory.at(-1)!.matchTimeMs, p2.scoreHistory.at(-1)!.matchTimeMs)
        break
      case 'manual':
        return { instruction: tiebreaker.instruction }
    }
    if (winner) return { winner, decidedBy: tiebreaker.kind }
  }
  return {}
}

function labelFor(ruleset: Ruleset, body: EventBody, players: MatchSetup['players']): string {
  const variantNames = (available: Variant[], ids: string[]) => {
    const names = pickVariants(available, ids).map((v) => v.name)
    return names.length ? ` (${names.join(', ')})` : ''
  }
  switch (body.type) {
    case 'match.started':
      return 'Match started'
    case 'clock.paused':
      return 'Paused'
    case 'clock.resumed':
      return 'Resumed'
    case 'objective.completed': {
      const objective = findObjective(ruleset, body.objectiveId)
      if (!objective) return body.objectiveId
      return objective.name + variantNames(objective.variants, body.variantIds)
    }
    case 'death':
      return 'Death' + variantNames(ruleset.deaths.variants, body.variantIds)
    case 'penalty': {
      const name = ruleset.penalties.find((p) => p.id === body.penaltyId)?.name ?? 'Penalty'
      return body.reason ? `${name}: ${body.reason}` : name
    }
    case 'sideEvent':
      return ruleset.sideEvents.find((s) => s.id === body.sideEventId)?.name ?? body.sideEventId
    case 'match.timeExpired':
      return 'Time expired'
    case 'match.endedByHost':
      return body.reason ? `Match ended by host: ${body.reason}` : 'Match ended by host'
    case 'tiebreaker.resolved':
      return `Tiebreaker won by ${players[body.winner - 1]!.name}`
    case 'event.voided':
      return 'Undo'
    case 'event.amended':
      return 'Correction'
  }
}
