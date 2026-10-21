import type { NewMessage } from '@/platform/outbox/outbox'
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
   * @param messages - Messages recorded in the outbox in the same transaction.
   * @throws `ConcurrencyError` from the platform event store if other events
   *   were stored in between.
   */
  save(
    userId: string,
    expectedVersion: number,
    events: VillageEvent[],
    messages?: NewMessage[],
  ): Promise<void>
}
