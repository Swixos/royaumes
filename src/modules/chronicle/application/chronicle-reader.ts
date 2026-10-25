import type { Category, ChroniclePage } from '../contracts'

/**
 * Read port of the chronicle, defined by the application layer. The module has no
 * command: it only reads a read model built from the events of the other modules.
 */
export interface ChronicleReader {
  /**
   * Reads a page of the chronicle of a player, up to date at call time.
   *
   * @param playerId - Player whose chronicle is read.
   * @param options - Part of the game to keep, position to read before, size of the page.
   * @returns The entries, latest first, and the position of the next page.
   */
  page(
    playerId: string,
    options: { category?: Category; before?: number; limit: number },
  ): Promise<ChroniclePage>
}
