import { bigint, boolean, index, integer, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/** PostgreSQL schema of the fleet module. Its events stay in the platform log. */
export const fleet = pgSchema('fleet')

/**
 * Villages that may be raided, kept up to date by the fleet projection from the village
 * events: their name, and the number of building upgrades that sets their defense.
 */
export const harbors = fleet.table('harbors', {
  playerId: text('player_id').primaryKey(),
  villageName: text('village_name').notNull(),
  upgrades: integer('upgrades').notNull().default(0),
})

/**
 * Raids of every player, kept up to date by the fleet projection: they serve the list of
 * raids, the count of fleets at sea, the daily treasure of the islands and the memory of
 * the pirate captains.
 */
export const raids = fleet.table(
  'raids',
  {
    raidId: text('raid_id').primaryKey(),
    attackerId: text('attacker_id').notNull(),
    attackerName: text('attacker_name').notNull(),
    /** `village` or `pirates`. */
    targetKind: text('target_kind').notNull(),
    /** Owner of the targeted village, or identifier of the island. */
    targetId: text('target_id').notNull(),
    targetName: text('target_name').notNull(),
    ships: integer('ships').notNull(),
    tactic: text('tactic').notNull(),
    status: text('status').notNull(),
    launchedAt: bigint('launched_at', { mode: 'number' }).notNull(),
    sailedAt: bigint('sailed_at', { mode: 'number' }).notNull().default(0),
    arrivesAt: bigint('arrives_at', { mode: 'number' }).notNull().default(0),
    /** Battle outcome for the attacker; null before the battle. */
    victory: boolean('victory'),
    loot: jsonb('loot'),
  },
  (t) => [index('raids_attacker_idx').on(t.attackerId), index('raids_target_idx').on(t.targetId)],
)
