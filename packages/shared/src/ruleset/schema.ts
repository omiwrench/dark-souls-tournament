import { z } from 'zod'

/** Stable identifier inside a ruleset (objective, variant, …). Events refer to these. */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes')

export const DrinksSchema = z.object({
  kind: z.enum(['sip', 'shot', 'finish']),
  amount: z.number().int().positive(),
})
export type Drinks = z.infer<typeof DrinksSchema>
export type DrinkKind = Drinks['kind']

export const CalloutSchema = z.object({
  /**
   * Who the callout is for. `actor` is the player the event is about,
   * `players` means both players, `everyone` includes the room.
   */
  target: z.enum(['actor', 'opponent', 'players', 'everyone']),
  /** Supports the placeholders `{player}` (the actor) and `{opponent}`. */
  text: z.string().min(1),
  drinks: DrinksSchema.optional(),
})
export type Callout = z.infer<typeof CalloutSchema>
export type CalloutTarget = Callout['target']

export const VariantSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  bonusPoints: z.number().int().default(0),
  callouts: z.array(CalloutSchema).default([]),
  /** `replace` suppresses the base event's own callouts (tag callouts still fire). */
  calloutMode: z.enum(['add', 'replace']).default('add'),
})
export type Variant = z.infer<typeof VariantSchema>

export const ObjectiveSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: IdSchema,
  points: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1)).default([]),
  repeat: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('once') }),
      z.object({ kind: z.literal('repeatable'), max: z.number().int().positive().optional() }),
    ])
    .default({ kind: 'once' }),
  endsMatch: z.boolean().default(false),
  variants: z.array(VariantSchema).default([]),
  callouts: z.array(CalloutSchema).default([]),
})
export type Objective = z.infer<typeof ObjectiveSchema>

export const PenaltySchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** Points removed from the player's score. 0 = callouts only. */
  deduction: z.number().int().nonnegative().default(0),
  callouts: z.array(CalloutSchema).default([]),
})
export type Penalty = z.infer<typeof PenaltySchema>

export const SideEventSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** `player`: the host picks who did it. `general`: about nobody in particular. */
  scope: z.enum(['player', 'general']),
  callouts: z.array(CalloutSchema).default([]),
})
export type SideEvent = z.infer<typeof SideEventSchema>

export const TiebreakerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('endedMatch') }),
  z.object({ kind: z.literal('fewerDeaths') }),
  z.object({ kind: z.literal('fewerPenalties') }),
  z.object({ kind: z.literal('firstToFinalScore') }),
  z.object({ kind: z.literal('manual'), instruction: z.string().min(1) }),
])
export type Tiebreaker = z.infer<typeof TiebreakerSchema>
export type TiebreakerKind = Tiebreaker['kind']

export const RulesetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  /** `null` = no time limit. */
  timeLimitMs: z.number().int().positive().nullable(),
  categories: z.array(z.object({ id: IdSchema, name: z.string().min(1) })),
  objectives: z.array(ObjectiveSchema),
  deaths: z
    .object({
      /** Points removed per death. 0 = deaths are only counted. */
      deduction: z.number().int().nonnegative().default(0),
      callouts: z.array(CalloutSchema).default([]),
      variants: z.array(VariantSchema).default([]),
    })
    .default({ deduction: 0, callouts: [], variants: [] }),
  penalties: z.array(PenaltySchema).default([]),
  sideEvents: z.array(SideEventSchema).default([]),
  tagCallouts: z
    .array(z.object({ tag: z.string().min(1), callouts: z.array(CalloutSchema) }))
    .default([]),
  /** Checked in order. A manual decision is always the implied final fallback. */
  tiebreakers: z.array(TiebreakerSchema).default([]),
})
export type Ruleset = z.infer<typeof RulesetSchema>
/** Ruleset as authored, before defaults are filled in. */
export type RulesetInput = z.input<typeof RulesetSchema>
