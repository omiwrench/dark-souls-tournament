import { z } from 'zod'
import { CommandSchema } from '../match/commands'
import { type MatchEvent, MatchEventSchema, type PlayerSlot } from '../match/events'
import { type Ruleset, RulesetSchema } from '../ruleset/schema'
import { DS1_CLASSES, DS1_GIFTS } from '../ds1'

// Request bodies (validated by the server)

const PlayerNameSchema = z.string().trim().min(1).max(40)
const PlayerColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .nullable()

export const PlayerInputSchema = z.object({
  name: PlayerNameSchema,
  color: PlayerColorSchema.default(null),
})
export type PlayerInput = z.input<typeof PlayerInputSchema>

/** Without defaults, so a partial update never resets fields it doesn't mention. */
export const PlayerPatchSchema = z.object({
  name: PlayerNameSchema.optional(),
  color: PlayerColorSchema.optional(),
})

/** A ruleset as sent by the editor. The server owns the id. */
export const RulesetInputSchema = RulesetSchema.omit({ id: true })
export type RulesetBody = z.input<typeof RulesetInputSchema>

export const PlayerSetupSchema = z.object({
  class: z.enum(DS1_CLASSES).optional(),
  gift: z.enum(DS1_GIFTS).optional(),
})
export type PlayerSetup = z.infer<typeof PlayerSetupSchema>

export const CreateMatchSchema = z
  .object({
    player1Id: z.string().min(1),
    player2Id: z.string().min(1),
    rulesetId: z.string().min(1),
    playerSetup: z.tuple([PlayerSetupSchema, PlayerSetupSchema]).default([{}, {}]),
  })
  .refine((m) => m.player1Id !== m.player2Id, 'A player cannot play against themselves')
export type CreateMatchInput = z.input<typeof CreateMatchSchema>

export { CommandSchema }

// Responses

export type PlayerRecord = { id: string; name: string; color: string | null; createdAt: string }

export type RulesetSummary = {
  id: string
  name: string
  description?: string
  objectiveCount: number
  updatedAt: string
}

export type RulesetRecord = { ruleset: Ruleset; updatedAt: string }

export type CachedMatchStatus = 'ready' | 'live' | 'paused' | 'tiebreaker' | 'finished'

export type MatchSummary = {
  id: string
  tournamentId: string | null
  players: [PlayerRecord, PlayerRecord]
  rulesetName: string
  status: CachedMatchStatus
  winner: PlayerSlot | null
  scores: [number, number]
  createdAt: string
  finishedAt: string | null
}

export type MatchDetail = MatchSummary & {
  playerSetup: [PlayerSetup, PlayerSetup]
  ruleset: Ruleset
  events: MatchEvent[]
}

export type CommandResponse = { events: MatchEvent[] }

export type ApiError = {
  error: { code: string; message: string; issues?: { path: string; message: string }[] }
}

// WebSocket messages

export const ClientMessageSchema = z.union([
  z.object({
    type: z.literal('subscribe'),
    topic: z.literal('match'),
    id: z.string().min(1),
    /** Last seq the client has. The server sends everything after it. */
    sinceSeq: z.number().int().nonnegative().default(0),
  }),
  z.object({ type: z.literal('subscribe'), topic: z.literal('matches') }),
  z.object({ type: z.literal('unsubscribe'), topic: z.literal('match'), id: z.string().min(1) }),
  z.object({ type: z.literal('unsubscribe'), topic: z.literal('matches') }),
])
export type ClientMessage = z.input<typeof ClientMessageSchema>

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), serverNow: z.number() }),
  z.object({
    type: z.literal('match.events'),
    matchId: z.string(),
    events: z.array(MatchEventSchema),
  }),
  /** Something in the match list changed (created, deleted, status or score). Refetch. */
  z.object({ type: z.literal('matches.changed') }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>
