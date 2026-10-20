import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { VillageRepository } from '../application/village-repository'
import { replay, type VillageEvent } from '../domain/village'

/**
 * Builds the name of the stream holding a player's village events.
 *
 * @param userId - Player identifier.
 * @returns The stream name, `village-<userId>`.
 */
export const villageStream = (userId: string) => `village-${userId}`

/**
 * {@link VillageRepository} adapter backed by the event store. It translates
 * between typed domain events and the generic platform events, whose types and
 * structure the platform does not know. The stream version is the version of
 * its last event, or 0 when empty.
 *
 * @param store - Platform event store.
 * @returns The village repository.
 */
export function createEventStoreVillageRepository(store: EventStore): VillageRepository {
  return {
    async load(userId) {
      const stored = await store.read(villageStream(userId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as VillageEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(userId, expectedVersion, events) {
      await store.append(villageStream(userId), expectedVersion, events as unknown as NewEvent[])
    },
  }
}
