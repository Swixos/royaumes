import { jsonb, pgSchema, primaryKey, text } from 'drizzle-orm/pg-core'
import type { Deed, LevelSteps } from '../domain/quests'

/** PostgreSQL schema of the tutorial module: its events stay in the platform log. */
export const tutorial = pgSchema('tutorial')

/**
 * What each player achieved, kept up to date by the progress projection from the events
 * of the other modules: the levels reached by their buildings, and the facts of the game
 * the quests ask for.
 */
export const progress = tutorial.table('progress', {
  playerId: text('player_id').primaryKey(),
  levels: jsonb('levels').$type<Record<string, LevelSteps>>().notNull().default({}),
  deeds: jsonb('deeds').$type<Deed[]>().notNull().default([]),
})

/** Players of each expedition, kept until it ends: its end names only the expedition. */
export const expeditions = tutorial.table(
  'expeditions',
  {
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] })],
)
