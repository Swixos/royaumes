import { and, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import {
  ERASED_NAME,
  ERASED_VILLAGE,
  type PersonalDataContributor,
} from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { rankingProjection } from './infrastructure/ranking-projection'
import { players } from './infrastructure/schema'

/**
 * Creates the personal data contributor of the ranking module: the player's name and
 * village name, copied by the projection. The ranking has no events of its own, so it has
 * nothing to rewrite. Like any ranking read, the export catches the projection up first.
 * On erasure, the player's totals stay in the ranking under a neutral name: they are
 * exactly the values a rebuild would produce from the rewritten log.
 *
 * @param db - Database holding the ranking table.
 * @param projections - Projection runner of the platform.
 * @returns The ranking contributor.
 */
export function createRankingPersonalData(
  db: Db,
  projections: ProjectionRunner,
): PersonalDataContributor {
  return {
    name: 'ranking',

    async export(playerId) {
      await projections.catchUp(rankingProjection)
      const [row] = await db.select().from(players).where(eq(players.playerId, playerId))
      return row ?? null
    },

    async erase(playerId) {
      await db.update(players).set({ name: ERASED_NAME }).where(eq(players.playerId, playerId))
      await db
        .update(players)
        .set({ village: ERASED_VILLAGE })
        .where(and(eq(players.playerId, playerId), isNotNull(players.village)))
    },
  }
}
