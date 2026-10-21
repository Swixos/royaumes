import type { RankingEntry } from '../contracts'

/**
 * Read port of the ranking, defined by the application layer. The module has no
 * command: it only reads a read model.
 */
export interface RankingReader {
  /**
   * Lists the best players, up to date at call time.
   *
   * @param limit - Maximum number of players.
   * @returns The ranking rows, best first.
   */
  top(limit: number): Promise<RankingEntry[]>
}
