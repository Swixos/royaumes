import { and, desc, gt, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { OpenGamesReader } from '../application/open-games-reader'
import { MAX_HEROES, OPEN_GAME_MS } from '../domain/content'
import { openGamesProjection } from './open-games-projection'
import { openGames } from './schema'

/**
 * Creates the adapter of the `OpenGamesReader` port, backed by the open games table.
 * It catches the projection up before each read, like the ranking. The rules of the
 * list apply at read time: a full expedition, or one opened more than an hour ago,
 * stays in the table but is not offered.
 *
 * @param db - Database holding the open games table.
 * @param projections - Projection runner of the platform.
 * @returns The open games reader.
 */
export function createDrizzleOpenGamesReader(
  db: Db,
  projections: ProjectionRunner,
): OpenGamesReader {
  return {
    async list(now) {
      await projections.catchUp(openGamesProjection)

      return db
        .select({
          gameId: openGames.gameId,
          hostName: openGames.hostName,
          heroCount: openGames.heroCount,
          createdAt: openGames.createdAt,
        })
        .from(openGames)
        .where(
          and(lt(openGames.heroCount, MAX_HEROES), gt(openGames.createdAt, now - OPEN_GAME_MS)),
        )
        .orderBy(desc(openGames.createdAt))
    },
  }
}
