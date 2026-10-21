import { eq, sql } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { GAME_CHANNEL_PREFIX } from '../contracts'
import type { GameEvent } from '../domain/game'
import { openGames } from './schema'

/**
 * Extracts the expedition identifier from its stream name: "dungeon-7f3a" gives "7f3a".
 *
 * @param event - Event of an expedition.
 * @returns The expedition identifier.
 */
const gameIdOf = (event: StoredEvent) => event.stream.slice(GAME_CHANNEL_PREFIX.length)

/**
 * Projection of the open expeditions. It reads the module's own events, so they are
 * typed by the domain rather than described again as in the ranking. A companion takes
 * a seat like a player and counts as a hero; an expedition that started, or ended
 * without starting, can no longer be joined.
 */
export const openGamesProjection: Projection = {
  name: 'dungeon-open-games',
  version: 1,
  eventTypes: ['GameCreated', 'PlayerJoined', 'CompanionAdded', 'GameStarted', 'GameEnded'],

  async apply(stored, tx) {
    const event = { type: stored.type, data: stored.data } as GameEvent
    const gameId = gameIdOf(stored)

    switch (event.type) {
      case 'GameCreated':
        await tx
          .insert(openGames)
          .values({ gameId, hostName: event.data.hostName, heroCount: 1, createdAt: event.data.at })
        return

      case 'PlayerJoined':
      case 'CompanionAdded':
        await tx
          .update(openGames)
          .set({ heroCount: sql`${openGames.heroCount} + 1` })
          .where(eq(openGames.gameId, gameId))
        return

      case 'GameStarted':
      case 'GameEnded':
        await tx.delete(openGames).where(eq(openGames.gameId, gameId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(openGames)
  },
}
