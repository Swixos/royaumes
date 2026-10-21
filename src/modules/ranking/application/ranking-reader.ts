import type { Ranking } from '../contracts'

/**
 * Read port of the ranking, defined by the application layer. The module has no
 * command: it only reads a read model.
 */
export interface RankingReader {
  /**
   * Lists the best players, up to date at call time.
   *
   * @param limit - Maximum number of players.
   * @returns The ranking rows, best first, with the log position they reflect.
   */
  top(limit: number): Promise<Ranking>
}
