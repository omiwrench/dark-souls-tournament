import type { Callout, Ruleset } from './schema'

export type RulesetIssue = { path: string; message: string }

/** Checks the rules a schema can't express. An empty list means the ruleset is usable. */
export function validateRuleset(ruleset: Ruleset): RulesetIssue[] {
  const issues: RulesetIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })

  const checkUniqueIds = (path: string, items: { id: string }[]) => {
    const seen = new Set<string>()
    for (const item of items) {
      if (seen.has(item.id)) add(path, `Duplicate id "${item.id}"`)
      seen.add(item.id)
    }
  }

  checkUniqueIds('categories', ruleset.categories)
  checkUniqueIds('objectives', ruleset.objectives)
  checkUniqueIds('penalties', ruleset.penalties)
  checkUniqueIds('sideEvents', ruleset.sideEvents)
  checkUniqueIds('deaths.variants', ruleset.deaths.variants)

  const categoryIds = new Set(ruleset.categories.map((c) => c.id))
  ruleset.objectives.forEach((objective, i) => {
    const path = `objectives[${i}]`
    if (!categoryIds.has(objective.categoryId)) {
      add(`${path}.categoryId`, `Unknown category "${objective.categoryId}"`)
    }
    if (objective.endsMatch && objective.repeat.kind !== 'once') {
      add(`${path}.repeat`, 'A match-ending objective must be once-only')
    }
    checkUniqueIds(`${path}.variants`, objective.variants)
  })

  if (ruleset.timeLimitMs === null && !ruleset.objectives.some((o) => o.endsMatch)) {
    add('timeLimitMs', 'The match needs a time limit or at least one match-ending objective')
  }

  const actorless = (callouts: Callout[]) =>
    callouts.some((c) => c.target === 'actor' || c.target === 'opponent')
  ruleset.sideEvents.forEach((sideEvent, i) => {
    if (sideEvent.scope === 'general' && actorless(sideEvent.callouts)) {
      add(
        `sideEvents[${i}].callouts`,
        'A general side event has no player, so its callouts can only target players or everyone',
      )
    }
  })
  ruleset.tagCallouts.forEach((tagCallout, i) => {
    if (!ruleset.objectives.some((o) => o.tags.includes(tagCallout.tag))) {
      add(`tagCallouts[${i}].tag`, `No objective has the tag "${tagCallout.tag}"`)
    }
  })

  const manualIndex = ruleset.tiebreakers.findIndex((t) => t.kind === 'manual')
  if (manualIndex !== -1 && manualIndex < ruleset.tiebreakers.length - 1) {
    add('tiebreakers', 'Tiebreakers after a manual tiebreaker can never be reached')
  }

  return issues
}
