import type { NewMessage } from '@/platform/outbox/outbox'
import type { Progress } from '../domain/quests'
import type { TutorialEvent, TutorialState } from '../domain/tutorial'

/** Storage port of the tutorials, defined by the application layer. */
export interface TutorialRepository {
  /**
   * Loads the tutorial of a player.
   *
   * @param playerId - Player identifier.
   * @returns Its state and the version of its stream.
   */
  load(playerId: string): Promise<{ state: TutorialState; version: number }>
  /**
   * Records the events of a decision, with its messages, in one transaction.
   *
   * @param playerId - Player identifier.
   * @param expectedVersion - Version read before deciding.
   * @param events - Events to record.
   * @param messages - Messages to record in the outbox.
   * @returns Resolves once recorded.
   */
  save(
    playerId: string,
    expectedVersion: number,
    events: TutorialEvent[],
    messages: NewMessage[],
  ): Promise<void>
}

/** Read port of the progress of the players. */
export interface ProgressReader {
  /**
   * Reads what a player achieved, up to date at call time.
   *
   * @param playerId - Player identifier.
   * @returns Their progress.
   */
  progressOf(playerId: string): Promise<Progress>
}
