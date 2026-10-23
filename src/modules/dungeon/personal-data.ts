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

/**
 * Rewrites a dungeon event with a new name of the player: their name as host of an
 * expedition, or as a player who joined one. It serves both erasure, with the neutral
 * name, and rectification.
 *
 * @param event - Candidate event.
 * @param playerId - Identifier of the player.
 * @param name - Name to write.
 * @returns The rewritten data, or null if the event holds no copy of the player's name.
 */
function renameInGame(event: StoredEvent, playerId: string, name: string) {
  if (!event.stream.startsWith(GAME_CHANNEL_PREFIX)) return null
  if (event.type === 'GameCreated' && event.data.hostId === playerId) {
    return event.data.hostName === name ? null : { ...event.data, hostName: name }
  }
  if (event.type === 'PlayerJoined' && event.data.playerId === playerId) {
    return event.data.name === name ? null : { ...event.data, name }
  }
  return null
}

/**
 * Updates the host name of the open expeditions hosted by the player, found among the
 * rewritten events.
 *
 * @param db - Database holding the open expeditions.
 * @param rewritten - Rewritten events.
 * @param name - Name to write.
 * @returns Resolves once the table is updated.
 */
async function renameHost(db: Db, rewritten: StoredEvent[], name: string) {
  const hosted = rewritten
    .filter((event) => event.type === 'GameCreated' && event.stream.startsWith(GAME_CHANNEL_PREFIX))
    .map(gameIdOf)
  if (hosted.length === 0) return
  await db.update(openGames).set({ hostName: name }).where(inArray(openGames.gameId, hosted))
}

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
 * gets the name replaced for the expeditions whose `GameCreated` event was just rewritten;
 * a rectification of the name updates the same rows with the new name.
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

    rename: renameInGame,

    redact: (event, playerId) => renameInGame(event, playerId, ERASED_NAME),

    async erase(_playerId, rewritten) {
      await renameHost(db, rewritten, ERASED_NAME)
    },

    async rectify(_playerId, name, rewritten) {
      await renameHost(db, rewritten, name)
    },
  }
}
