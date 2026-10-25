import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ProgressReader } from '../application/ports'
import { NO_PROGRESS } from '../domain/quests'
import { progressProjection } from './progress-projection'
import { progress } from './schema'

/**
 * Creates the adapter of the `ProgressReader` port. It catches the projection up before
 * each read, so a construction ordered or a raid launched counts at once.
 *
 * @param db - Database holding the progress table.
 * @param projections - Projection runner of the platform.
 * @returns The progress reader.
 */
export function createDrizzleProgressReader(db: Db, projections: ProjectionRunner): ProgressReader {
  return {
    async progressOf(playerId) {
      await projections.catchUp(progressProjection)
      const [row] = await db.select().from(progress).where(eq(progress.playerId, playerId))
      return row ? { levels: row.levels, deeds: row.deeds } : NO_PROGRESS
    },
  }
}
