import { describe, expect, it } from 'vitest'
import { createHarness } from '../match/test-harness'
import { bellRush } from './bell-rush'

const MIN = 60_000

describe('Bell Rush', () => {
  it('plays a full match', () => {
    const h = createHarness(bellRush)
    h.start()

    h.advance(4 * MIN)
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'asylum-demon' })
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'asylum-demon' })
    h.advance(10 * MIN)
    const death = h.send({ type: 'logDeath', player: 2 })
    h.send({ type: 'setVariants', targetSeq: death, variantIds: ['fall-damage'] })
    h.send({ type: 'logSideEvent', player: 1, sideEventId: 'summoned-solaire' })
    h.send({
      type: 'completeObjective',
      player: 2,
      objectiveId: 'black-knight',
      variantIds: ['parries-only'],
    })
    h.advance(20 * MIN)
    h.send({ type: 'completeObjective', player: 2, objectiveId: 'taurus-demon' })
    h.send({ type: 'logDeath', player: 1, variantIds: ['lost-souls'] })
    h.advance(30 * MIN)
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell-gargoyles' })
    h.send({ type: 'completeObjective', player: 1, objectiveId: 'bell-of-awakening' })

    const state = h.state()
    const [alice, bob] = state.players
    expect(alice.score).toBe(500 + 2_000 + 5_000)
    expect(bob.score).toBe(500 + 250 + 1_000)
    expect(state.result).toEqual({ winner: 1, decidedBy: 'points' })
    expect(state.end?.matchTimeMs).toBe(64 * MIN)

    expect(state.callouts.map((c) => c.text)).toEqual([
      'Everyone drinks', // Asylum Demon (Alice)
      'Everyone drinks', // Asylum Demon (Bob)
      'Bob drinks ×3', // fall damage replaces "Bob drinks"
      'Both players drop their controllers and praise the sun together \\[T]/',
      'Alice takes a shot', // Bob's parry-only Black Knight
      'Everyone drinks', // Taurus Demon
      'Alice drinks',
      'Alice takes a shot', // lost souls
      'Everyone drinks', // Bell Gargoyles
      'Everyone finishes their drink',
    ])
    expect(alice.drinks).toEqual({ sip: 5, shot: 2, finish: 1 })
    expect(bob.drinks).toEqual({ sip: 7, shot: 0, finish: 1 })
    expect(bob.drinksCaused).toEqual({ sip: 0, shot: 1, finish: 0 })
  })
})
