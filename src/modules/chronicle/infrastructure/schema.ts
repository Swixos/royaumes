import { bigint, index, integer, jsonb, pgSchema, primaryKey, text } from 'drizzle-orm/pg-core'
import type { Amounts, Fact } from '../domain/entry'

/** PostgreSQL schema of the chronicle module: it only holds read models. */
export const chronicle = pgSchema('chronicle')

/**
 * Entries of the chronicle of every player, kept up to date by the chronicle projection.
 * An event gives at most one entry to each player it concerns, so the player and the
 * position of the event identify an entry.
 */
export const entries = chronicle.table(
  'entries',
  {
    playerId: text('player_id').notNull(),
    position: integer('position').notNull(),
    /** Type of the fact, which also gives its part of the game. */
    type: text('type').notNull(),
    at: bigint('at', { mode: 'number' }).notNull(),
    /** Data of the fact, without its type. */
    data: jsonb('data').$type<Omit<Fact, 'type'>>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.position] }),
    index('entries_player_type_idx').on(t.playerId, t.type),
  ],
)

/**
 * Raids known from their launch: the later events of a raid name only the raid, and the
 * chronicle needs its attacker and its target.
 */
export const raids = chronicle.table('raids', {
  raidId: text('raid_id').primaryKey(),
  attackerId: text('attacker_id').notNull(),
  attackerName: text('attacker_name').notNull(),
  targetName: text('target_name').notNull(),
})

/**
 * Players of each expedition, with the name of its host, kept until it ends: the end of
 * an expedition names only the expedition.
 */
export const expeditions = chronicle.table(
  'expeditions',
  {
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
    hostName: text('host_name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] })],
)

/**
 * Offers of the market known from their publication, with their buyer once accepted: the
 * end of a trade names only the offer.
 */
export const offers = chronicle.table('offers', {
  offerId: text('offer_id').primaryKey(),
  sellerId: text('seller_id').notNull(),
  sellerName: text('seller_name').notNull(),
  give: jsonb('give').$type<Amounts>().notNull(),
  want: jsonb('want').$type<Amounts>().notNull(),
  buyerId: text('buyer_id'),
  buyerName: text('buyer_name'),
})
