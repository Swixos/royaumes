import type { EventStore, NewEvent, StoredEvent } from '@/platform/event-store/event-store'
import type { GameRepository } from '../application/game-repository'
import { gameChannel } from '../contracts'
import { type GameEvent, replay } from '../domain/game'

/**
 * Converts an event read from the store back into a domain event.
 *
 * @param stored - Stored event.
 * @returns The domain event.
 */
const toGameEvent = (stored: StoredEvent) => ({ type: stored.type, data: stored.data }) as GameEvent

/**
 * {@link GameRepository} adapter backed by the event store. It only serves the
 * commands: the open games list is a read model kept by a projection.
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
  }
}
