import { type RulesetInput, RulesetSchema } from '../ruleset/schema'
import type { Command } from './commands'
import { type DecideResult, checkExpiry, decide } from './decide'
import type { MatchEvent, NewEvent } from './events'
import { type MatchSetup, reduceMatch } from './reducer'

export const T0 = Date.parse('2026-10-17T18:00:00.000Z')

/** A small ruleset that exercises every feature. */
export const testRuleset = RulesetSchema.parse({
  id: 'test',
  name: 'Test',
  timeLimitMs: 60 * 60_000,
  categories: [{ id: 'main', name: 'Main' }],
  objectives: [
    { id: 'boss', categoryId: 'main', name: 'Boss', points: 1000, tags: ['boss'] },
    { id: 'item', categoryId: 'main', name: 'Item', points: 100 },
    {
      id: 'knight',
      categoryId: 'main',
      name: 'Knight',
      points: 250,
      repeat: { kind: 'repeatable', max: 2 },
      variants: [{ id: 'flashy', name: 'Flashy', bonusPoints: 50 }],
    },
    {
      id: 'mob',
      categoryId: 'main',
      name: 'Mob',
      points: 10,
      repeat: { kind: 'repeatable' },
      callouts: [
        { target: 'opponent', text: '{opponent} sips', drinks: { kind: 'sip', amount: 1 } },
      ],
      variants: [
        {
          id: 'parry',
          name: 'Parry',
          callouts: [
            { target: 'opponent', text: '{opponent} shot', drinks: { kind: 'shot', amount: 1 } },
          ],
        },
        {
          id: 'silent',
          name: 'Silent',
          calloutMode: 'replace',
          callouts: [],
        },
      ],
    },
    { id: 'bell', categoryId: 'main', name: 'Bell', points: 2000, endsMatch: true },
  ],
  deaths: {
    deduction: 50,
    callouts: [{ target: 'actor', text: '{player} drinks', drinks: { kind: 'sip', amount: 1 } }],
    variants: [
      {
        id: 'fall',
        name: 'Fall',
        calloutMode: 'replace',
        callouts: [
          { target: 'actor', text: '{player} drinks x3', drinks: { kind: 'sip', amount: 3 } },
        ],
      },
      { id: 'costly', name: 'Costly', bonusPoints: -100 },
    ],
  },
  penalties: [{ id: 'cheese', name: 'Cheese', deduction: 300 }],
  sideEvents: [
    {
      id: 'humanity',
      name: 'Humanity',
      scope: 'player',
      callouts: [
        { target: 'opponent', text: '{opponent} drinks', drinks: { kind: 'sip', amount: 1 } },
      ],
    },
    {
      id: 'toast',
      name: 'Toast',
      scope: 'general',
      callouts: [
        { target: 'everyone', text: 'Everyone drinks', drinks: { kind: 'sip', amount: 1 } },
      ],
    },
  ],
  tagCallouts: [
    {
      tag: 'boss',
      callouts: [{ target: 'everyone', text: 'Boss down!', drinks: { kind: 'sip', amount: 1 } }],
    },
  ],
  tiebreakers: [{ kind: 'endedMatch' }, { kind: 'manual', instruction: 'Arm wrestle' }],
} satisfies RulesetInput)

/**
 * Plays a match the way the server will: append any due expiry, then decide, then append.
 * Time only moves when `advance` is called.
 */
export function createHarness(ruleset = testRuleset) {
  const setup: MatchSetup = { ruleset, players: [{ name: 'Alice' }, { name: 'Bob' }] }
  const events: MatchEvent[] = []
  let now = T0

  const append = (newEvents: NewEvent[]) => {
    for (const e of newEvents) {
      events.push({ ...e, seq: events.length + 1, at: new Date(now).toISOString() })
    }
  }
  const state = () => reduceMatch(setup, events)

  const tryRun = (command: Command): DecideResult => {
    const expiry = checkExpiry(state(), now)
    if (expiry) append([expiry])
    const result = decide(state(), command, now)
    if (result.ok) append(result.events)
    return result
  }

  return {
    events,
    state,
    tryRun,
    /** Runs a command that must succeed and returns the seq of its (first) event. */
    send(command: Command): number {
      const result = tryRun(command)
      if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.code}`)
      return events.length - result.events.length + 1
    },
    /** Runs a command that must fail and returns the error code. */
    reject(command: Command): string {
      const result = tryRun(command)
      if (result.ok) throw new Error(`${command.type} was unexpectedly accepted`)
      return result.error.code
    },
    advance(ms: number) {
      now += ms
    },
    /** Starts the match and skips the countdown. */
    start() {
      this.send({ type: 'start' })
      this.advance(3_000)
    },
    get now() {
      return now
    },
  }
}
