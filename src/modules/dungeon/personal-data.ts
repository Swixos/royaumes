import { inArray } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { GAME_CHANNEL_PREFIX } from './contracts'
import { openGames } from './infrastructure/schema'

/**
 * Extracts the expedition identifier of a dungeon event.
 *
 * @param event - Dungeon event.
 * @returns The expedition identifier.
 */
const gameIdOf = (event: StoredEvent) => event.stream.slice(GAME_CHANNEL_PREFIX.length)

/** Participation of a player in an expedition, as shown in the export. */
interface Participation {
  /** Expedition identifier. */
  gameId: string
  /** Whether the player opened or joined the expedition. */
  role: 'host' | 'member'
  /** Time the player opened or joined it, in milliseconds. */
  joinedAt: number
  /** Outcome of the expedition; null while it is not over. */
  result: 'won' | 'lost' | null
}

/**
 * Creates the personal data contributor of the dungeon module: the player's name, copied
 * into the events of each expedition they opened or joined. The export shows the player's
 * participations rather than the events themselves, which hold the expedition seed and the
 * names of the other players. On erasure, the open games list, which holds the host name,
 * gets the name replaced for the expeditions whose `GameCreated` event was just rewritten.
 *
 * @param store - Platform event store.
 * @param db - Database holding the open games table.
 * @returns The dungeon contributor.
 */
export function createDungeonPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'dungeon',

    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: GAME_CHANNEL_PREFIX,
        types: ['GameCreated', 'PlayerJoined', 'GameEnded'],
      })
      const games = new Map<string, Participation>()
      for (const event of stored) {
        const gameId = gameIdOf(event)
        const at = event.data.at as number
        if (event.type === 'GameCreated' && event.data.hostId === playerId) {
          games.set(gameId, { gameId, role: 'host', joinedAt: at, result: null })
        } else if (event.type === 'PlayerJoined' && event.data.playerId === playerId) {
          games.set(gameId, { gameId, role: 'member', joinedAt: at, result: null })
        } else if (event.type === 'GameEnded' && games.has(gameId)) {
          const game = games.get(gameId)
          if (game) game.result = event.data.result as 'won' | 'lost'
        }
      }
      return { expeditions: [...games.values()] }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(GAME_CHANNEL_PREFIX)) return null
      if (event.type === 'GameCreated' && event.data.hostId === playerId) {
        return event.data.hostName === ERASED_NAME ? null : { ...event.data, hostName: ERASED_NAME }
      }
      if (event.type === 'PlayerJoined' && event.data.playerId === playerId) {
        return event.data.name === ERASED_NAME ? null : { ...event.data, name: ERASED_NAME }
      }
      return null
    },

    async erase(_playerId, rewritten) {
      const hosted = rewritten
        .filter(
          (event) => event.type === 'GameCreated' && event.stream.startsWith(GAME_CHANNEL_PREFIX),
        )
        .map(gameIdOf)
      if (hosted.length === 0) return
      await db
        .update(openGames)
        .set({ hostName: ERASED_NAME })
        .where(inArray(openGames.gameId, hosted))
    },
  }
}
