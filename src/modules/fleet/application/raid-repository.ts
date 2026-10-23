import type { NewMessage } from '@/platform/outbox/outbox'
import type { HarborEvent, HarborState } from '../domain/harbor'
import type { RaidEvent, RaidState } from '../domain/raid'

/** Persistence port of the raids, owned by the application layer. */
export interface RaidRepository {
  /**
   * Loads a raid, rebuilt from its events.
   *
   * @param raidId - Raid identifier.
   * @returns The state and its version, the number of stored events.
   */
  load(raidId: string): Promise<{ state: RaidState; version: number }>

  /**
   * Appends new events, and the saga messages they trigger, in a single transaction.
   *
   * @param raidId - Raid identifier.
   * @param expectedVersion - Version read at load time.
   * @param events - Events to append.
   * @param messages - Saga messages to record in the outbox.
   * @throws `ConcurrencyError` if other events were stored since the read.
   */
  save(
    raidId: string,
    expectedVersion: number,
    events: RaidEvent[],
    messages: NewMessage[],
  ): Promise<void>
}

/** Persistence port of the harbors, owned by the application layer. */
export interface HarborRepository {
  /**
   * Loads a player's harbor, rebuilt from its events.
   *
   * @param playerId - Owner of the harbor.
   * @returns The state, its version and its latest events, latest first.
   */
  load(playerId: string): Promise<{
    state: HarborState
    version: number
    log: { version: number; type: string; data: Record<string, unknown> }[]
  }>

  /**
   * Appends new events to a harbor.
   *
   * @param playerId - Owner of the harbor.
   * @param expectedVersion - Version read at load time.
   * @param events - Events to append.
   * @throws `ConcurrencyError` if other events were stored since the read.
   */
  save(playerId: string, expectedVersion: number, events: HarborEvent[]): Promise<void>
}
