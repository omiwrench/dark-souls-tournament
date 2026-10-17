import type { z } from 'zod'
import { type Ruleset, RulesetSchema, validateRuleset } from '@dst/shared'

/**
 * Applies a change to a draft. With Immer, `recipe` may mutate the draft it is given;
 * the result is still a new, immutable object.
 */
export type Updater<T> = (recipe: (draft: T) => void) => void

/** Narrows an updater to one part of the draft, so nested editors don't need the whole tree. */
export function focus<T, U>(update: Updater<T>, select: (draft: T) => U): Updater<U> {
  return (recipe) => update((draft) => recipe(select(draft)))
}

/** Moves an item one step up (-1) or down (+1) in place. */
export function move<T>(list: T[], index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target]!, list[index]!]
}

/**
 * Ids only need to be unique within the ruleset; matches keep their own snapshot, so ids
 * can never break history. Short random ones keep things simple.
 */
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

export function blankRuleset(): Ruleset {
  const category = newId('cat')
  return {
    id: '',
    name: 'New ruleset',
    timeLimitMs: 60 * 60_000,
    categories: [{ id: category, name: 'Objectives' }],
    objectives: [],
    deaths: { deduction: 0, callouts: [], variants: [] },
    penalties: [],
    sideEvents: [],
    tagCallouts: [],
    tiebreakers: [],
  }
}

export type Issue = { path: string; message: string }

/** Schema problems first (missing names, negative points…), then the cross-field rules. */
export function collectIssues(draft: Ruleset): Issue[] {
  // A new ruleset has no id until the server assigns one.
  const parsed = RulesetSchema.safeParse({ ...draft, id: draft.id || 'new' })
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: friendly(i) }))
  }
  return validateRuleset(parsed.data)
}

/** Zod's default messages are written for developers. */
function friendly(issue: z.core.$ZodIssue): string {
  if (issue.code === 'too_small') {
    if (issue.origin === 'string') return "Can't be empty"
    if (issue.origin === 'number') return `Must be at least ${issue.minimum}`
  }
  if (issue.code === 'invalid_format' && issue.format === 'regex') {
    return 'Use lowercase letters, digits and dashes'
  }
  return issue.message
}

const COLLECTIONS: Record<string, { label: string; named: boolean }> = {
  objectives: { label: 'Objective', named: true },
  categories: { label: 'Category', named: true },
  penalties: { label: 'Penalty', named: true },
  sideEvents: { label: 'Side event', named: true },
  tagCallouts: { label: 'Tag callout', named: false },
  tiebreakers: { label: 'Tiebreakers', named: false },
}

/** Turns `objectives[3].callouts.0.text` into `Objective "Taurus Demon" › callouts › text`. */
export function describePath(ruleset: Ruleset, path: string): string {
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  const [head, index, ...rest] = parts
  if (!head) return 'Ruleset'
  const collection = COLLECTIONS[head]
  let label: string
  if (collection && index !== undefined && /^\d+$/.test(index)) {
    const item = (ruleset[head as keyof Ruleset] as { name?: string }[])[Number(index)]
    label =
      collection.named && item?.name
        ? `${collection.label} "${item.name}"`
        : `${collection.label} #${Number(index) + 1}`
  } else {
    label = { timeLimitMs: 'Time limit', name: 'Name', deaths: 'Deaths' }[head] ?? head
    if (index !== undefined) rest.unshift(index)
  }
  const detail = rest.filter((p) => !/^\d+$/.test(p))
  return [label, ...detail].join(' › ')
}
