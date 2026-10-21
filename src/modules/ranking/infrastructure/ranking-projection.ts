import { eq, inArray, sql } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import { gamePlayers, players } from './schema'

/**
 * Data of `GameCreated`, as read by the ranking. The events read here form the
 * published language of the realm and dungeon modules: the ranking depends on them,
 * like any reader of the log. Only the useful fields are described.
 */
interface GameCreatedData {
  /** Identifier of the host. */
  hostId: string
  /** Name of the host. */
  hostName: string
}

/** Data of `PlayerJoined`, as read by the ranking. */
interface PlayerJoinedData {
  /** Identifier of the player. */
  playerId: string
  /** Name of the player. */
  name: string
}

/** Data of `GameEnded`, as read by the ranking. */
interface GameEndedData {
  /** Outcome of the expedition. */
  result: 'won' | 'lost'
  /** Gold gathered during the expedition. */
  loot: number
}

/** Data of `VillageFounded`, as read by the ranking. */
interface VillageFoundedData {
  /** Name of the village. */
  name: string
}

/**
 * Extracts an identifier from a stream name: "dungeon-7f3a" gives "7f3a".
 *
 * @param event - Event whose stream is read.
 * @param prefix - Stream prefix published by the module.
 * @returns The identifier after the prefix.
 */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/**
 * Records the name of a player and their participation in an expedition.
 *
 * @param tx - Transaction of the current catch-up.
 * @param gameId - Expedition identifier.
 * @param playerId - Player identifier.
 * @param name - Player name.
 * @returns Resolves once both rows are written.
 */
async function recordPlayer(tx: DbTransaction, gameId: string, playerId: string, name: string) {
  await tx
    .insert(players)
    .values({ playerId, name })
    .onConflictDoUpdate({ target: players.playerId, set: { name } })
  await tx.insert(gamePlayers).values({ gameId, playerId }).onConflictDoNothing()
}

/**
 * Ranking projection: updates the totals of the players from the log. The outcome of
 * an expedition goes to its players only, companions excluded, and the list of its
 * players is dropped once it ends.
 *
 * Version 2: adds the best loot.
 */
export const rankingProjection: Projection = {
  name: 'ranking',
  version: 2,
  eventTypes: ['GameCreated', 'PlayerJoined', 'GameEnded', 'VillageFounded', 'BuildingUpgraded'],

  async apply(event, tx) {
    switch (event.type) {
      case 'GameCreated': {
        const data = event.data as unknown as GameCreatedData
        await recordPlayer(tx, idFrom(event, GAME_CHANNEL_PREFIX), data.hostId, data.hostName)
        return
      }

      case 'PlayerJoined': {
        const data = event.data as unknown as PlayerJoinedData
        await recordPlayer(tx, idFrom(event, GAME_CHANNEL_PREFIX), data.playerId, data.name)
        return
      }

      case 'GameEnded': {
        const data = event.data as unknown as GameEndedData
        const gameId = idFrom(event, GAME_CHANNEL_PREFIX)
        const rows = await tx.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId))
        const ids = rows.map((row) => row.playerId)
        if (ids.length > 0) {
          const won = data.result === 'won'
          await tx
            .update(players)
            .set({
              gamesPlayed: sql`${players.gamesPlayed} + 1`,
              gamesWon: sql`${players.gamesWon} + ${won ? 1 : 0}`,
              gold: sql`${players.gold} + ${won ? data.loot : 0}`,
              bestLoot: sql`greatest(${players.bestLoot}, ${won ? data.loot : 0})`,
            })
            .where(inArray(players.playerId, ids))
        }
        await tx.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId))
        return
      }

      case 'VillageFounded': {
        const data = event.data as unknown as VillageFoundedData
        const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
        await tx
          .insert(players)
          .values({ playerId, village: data.name })
          .onConflictDoUpdate({ target: players.playerId, set: { village: data.name } })
        return
      }

      case 'BuildingUpgraded': {
        const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
        await tx
          .insert(players)
          .values({ playerId, upgrades: 1 })
          .onConflictDoUpdate({
            target: players.playerId,
            set: { upgrades: sql`${players.upgrades} + 1` },
          })
        return
      }
    }
  },

  async reset(tx) {
    await tx.delete(gamePlayers)
    await tx.delete(players)
  },
}
