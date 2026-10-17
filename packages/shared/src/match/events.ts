import { z } from 'zod'
import { IdSchema } from '../ruleset/schema'

export const PlayerSlotSchema = z.union([z.literal(1), z.literal(2)])
export type PlayerSlot = z.infer<typeof PlayerSlotSchema>

const MatchTimeSchema = z.number().int().nonnegative()

export const EventBodySchema = z.discriminatedUnion('type', [
  /** The clock starts at `at + countdownMs`. */
  z.object({ type: z.literal('match.started'), countdownMs: z.number().int().nonnegative() }),
  z.object({ type: z.literal('clock.paused') }),
  z.object({ type: z.literal('clock.resumed') }),
  z.object({
    type: z.literal('objective.completed'),
    player: PlayerSlotSchema,
    objectiveId: IdSchema,
    variantIds: z.array(IdSchema),
  }),
  z.object({ type: z.literal('death'), player: PlayerSlotSchema, variantIds: z.array(IdSchema) }),
  z.object({
    type: z.literal('penalty'),
    player: PlayerSlotSchema,
    /** Absent for ad-hoc penalties. */
    penaltyId: IdSchema.optional(),
    reason: z.string().optional(),
    deduction: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('sideEvent'),
    /** Absent for general side events. */
    player: PlayerSlotSchema.optional(),
    sideEventId: IdSchema,
  }),
  z.object({ type: z.literal('match.timeExpired') }),
  z.object({ type: z.literal('match.endedByHost'), reason: z.string().optional() }),
  z.object({ type: z.literal('tiebreaker.resolved'), winner: PlayerSlotSchema }),
  // Corrections. Rows are never deleted; a correction is appended instead.
  z.object({ type: z.literal('event.voided'), targetSeq: z.number().int().positive() }),
  z.object({
    type: z.literal('event.amended'),
    targetSeq: z.number().int().positive(),
    changes: z.object({
      variantIds: z.array(IdSchema).optional(),
      matchTimeMs: MatchTimeSchema.optional(),
      player: PlayerSlotSchema.optional(),
    }),
  }),
])
export type EventBody = z.infer<typeof EventBodySchema>
export type EventType = EventBody['type']
export type EventOf<T extends EventType> = Extract<EventBody, { type: T }>

export const MatchEventSchema = z.object({
  /** 1, 2, 3… per match, without gaps. */
  seq: z.number().int().positive(),
  /** Server wall-clock time. */
  at: z.iso.datetime(),
  /** Match clock when it happened. */
  matchTimeMs: MatchTimeSchema,
  body: EventBodySchema,
})
export type MatchEvent = z.infer<typeof MatchEventSchema>

/** An event produced by `decide`, before the server assigns `seq` and `at`. */
export type NewEvent = { matchTimeMs: number; body: EventBody }

/** Events the host can undo (void). Clock events are deliberately not on the undo stack. */
export const UNDOABLE_EVENT_TYPES = [
  'objective.completed',
  'death',
  'penalty',
  'sideEvent',
  'match.endedByHost',
  'tiebreaker.resolved',
  'event.amended',
] as const satisfies readonly EventType[]

export function isUndoable(body: EventBody): boolean {
  return (UNDOABLE_EVENT_TYPES as readonly EventType[]).includes(body.type)
}
