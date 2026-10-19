import { VersionConflictError, type VillageRepository } from '../application/village-repository'
import { replay, type VillageEvent } from '../domain/village'

/**
 * Adaptateur en mémoire du port VillageRepository.
 * Les événements de chaque joueur sont conservés dans une table associative.
 * Ils sont perdus à chaque redémarrage du serveur : cet adaptateur sert au
 * développement et aux tests, en attendant le journal d'événements du TD3.
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
