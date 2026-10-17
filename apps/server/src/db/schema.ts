import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { CachedMatchStatus, EventBody, PlayerSetup, Ruleset } from '@dst/shared'

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: text('created_at').notNull(),
})

export const rulesets = sqliteTable('rulesets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** The full ruleset document, validated with Zod on the way in. */
  definition: text('definition', { mode: 'json' }).$type<Ruleset>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const matches = sqliteTable(
  'matches',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id'),
    bracketNodeId: text('bracket_node_id'),
    player1Id: text('player1_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    player2Id: text('player2_id')
      .notNull()
      .references(() => players.id, { onDelete: 'restrict' }),
    playerSetup: text('player_setup', { mode: 'json' })
      .$type<[PlayerSetup, PlayerSetup]>()
      .notNull(),
    /** The ruleset it was created from. Informational only; the snapshot is what counts. */
    rulesetId: text('ruleset_id'),
    rulesetSnapshot: text('ruleset_snapshot', { mode: 'json' }).$type<Ruleset>().notNull(),
    // Cache for list views, rewritten after every command. The events are the truth.
    status: text('status').$type<CachedMatchStatus>().notNull(),
    winnerSlot: integer('winner_slot').$type<1 | 2>(),
    score1: integer('score1').notNull().default(0),
    score2: integer('score2').notNull().default(0),
    createdAt: text('created_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (t) => [
    index('matches_status_idx').on(t.status),
    index('matches_tournament_idx').on(t.tournamentId),
  ],
)

export const matchEvents = sqliteTable(
  'match_events',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    at: text('at').notNull(),
    matchTimeMs: integer('match_time_ms').notNull(),
    body: text('body', { mode: 'json' }).$type<EventBody>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.seq] })],
)
