import { bigint, index, integer, pgSchema, text } from 'drizzle-orm/pg-core'

/** PostgreSQL schema of the dungeon module. Its events stay in the platform log. */
export const dungeon = pgSchema('dungeon')

/**
 * Expeditions neither started nor ended, kept up to date by the open games
 * projection. An expedition leaves the table as soon as it starts. The index on the
 * creation time lets the query read recent expeditions only, without walking those
 * abandoned long ago.
 */
export const openGames = dungeon.table(
  'open_games',
  {
    gameId: text('game_id').primaryKey(),
    hostName: text('host_name').notNull(),
    /** Number of heroes, companions included. */
    heroCount: integer('hero_count').notNull(),
    /** Creation time, in milliseconds, like the `at` field of events. */
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('open_games_created_at_idx').on(t.createdAt)],
)
