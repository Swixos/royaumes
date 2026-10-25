import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { chronicleProjection } from './infrastructure/chronicle-projection'
import { entries } from './infrastructure/schema'

/**
 * Creates the personal data contributor of the chronicle module. The chronicle has no
 * events of its own: it copies names from the events of the other modules, so it has
 * nothing to rewrite in the log. Once the log is rewritten, for an erasure or a
 * rectified name, the chronicle is rebuilt from it: every copied name then matches the
 * log, in the player's chronicle as in the chronicles of the players they met.
 *
 * @param db - Database holding the chronicle tables.
 * @param projections - Projection runner of the platform.
 * @returns The chronicle contributor.
 */
export function createChroniclePersonalData(
  db: Db,
  projections: ProjectionRunner,
): PersonalDataContributor {
  return {
    name: 'chronicle',

    async export(playerId) {
      await projections.catchUp(chronicleProjection)
      const rows = await db.select().from(entries).where(eq(entries.playerId, playerId))
      return rows.map((row) => ({ type: row.type, at: row.at, ...row.data }))
    },

    async erase() {
      await projections.rebuild(chronicleProjection)
    },

    async rectify() {
      await projections.rebuild(chronicleProjection)
    },
  }
}
