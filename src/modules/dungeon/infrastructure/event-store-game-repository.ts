import type { EventStore, NewEvent, StoredEvent } from '@/platform/event-store/event-store'
import type { GameRepository } from '../application/game-repository'
import { GAME_CHANNEL_PREFIX, gameChannel } from '../contracts'
import { type GameEvent, replay } from '../domain/game'
import { openGames } from '../domain/lobby'

/**
 * Converts an event read from the store back into a domain event.
 *
 * @param stored - Stored event.
 * @returns The domain event.
 */
const toGameEvent = (stored: StoredEvent) => ({ type: stored.type, data: stored.data }) as GameEvent

/**
 * {@link GameRepository} adapter backed by the event store. The open games list
 * only rereads the three event types it needs, across every expedition.
 *
 * @param store - Platform event store.
 * @returns The game repository.
 */
export function createEventStoreGameRepository(store: EventStore): GameRepository {
  return {
    async load(gameId) {
      const stored = await store.read(gameChannel(gameId))
      return { state: replay(stored.map(toGameEvent)), version: stored.at(-1)?.version ?? 0 }
    },

    async save(gameId, expectedVersion, events) {
      await store.append(gameChannel(gameId), expectedVersion, events as unknown as NewEvent[])
    },

    async listOpenGames(now) {
      // DETTE TECHNIQUE DT-005 (docs/qualite/dette-technique.md): the list is recomputed on every
      // read from the history of every expedition ever opened.
      const stored = await store.readAll({
        streamPrefix: GAME_CHANNEL_PREFIX,
        types: ['GameCreated', 'PlayerJoined', 'GameStarted'],
      })
      const events = stored.map((event) => ({
        gameId: event.stream.slice(GAME_CHANNEL_PREFIX.length),
        event: toGameEvent(event),
      }))
      return openGames(events, now)
    },
  }
}
