import { eq } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import { HARBOR_CHANNEL_PREFIX } from '@/modules/fleet/contracts'
import { STARTING_LEVELS, VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import type { Deed, LevelSteps } from '../domain/quests'
import { expeditions, progress } from './schema'

/** Data of an event, read field by field: the events form the published language of their module. */
type Data = Record<string, unknown>

/**
 * Time of an event: the time written by its module, or failing that the time it was
 * recorded in the log.
 *
 * @param event - Event to date.
 * @returns The time, in milliseconds.
 */
const timeOf = (event: StoredEvent) =>
  typeof event.data.at === 'number' ? event.data.at : event.occurredAt.getTime()

/**
 * Reads the progress of a player, inside the current catch-up.
 *
 * @param tx - Transaction of the current catch-up.
 * @param playerId - Player identifier.
 * @returns Their progress, empty if none was recorded yet.
 */
async function load(tx: DbTransaction, playerId: string) {
  const [row] = await tx.select().from(progress).where(eq(progress.playerId, playerId))
  return row ?? { playerId, levels: {} as Record<string, LevelSteps>, deeds: [] as Deed[] }
}

/**
 * Writes the progress of a player.
 *
 * @param tx - Transaction of the current catch-up.
 * @param row - Progress to write.
 * @returns Resolves once written.
 */
async function save(tx: DbTransaction, row: typeof progress.$inferSelect) {
  await tx
    .insert(progress)
    .values(row)
    .onConflictDoUpdate({
      target: progress.playerId,
      set: { levels: row.levels, deeds: row.deeds },
    })
}

/**
 * Records a fact achieved by a player; achieving it again changes nothing.
 *
 * @param tx - Transaction of the current catch-up.
 * @param playerId - Player identifier.
 * @param deed - Fact achieved.
 * @returns Resolves once written.
 */
async function achieve(tx: DbTransaction, playerId: string, deed: Deed) {
  const row = await load(tx, playerId)
  if (row.deeds.includes(deed)) return
  await save(tx, { ...row, deeds: [...row.deeds, deed] })
}

/**
 * Records a level reached by a building of a player, with the time it completes.
 *
 * @param tx - Transaction of the current catch-up.
 * @param playerId - Player identifier.
 * @param building - Building raised.
 * @param level - Level reached.
 * @param at - Completion time of the construction.
 * @returns Resolves once written.
 */
async function raise(
  tx: DbTransaction,
  playerId: string,
  building: string,
  level: number,
  at: number,
) {
  const row = await load(tx, playerId)
  const steps = row.levels[building] ?? []
  if (steps.some(([reached]) => reached === level)) return
  await save(tx, { ...row, levels: { ...row.levels, [building]: [...steps, [level, at]] } })
}

/**
 * Progress projection of the tutorial: reads, in the published language of the realm,
 * fleet, market and dungeon modules, what each player achieved that a quest may ask for.
 */
export const progressProjection: Projection = {
  name: 'tutorial-progress',
  version: 1,
  eventTypes: [
    'VillageFounded',
    'BuildingUpgraded',
    'PostureChosen',
    'BattleReported',
    'RaidLaunched',
    'OfferPublished',
    'GameCreated',
    'PlayerJoined',
    'GameEnded',
  ],

  async apply(event, tx) {
    const data = event.data as Data
    switch (event.type) {
      case 'VillageFounded': {
        const playerId = event.stream.slice(VILLAGE_CHANNEL_PREFIX.length)
        for (const [building, level] of Object.entries(STARTING_LEVELS)) {
          if (level > 0) await raise(tx, playerId, building, level, timeOf(event))
        }
        return
      }
      case 'BuildingUpgraded': {
        const playerId = event.stream.slice(VILLAGE_CHANNEL_PREFIX.length)
        const at = typeof data.completesAt === 'number' ? data.completesAt : timeOf(event)
        await raise(tx, playerId, String(data.building), Number(data.toLevel), at)
        return
      }
      case 'PostureChosen':
        await achieve(tx, event.stream.slice(HARBOR_CHANNEL_PREFIX.length), 'posture')
        return
      case 'BattleReported':
        if (data.role === 'attacker' && data.won === true) {
          await achieve(tx, event.stream.slice(HARBOR_CHANNEL_PREFIX.length), 'navalVictory')
        }
        return
      case 'RaidLaunched':
        if ((data.target as { kind?: string })?.kind === 'pirates') {
          await achieve(tx, String(data.attackerId), 'pirateRaid')
        }
        return
      case 'OfferPublished':
        await achieve(tx, String(data.sellerId), 'offer')
        return
      case 'GameCreated':
      case 'PlayerJoined': {
        const gameId = event.stream.slice(GAME_CHANNEL_PREFIX.length)
        const playerId = String(event.type === 'GameCreated' ? data.hostId : data.playerId)
        await tx.insert(expeditions).values({ gameId, playerId }).onConflictDoNothing()
        await achieve(tx, playerId, 'expedition')
        return
      }
      case 'GameEnded': {
        const gameId = event.stream.slice(GAME_CHANNEL_PREFIX.length)
        if (data.result === 'won') {
          const players = await tx.select().from(expeditions).where(eq(expeditions.gameId, gameId))
          for (const player of players) await achieve(tx, player.playerId, 'expeditionWon')
        }
        await tx.delete(expeditions).where(eq(expeditions.gameId, gameId))
        return
      }
    }
  },

  async reset(tx) {
    await tx.delete(progress)
    await tx.delete(expeditions)
  },
}
