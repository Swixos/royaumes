import { asc, desc } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { RankingReader } from '../application/ranking-reader'
import { rankingProjection } from './ranking-projection'
import { players } from './schema'

/**
 * Builds the displayed name of a player.
 *
 * @param row - Row of the ranking table.
 * @returns Their name if known, otherwise one based on their village.
 */
const labelOf = (row: typeof players.$inferSelect) =>
  row.name ?? (row.village ? `Seigneur de ${row.village}` : 'Joueur inconnu')

/**
 * Creates the adapter of the `RankingReader` port, backed by the ranking table. It
 * catches the projection up before each read, so the table is up to date when read.
 * Players are ordered by wins, then gold, then upgrades; the identifier breaks ties
 * so the order is stable from one read to the next.
 *
 * @param db - Database holding the ranking table.
 * @param projections - Projection runner of the platform.
 * @returns The ranking reader.
 */
export function createDrizzleRankingReader(db: Db, projections: ProjectionRunner): RankingReader {
  return {
    async top(limit) {
      await projections.catchUp(rankingProjection)

      const rows = await db
        .select()
        .from(players)
        .orderBy(
          desc(players.gamesWon),
          desc(players.gold),
          desc(players.upgrades),
          asc(players.playerId),
        )
        .limit(limit)

      return rows.map((row, index) => ({
        rank: index + 1,
        playerId: row.playerId,
        label: labelOf(row),
        gamesPlayed: row.gamesPlayed,
        gamesWon: row.gamesWon,
        gold: row.gold,
        upgrades: row.upgrades,
        bestLoot: row.bestLoot,
      }))
    },
  }
}
