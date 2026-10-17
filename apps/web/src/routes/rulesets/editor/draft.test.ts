import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { bellRush } from '@dst/shared'
import { blankRuleset, collectIssues, describePath, focus, move, type Updater } from './draft'

describe('ruleset draft helpers', () => {
  it('focuses an updater on part of the draft', () => {
    let state = { a: { list: [1, 2, 3] } }
    const update: Updater<typeof state> = (recipe) => {
      state = produce(state, recipe)
    }
    focus(update, (d) => d.a.list)((list) => move(list, 0, 1))
    expect(state.a.list).toEqual([2, 1, 3])
  })

  it('accepts a blank ruleset and Bell Rush', () => {
    expect(collectIssues(blankRuleset())).toEqual([])
    expect(collectIssues(bellRush)).toEqual([])
  })

  it('reports schema problems with readable paths', () => {
    const draft = produce(bellRush, (d) => {
      d.objectives[4]!.name = ''
    })
    const [issue] = collectIssues(draft)
    expect(issue).toEqual({ path: 'objectives.4.name', message: "Can't be empty" })
    expect(describePath(draft, issue!.path)).toBe('Objective #5 › name')
    expect(describePath(bellRush, 'objectives[4].repeat')).toBe(
      'Objective "Chaos Witch Quelaag" › repeat',
    )
    expect(describePath(bellRush, 'timeLimitMs')).toBe('Time limit')
    expect(describePath(bellRush, 'deaths.variants.0.name')).toBe('Deaths › variants › name')
  })
})
