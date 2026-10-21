import type { PresentPlayer } from '../contracts'

/** Persistence port of the presence, owned by the application layer. */
export interface PresenceRepository {
  /**
   * Records the signal of a player: creates their row, or updates the time of their last
   * signal.
   *
   * @param player - Present player.
   * @param at - Time of the signal in milliseconds.
   * @returns Resolves once the row is written.
   */
  touch(player: PresentPlayer, at: number): Promise<void>
  /**
   * Deletes the row of a player.
   *
   * @param playerId - Player identifier.
   * @returns Resolves once the row is deleted.
   */
  remove(playerId: string): Promise<void>
  /**
   * Deletes the rows of the players whose last signal is older than a given time.
   *
   * @param before - Staleness threshold in milliseconds.
   * @returns The number of deleted rows.
   */
  removeStale(before: number): Promise<number>
  /**
   * Lists the present players.
   *
   * @returns The players, in alphabetical order.
   */
  list(): Promise<PresentPlayer[]>
}
