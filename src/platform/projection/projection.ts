import { asc, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { StoredEvent } from '../event-store/event-store'
import { events } from '../event-store/schema'
import { projections } from './schema'

/** Database transaction in which a projection updates its tables. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Projection: builds a read model from the events of the log. */
export interface Projection {
  /** Unique name, which identifies the checkpoint of the projection. */
  name: string
  /** Handled event types; the others are skipped, but the checkpoint moves past them. */
  eventTypes: string[]
  /**
   * Applies an event to the tables of the read model. Every write goes through `tx`,
   * so it is committed or rolled back together with the new checkpoint.
   *
   * @param event - Event to apply.
   * @param tx - Transaction of the current catch-up.
   * @returns Resolves once the tables are updated.
   */
  apply(event: StoredEvent, tx: DbTransaction): Promise<void>
}

/** Options of the projection runner. */
export interface ProjectionRunnerOptions {
  /**
   * Delay, in milliseconds, during which a missing position is treated as an insert
   * still in progress: the projection stops before it and waits for it.
   */
  gapGraceMs?: number
  /** Number of events read at a time. */
  batchSize?: number
  /** Clock, replaced in tests to simulate the passing of time. */
  now?: () => number
}

/**
 * Converts a row of the log into a stored event.
 *
 * @param row - Row of the `events` table.
 * @returns The stored event.
 */
const toStored = (row: typeof events.$inferSelect): StoredEvent => ({
  position: row.position,
  stream: row.stream,
  version: row.version,
  type: row.type,
  data: row.data as Record<string, unknown>,
  occurredAt: row.occurredAt,
})

/**
 * Creates the projection runner, which catches a projection up with the log and
 * applies each event exactly once.
 *
 * @param db - Database holding the log and the checkpoints.
 * @param options - Grace delay for missing positions, batch size and clock.
 * @returns The `catchUp` and `positionOf` functions.
 */
export function createProjectionRunner(
  db: Db,
  { gapGraceMs = 5_000, batchSize = 200, now = () => Date.now() }: ProjectionRunnerOptions = {},
) {
  /**
   * Applies to the projection the events recorded since its checkpoint. Everything
   * happens in a single transaction: the tables and the checkpoint are updated together,
   * or not at all.
   *
   * The checkpoint row is created on the first catch-up, then locked until the end of
   * the transaction, so a concurrent catch-up waits for this one. Later events are read
   * in batches, in the global order of the log, whatever their type: a gap in positions
   * can only be detected on the full sequence. When a position is missing before a recent
   * event, the missing insert may still be in progress, so the projection stops and will
   * wait for it; before an older event, the gap is a rolled back insert and is skipped.
   *
   * @param projection - Projection to catch up.
   * @returns The number of events applied.
   */
  async function catchUp(projection: Projection): Promise<number> {
    return db.transaction(async (tx) => {
      await tx.insert(projections).values({ name: projection.name }).onConflictDoNothing()
      const [checkpoint] = await tx
        .select()
        .from(projections)
        .where(eq(projections.name, projection.name))
        .for('update')

      let position = checkpoint.position
      let applied = 0

      for (;;) {
        const rows = await tx
          .select()
          .from(events)
          .where(gt(events.position, position))
          .orderBy(asc(events.position))
          .limit(batchSize)

        let blocked = false
        for (const row of rows) {
          const gap = row.position !== position + 1
          if (gap && now() - row.occurredAt.getTime() < gapGraceMs) {
            blocked = true
            break
          }
          if (projection.eventTypes.includes(row.type)) {
            await projection.apply(toStored(row), tx)
            applied++
          }
          position = row.position
        }
        if (blocked || rows.length < batchSize) break
      }

      await tx
        .update(projections)
        .set({ position, updatedAt: new Date() })
        .where(eq(projections.name, projection.name))
      return applied
    })
  }

  /**
   * Reads the checkpoint of a projection.
   *
   * @param name - Name of the projection.
   * @returns The position of its checkpoint; 0 if it was never caught up.
   */
  async function positionOf(name: string): Promise<number> {
    const [row] = await db.select().from(projections).where(eq(projections.name, name))
    return row?.position ?? 0
  }

  return { catchUp, positionOf }
}

/** Type of the projection runner, inferred from its factory. */
export type ProjectionRunner = ReturnType<typeof createProjectionRunner>
