/**
 * Shared public entry of the ranking module, usable by both the server and the
 * interface.
 *
 * @packageDocumentation
 */

/** Row of the ranking, as shown to players. */
export interface RankingEntry {
  /** Rank, starting at 1. */
  rank: number
  /** Player identifier. */
  playerId: string
  /** Name of the player, or failing that the name of their village. */
  label: string
  /** Number of finished expeditions. */
  gamesPlayed: number
  /** Number of won expeditions. */
  gamesWon: number
  /** Gold brought back from won expeditions. */
  gold: number
  /** Number of building upgrades of the village. */
  upgrades: number
}

/** Number of players shown by the ranking. */
export const RANKING_SIZE = 20
