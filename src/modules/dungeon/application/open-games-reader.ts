import type { OpenGame } from '../contracts'

/**
 * Read port of the list of open expeditions, defined by the application layer. It is
 * separate from the `GameRepository` port: that one serves the commands (write model),
 * this one answers a query (read model).
 */
export interface OpenGamesReader {
  /**
   * Lists the expeditions that can still be joined.
   *
   * @param now - Current time in milliseconds.
   * @returns The open expeditions, most recent first.
   */
  list(now: number): Promise<OpenGame[]>
}
