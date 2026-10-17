import { z } from 'zod'
import { IdSchema } from '../ruleset/schema'
import { PlayerSlotSchema } from './events'

/**
 * Optional backdating for logging commands, e.g. "that happened two minutes ago".
 * Without it the event is stamped with the current match time.
 */
const At = { matchTimeMs: z.number().int().nonnegative().optional() }

export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), countdownMs: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({
    type: z.literal('completeObjective'),
    player: PlayerSlotSchema,
    objectiveId: IdSchema,
    variantIds: z.array(IdSchema).optional(),
    ...At,
  }),
  z.object({
    type: z.literal('logDeath'),
    player: PlayerSlotSchema,
    variantIds: z.array(IdSchema).optional(),
    ...At,
  }),
  z.object({
    type: z.literal('givePenalty'),
    player: PlayerSlotSchema,
    /** A predefined penalty, or omit for an ad-hoc one with `reason` and `deduction`. */
    penaltyId: IdSchema.optional(),
    reason: z.string().min(1).optional(),
    deduction: z.number().int().nonnegative().optional(),
    ...At,
  }),
  z.object({
    type: z.literal('logSideEvent'),
    player: PlayerSlotSchema.optional(),
    sideEventId: IdSchema,
    ...At,
  }),
  z.object({
    type: z.literal('setVariants'),
    targetSeq: z.number().int().positive(),
    variantIds: z.array(IdSchema),
  }),
  /** The client names the event to undo, so two hosts can never undo the wrong one. */
  z.object({ type: z.literal('undo'), targetSeq: z.number().int().positive() }),
  z.object({
    type: z.literal('amend'),
    targetSeq: z.number().int().positive(),
    changes: z.object({
      matchTimeMs: z.number().int().nonnegative().optional(),
      player: PlayerSlotSchema.optional(),
    }),
  }),
  z.object({ type: z.literal('endMatch'), reason: z.string().optional() }),
  z.object({ type: z.literal('resolveTiebreaker'), winner: PlayerSlotSchema }),
])
export type Command = z.infer<typeof CommandSchema>
export type CommandType = Command['type']

export const DEFAULT_COUNTDOWN_MS = 3_000
