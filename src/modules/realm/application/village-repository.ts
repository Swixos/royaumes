import type { VillageEvent, VillageState } from '../domain/village'

/**
 * Village persistence port, owned by the application layer. It speaks the
 * domain language (states, events) and knows nothing about the concrete
 * storage, provided by an infrastructure adapter.
 */
export interface VillageRepository {
  /**
   * Loads a player's village, rebuilt from its events.
   *
   * @param userId - Player identifier.
   * @returns The village state and its version, the number of stored events.
   */
  load(userId: string): Promise<{ state: VillageState; version: number }>

  /**
   * Appends new events after the stored ones.
   *
   * @param userId - Player identifier.
   * @param expectedVersion - Version read at load time.
   * @param events - Events to append.
   * @throws {@link VersionConflictError} If other events were stored in between.
   */
  save(userId: string, expectedVersion: number, events: VillageEvent[]): Promise<void>
}

/** Thrown when the expected version no longer matches the stored version. */
export class VersionConflictError extends Error {
  /**
   * @param userId - Player whose stream is in conflict.
   * @param expected - Version the caller expected.
   * @param actual - Version actually stored.
   */
  constructor(userId: string, expected: number, actual: number) {
    super(`Conflit de version pour ${userId} : attendue ${expected}, enregistrée ${actual}`)
    this.name = 'VersionConflictError'
  }
}
