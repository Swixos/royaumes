import { VersionConflictError, type VillageRepository } from '../application/village-repository'
import { replay, type VillageEvent } from '../domain/village'

/**
 * In-memory adapter of the {@link VillageRepository} port. Each player's events
 * are kept in a map and lost on every server restart: this adapter serves
 * development and tests until the event store.
 *
 * @returns A repository with its own empty storage.
 */
export function createInMemoryVillageRepository(): VillageRepository {
  const streams = new Map<string, VillageEvent[]>()

  return {
    async load(userId) {
      const events = streams.get(userId) ?? []
      return { state: replay(events), version: events.length }
    },

    async save(userId, expectedVersion, events) {
      const current = streams.get(userId) ?? []
      if (current.length !== expectedVersion) {
        throw new VersionConflictError(userId, expectedVersion, current.length)
      }
      streams.set(userId, [...current, ...events])
    },
  }
}
