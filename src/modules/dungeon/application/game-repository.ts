import type { GameEvent, GameState } from '../domain/game'
import type { OpenGame } from '../domain/lobby'

/**
 * Dungeon persistence port, owned by the application layer. Like the village
 * one, it speaks the domain language.
 */
export interface GameRepository {
  /**
   * Loads an expedition, rebuilt from its events.
   *
   * @param gameId - Expedition identifier.
   * @returns The state and its version, the number of stored events.
   */
  load(gameId: string): Promise<{ state: GameState; version: number }>

  /**
   * Appends new events after the stored ones.
   *
   * @param gameId - Expedition identifier.
   * @param expectedVersion - Version read at load time.
   * @param events - Events to append.
   * @throws `ConcurrencyError` if other events were stored since the read.
   */
  save(gameId: string, expectedVersion: number, events: GameEvent[]): Promise<void>

  /**
   * Lists the expeditions that can still be joined.
   *
   * @param now - Current time in milliseconds.
   * @returns The open expeditions, most recent first.
   */
  listOpenGames(now: number): Promise<OpenGame[]>
}
