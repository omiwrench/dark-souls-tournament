import { describe, expect, it } from 'vitest'
import { matchTime } from './clock'
import { lastUndoableSeq } from './reducer'
import { createHarness, T0 } from './test-harness'

const MIN = 60_000

describe('lifecycle and clock', () => {
  it('goes from ready through countdown to live', () => {
    const h = createHarness()
    expect(h.state().status).toBe('ready')
    expect(h.reject({ type: 'logDeath', player: 1 })).toBe('not_started')

    h.send({ type: 'start' })
    expect(h.state().status).toBe('live')
    expect(h.state().clock.startsAt).toBe(T0 + 3_000)
    expect(h.reject({ type: 'logDeath', player: 1 })).toBe('counting_down')
    expect(h.reject({ type: 'start' })).toBe('already_started')

    h.advance(3_000 + 5 * MIN)
    expect(matchTime(h.state().clock, h.now)).toBe(5 * MIN)
  })

  it('pauses and resumes', () => {
    const h = createHarness()
    h.start()
    h.advance(10 * MIN)
    h.send({ type: 'pause' })
    expect(h.reject({ type: 'pause' })).toBe('not_live')
    h.advance(7 * MIN)
    expect(h.state().status).toBe('paused')
    expect(matchTime(h.state().clock, h.now)).toBe(10 * MIN)

    h.send({ type: 'resume' })
    h.advance(2 * MIN)
    expect(matchTime(h.state().clock, h.now)).toBe(12 * MIN)
    expect(h.reject({ type: 'resume' })).toBe('not_paused')
  })

  it('logs events while paused at the paused time', () => {
    const h = createHarness()
    h.start()
    h.advance(4 * MIN)
    h.send({ type: 'pause' })
    h.advance(MIN)
    const seq = h.send({ type: 'logDeath', player: 2 })
    expect(h.state().timeline.find((e) => e.seq === seq)?.matchTimeMs).toBe(4 * MIN)
  })
})

describe('scoring', () => {
  it('adds objective points, variant bonuses, death and penalty deductions', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'boss' })
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'knight', variantIds: ['flashy'] })
    h.send({ type: 'logDeath', player: 1 })
    h.send({ type: 'logDeath', player: 1, variantIds: ['costly'] })
    h.send({ type: 'givePenalty', player: 2, penaltyId: 'cheese' })
    h.send({ type: 'givePenalty', player: 2, reason: 'Rude', deduction: 5 })

    const [p1, p2] = h.state().players
    expect(p1.score).toBe(1000 + 300 - 50 - 150)
    expect(p1.deaths).toBe(2)
    expect(p2.score).toBe(-305)
    expect(p2.penalties.map((p) => p.label)).toEqual(['Cheese', 'Penalty: Rude'])
  })

  it('requires a reason for ad-hoc penalties', () => {
    const h = createHarness()
    h.start()
    expect(h.reject({ type: 'givePenalty', player: 1 })).toBe('invalid_penalty')
    expect(h.reject({ type: 'givePenalty', player: 1, penaltyId: 'nope' })).toBe('unknown_penalty')
  })

  it('enforces once-only and max counts per player', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    expect(h.reject({ type: 'completeObjective', player: 1, objectiveId: 'item' })).toBe(
      'limit_reached',
    )
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'item' })

    h.send({ type: 'completeObjective', player: 1, objectiveId: 'knight' })
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'knight' })
    expect(h.reject({ type: 'completeObjective', player: 1, objectiveId: 'knight' })).toBe(
      'limit_reached',
    )
    expect(h.state().players[0].objectiveCounts).toEqual({ item: 1, knight: 2 })
  })

  it('rejects unknown ids', () => {
    const h = createHarness()
    h.start()
    expect(h.reject({ type: 'completeObjective', player: 1, objectiveId: 'nope' })).toBe(
      'unknown_objective',
    )
    expect(
      h.reject({ type: 'completeObjective', player: 1, objectiveId: 'item', variantIds: ['x'] }),
    ).toBe('unknown_variant')
    expect(h.reject({ type: 'logSideEvent', sideEventId: 'nope' })).toBe('unknown_side_event')
  })

  it('records score history for the chart', () => {
    const h = createHarness()
    h.start()
    h.advance(MIN)
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    h.advance(MIN)
    h.send({ type: 'logDeath', player: 1 })
    expect(h.state().players[0].scoreHistory).toEqual([
      { matchTimeMs: 0, score: 0 },
      { matchTimeMs: MIN, score: 100 },
      { matchTimeMs: 2 * MIN, score: 50 },
    ])
  })
})

describe('callouts and drinks', () => {
  it('resolves names and counts drinks', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'logDeath', player: 1 })
    h.send({ type: 'logSideEvent', player: 1, sideEventId: 'humanity' })
    const { callouts, players } = h.state()
    expect(callouts.map((c) => c.text)).toEqual(['Alice drinks', 'Bob drinks'])
    expect(players[0].drinks.sip).toBe(1)
    expect(players[1].drinks.sip).toBe(1)
    expect(players[0].drinksCaused.sip).toBe(1)
  })

  it('fires tag callouts for everyone', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'boss' })
    const [callout] = h.state().callouts
    expect(callout).toMatchObject({ text: 'Boss down!', forPlayers: [1, 2], actor: 2 })
  })

  it('adds or replaces base callouts with variants', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'mob', variantIds: ['parry'] })
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'mob', variantIds: ['silent'] })
    h.send({ type: 'logDeath', player: 1, variantIds: ['fall'] })
    expect(h.state().callouts.map((c) => c.text)).toEqual([
      'Bob sips',
      'Bob shot',
      'Alice drinks x3',
    ])
    expect(h.state().players[1].drinks).toEqual({ sip: 1, shot: 1, finish: 0 })
    expect(h.state().players[0].drinks).toEqual({ sip: 3, shot: 0, finish: 0 })
  })

  it('handles general side events', () => {
    const h = createHarness()
    h.start()
    expect(h.reject({ type: 'logSideEvent', player: 1, sideEventId: 'toast' })).toBe(
      'invalid_player',
    )
    expect(h.reject({ type: 'logSideEvent', sideEventId: 'humanity' })).toBe('invalid_player')
    h.send({ type: 'logSideEvent', sideEventId: 'toast' })
    expect(h.state().players.map((p) => p.drinks.sip)).toEqual([1, 1])
  })

  it('derives callouts for variants added afterwards', () => {
    const h = createHarness()
    h.start()
    const seq = h.send({ type: 'logDeath', player: 1 })
    h.send({ type: 'setVariants', targetSeq: seq, variantIds: ['fall'] })
    const { callouts, timeline } = h.state()
    expect(callouts.map((c) => c.text)).toEqual(['Alice drinks x3'])
    expect(timeline.find((e) => e.seq === seq)).toMatchObject({
      amended: true,
      label: 'Death (Fall)',
    })
  })
})

describe('ending the match', () => {
  it('ends on a match-ending objective, and the bell ringer can still lose', () => {
    const h = createHarness()
    h.start()
    h.advance(20 * MIN)
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'boss' })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'knight', variantIds: ['flashy'] })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'knight', variantIds: ['flashy'] })
    h.send({ type: 'givePenalty', player: 1, penaltyId: 'cheese' })
    h.send({ type: 'givePenalty', player: 1, penaltyId: 'cheese' })
    // Player 1: 2000 - 2 × 300 = 1400. Player 2: 1000 + 2 × 300 = 1600.
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell' })
    h.advance(10 * MIN)

    const state = h.state()
    expect(state.status).toBe('finished')
    expect(state.end).toMatchObject({ reason: 'objective', byPlayer: 1, matchTimeMs: 20 * MIN })
    expect(state.result).toEqual({ winner: 2, decidedBy: 'points' })
    expect(matchTime(state.clock, h.now)).toBe(20 * MIN)
  })

  it('rejects new events after the end unless backdated to before it', () => {
    const h = createHarness()
    h.start()
    h.advance(20 * MIN)
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell' })
    expect(h.reject({ type: 'logDeath', player: 2 })).toBe('match_ended')
    expect(h.reject({ type: 'logDeath', player: 2, matchTimeMs: 20 * MIN })).toBe('invalid_time')
    expect(h.reject({ type: 'pause' })).toBe('not_live')

    // The host forgot to log player 2's boss kill five minutes before the end.
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'boss', matchTimeMs: 15 * MIN })
    expect(h.state().players[1].score).toBe(1000)
    expect(h.state().status).toBe('finished')
  })

  it('expires at the time limit', () => {
    const h = createHarness()
    h.start()
    h.advance(59 * MIN)
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    h.advance(2 * MIN)
    // The harness appends the due expiry first, like the server does.
    expect(h.reject({ type: 'logDeath', player: 2 })).toBe('match_ended')
    const state = h.state()
    expect(state.end).toMatchObject({ reason: 'timeLimit', matchTimeMs: 60 * MIN })
    expect(state.result).toEqual({ winner: 1, decidedBy: 'points' })
  })

  it('lets the host end the match early', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'item' })
    h.send({ type: 'endMatch', reason: 'Power outage' })
    expect(h.state().end?.reason).toBe('host')
    expect(h.state().result?.winner).toBe(2)
    expect(h.reject({ type: 'endMatch' })).toBe('match_ended')
  })
})

describe('undo and amendments', () => {
  it('undoes events and refuses to undo twice', () => {
    const h = createHarness()
    h.start()
    const seq = h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    h.send({ type: 'undo', targetSeq: seq })
    expect(h.state().players[0].score).toBe(0)
    expect(h.state().timeline.find((e) => e.seq === seq)?.status).toBe('voided')
    expect(h.reject({ type: 'undo', targetSeq: seq })).toBe('already_voided')
    // A once-only objective can be logged again after an undo.
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
  })

  it('does not put clock events on the undo stack', () => {
    const h = createHarness()
    h.start()
    expect(lastUndoableSeq(h.state())).toBeNull()
    const seq = h.send({ type: 'logDeath', player: 1 })
    h.send({ type: 'pause' })
    expect(lastUndoableSeq(h.state())).toBe(seq)
    expect(h.reject({ type: 'undo', targetSeq: 1 })).toBe('not_undoable')
    expect(h.reject({ type: 'undo', targetSeq: 99 })).toBe('unknown_event')
  })

  it('pauses the match when the ending objective is undone', () => {
    const h = createHarness()
    h.start()
    h.advance(30 * MIN)
    const seq = h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell' })
    h.advance(MIN)
    h.send({ type: 'undo', targetSeq: seq })
    expect(h.state().status).toBe('paused')
    expect(h.state().end).toBeNull()
    expect(matchTime(h.state().clock, h.now)).toBe(30 * MIN)

    h.send({ type: 'resume' })
    h.advance(MIN)
    expect(matchTime(h.state().clock, h.now)).toBe(31 * MIN)
  })

  it('moves an event to the other player', () => {
    const h = createHarness()
    h.start()
    const seq = h.send({ type: 'completeObjective', player: 1, objectiveId: 'boss' })
    h.send({ type: 'amend', targetSeq: seq, changes: { player: 2 } })
    expect(h.state().players.map((p) => p.score)).toEqual([0, 1000])
  })

  it('ignores an amendment that is undone', () => {
    const h = createHarness()
    h.start()
    const seq = h.send({ type: 'completeObjective', player: 1, objectiveId: 'boss' })
    const amendment = h.send({ type: 'amend', targetSeq: seq, changes: { player: 2 } })
    h.send({ type: 'undo', targetSeq: amendment })
    expect(h.state().players.map((p) => p.score)).toEqual([1000, 0])
  })

  it('marks a duplicate created by an amendment as ignored', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    const seq = h.send({ type: 'completeObjective', player: 2, objectiveId: 'item' })
    h.send({ type: 'amend', targetSeq: seq, changes: { player: 1 } })
    expect(h.state().players[0].score).toBe(100)
    expect(h.state().timeline.find((e) => e.seq === seq)?.status).toBe('ignored')
  })

  it('validates amended times', () => {
    const h = createHarness()
    h.start()
    h.advance(10 * MIN)
    const death = h.send({ type: 'logDeath', player: 1 })
    expect(h.reject({ type: 'amend', targetSeq: death, changes: { matchTimeMs: 11 * MIN } })).toBe(
      'invalid_time',
    )
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell' })
    expect(h.reject({ type: 'amend', targetSeq: death, changes: { matchTimeMs: 10 * MIN } })).toBe(
      'invalid_time',
    )
    h.send({ type: 'amend', targetSeq: death, changes: { matchTimeMs: 2 * MIN } })
    expect(h.state().timeline.map((e) => e.seq)).toEqual([1, death, death + 1])
  })

  it('rejects amendments to events that cannot change', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'logSideEvent', sideEventId: 'toast' })
    expect(h.reject({ type: 'amend', targetSeq: 1, changes: { player: 1 } })).toBe(
      'invalid_amendment',
    )
    expect(h.reject({ type: 'amend', targetSeq: 2, changes: { player: 1 } })).toBe(
      'invalid_amendment',
    )
    expect(h.reject({ type: 'setVariants', targetSeq: 2, variantIds: [] })).toBe(
      'invalid_amendment',
    )
  })
})

describe('tiebreakers', () => {
  it('lets the player who ended the match win a tie', () => {
    const h = createHarness()
    h.start()
    // Player 2 reaches exactly 2000: 1000 + 2 × 300 + 100 + 30 × 10.
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'boss' })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'knight', variantIds: ['flashy'] })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'knight', variantIds: ['flashy'] })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'item' })
    for (let i = 0; i < 30; i++) {
      h.send({ type: 'completeObjective', player: 2, objectiveId: 'mob' })
    }
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell' })
    expect(h.state().players.map((p) => p.score)).toEqual([2000, 2000])
    expect(h.state().result).toEqual({ winner: 1, decidedBy: 'endedMatch' })
  })

  it('goes into tiebreaker mode and waits for the host', () => {
    const h = createHarness()
    h.start()
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'item' })
    expect(h.reject({ type: 'resolveTiebreaker', winner: 1 })).toBe('not_in_tiebreaker')
    h.send({ type: 'endMatch' })

    // Nobody ended the match with an objective, so the manual tiebreaker applies.
    expect(h.state().status).toBe('tiebreaker')
    expect(h.state().pendingTiebreaker).toEqual({ instruction: 'Arm wrestle' })

    const resolution = h.send({ type: 'resolveTiebreaker', winner: 2 })
    expect(h.state().status).toBe('finished')
    expect(h.state().result).toEqual({ winner: 2, decidedBy: 'manual' })

    h.send({ type: 'undo', targetSeq: resolution })
    expect(h.state().status).toBe('tiebreaker')
  })

  it('applies tiebreakers in order', () => {
    const h = createHarness({
      ...createHarness().state().setup.ruleset,
      tiebreakers: [{ kind: 'fewerDeaths' }, { kind: 'firstToFinalScore' }],
    })
    h.start()
    h.advance(MIN)
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'item' })
    h.advance(MIN)
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'item' })
    h.send({ type: 'endMatch' })
    expect(h.state().result).toEqual({ winner: 2, decidedBy: 'firstToFinalScore' })
  })

  it('falls back to a manual decision without an instruction', () => {
    const h = createHarness({ ...createHarness().state().setup.ruleset, tiebreakers: [] })
    h.start()
    h.send({ type: 'endMatch' })
    expect(h.state().pendingTiebreaker).toEqual({ instruction: undefined })
  })

  it('ignores a resolution once the tie is gone', () => {
    const h = createHarness()
    h.start()
    h.advance(MIN)
    h.send({ type: 'endMatch' })
    const resolution = h.send({ type: 'resolveTiebreaker', winner: 1 })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'item', matchTimeMs: 0 })
    const state = h.state()
    expect(state.result).toEqual({ winner: 2, decidedBy: 'points' })
    expect(state.timeline.find((e) => e.seq === resolution)?.status).toBe('ignored')
  })
})
