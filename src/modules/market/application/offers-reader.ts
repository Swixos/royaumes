import type { MarketList } from '../contracts'

/** Read port of the list of offers, owned by the application layer. */
export interface OffersReader {
  /**
   * Lists the ongoing offers of a player, and the open offers of the other players.
   *
   * @param viewerId - Identifier of the viewing player.
   * @param now - Current time in milliseconds.
   * @returns The offers, with the log position up to which the list is up to date.
   */
  list(viewerId: string, now: number): Promise<MarketList>
}
