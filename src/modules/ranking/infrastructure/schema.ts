import { integer, pgSchema, primaryKey, text } from 'drizzle-orm/pg-core'

/** PostgreSQL schema of the ranking module: it only holds read models. */
export const ranking = pgSchema('ranking')

/** Totals of each player, kept up to date by the ranking projection. */
export const players = ranking.table('players', {
  playerId: text('player_id').primaryKey(),
  /** Name of the player, known from dungeon events; null if they never played there. */
  name: text('name'),
  /** Name of their village, known from `VillageFounded`; null if they never founded one. */
  village: text('village'),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  upgrades: integer('upgrades').notNull().default(0),
  /** Gold brought back by the best won expedition; added by version 2 of the projection. */
  bestLoot: integer('best_loot').notNull().default(0),
})

/**
 * Players of each expedition, kept until it ends: the `GameEnded` event names the
 * expedition, and this table tells which players get its outcome. Companions never
 * appear here, since they do not arrive through `GameCreated` or `PlayerJoined`.
 */
export const gamePlayers = ranking.table(
  'game_players',
  {
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] })],
)
