import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChronicleReader } from '../application/chronicle-reader'
import { type ChronicleEntry, FACTS_OF, type Fact } from '../domain/entry'
import { chronicleProjection } from './chronicle-projection'
import { entries } from './schema'

/**
 * Creates the adapter of the `ChronicleReader` port, backed by the table of entries. It
 * catches the projection up before each read, so the chronicle is up to date when read.
 * One more entry than the page holds is read, to tell whether an older page exists.
 *
 * @param db - Database holding the chronicle tables.
 * @param projections - Projection runner of the platform.
 * @returns The chronicle reader.
 */
export function createDrizzleChronicleReader(
  db: Db,
  projections: ProjectionRunner,
): ChronicleReader {
  return {
    async page(playerId, { category, before, limit }) {
      await projections.catchUp(chronicleProjection)
      const rows = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.playerId, playerId),
            category ? inArray(entries.type, [...FACTS_OF[category]]) : undefined,
            before ? lt(entries.position, before) : undefined,
          ),
        )
        .orderBy(desc(entries.position))
        .limit(limit + 1)
      const page = rows.slice(0, limit).map(
        (row) =>
          ({
            ...row.data,
            type: row.type as Fact['type'],
            position: row.position,
            at: row.at,
          }) as ChronicleEntry,
      )
      return {
        entries: page,
        next: rows.length > limit ? page[page.length - 1].position : null,
      }
    },
  }
}
