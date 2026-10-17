import { describe, expect, it } from 'vitest'
import { testRuleset } from '../match/test-harness'
import { bellRush } from '../seed/bell-rush'
import type { Ruleset } from './schema'
import { validateRuleset } from './validate'

const messages = (ruleset: Ruleset) => validateRuleset(ruleset).map((i) => i.message)

describe('validateRuleset', () => {
  it('accepts the seed and test rulesets', () => {
    expect(validateRuleset(bellRush)).toEqual([])
    expect(validateRuleset(testRuleset)).toEqual([])
  })

  it('finds duplicate ids', () => {
    const item = testRuleset.objectives[1]!
    expect(messages({ ...testRuleset, objectives: [...testRuleset.objectives, item] })).toContain(
      'Duplicate id "item"',
    )
  })

  it('finds unknown categories', () => {
    const objectives = [{ ...testRuleset.objectives[0]!, categoryId: 'nope' }]
    expect(messages({ ...testRuleset, objectives })).toContain('Unknown category "nope"')
  })

  it('requires match-ending objectives to be once-only', () => {
    const objectives = testRuleset.objectives.map((o) =>
      o.endsMatch ? { ...o, repeat: { kind: 'repeatable' as const } } : o,
    )
    expect(messages({ ...testRuleset, objectives })).toContain(
      'A match-ending objective must be once-only',
    )
  })

  it('requires an end condition', () => {
    const objectives = testRuleset.objectives.filter((o) => !o.endsMatch)
    expect(validateRuleset({ ...testRuleset, timeLimitMs: null, objectives })).toHaveLength(1)
    expect(validateRuleset({ ...testRuleset, objectives })).toEqual([])
  })

  it('rejects player targets on general side events', () => {
    const sideEvents = [
      {
        id: 'x',
        name: 'X',
        scope: 'general' as const,
        callouts: [{ target: 'actor' as const, text: 'hm' }],
      },
    ]
    expect(validateRuleset({ ...testRuleset, sideEvents })).toHaveLength(1)
  })

  it('finds tag callouts that match nothing', () => {
    const tagCallouts = [{ tag: 'ghost', callouts: [] }]
    expect(messages({ ...testRuleset, tagCallouts })).toContain('No objective has the tag "ghost"')
  })

  it('finds unreachable tiebreakers', () => {
    const tiebreakers = [
      { kind: 'manual' as const, instruction: 'Duel' },
      { kind: 'fewerDeaths' as const },
    ]
    expect(validateRuleset({ ...testRuleset, tiebreakers })).toHaveLength(1)
  })
})
