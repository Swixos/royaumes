import { and, asc, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events } from './schema'

/** Event to record: a type and data the platform does not interpret. */
export interface NewEvent {
  /** Event type, such as `VillageFounded`. */
  type: string
  /** Event payload, stored as JSON. */
  data: Record<string, unknown>
}

/** Recorded event, completed with the information assigned by the store. */
export interface StoredEvent extends NewEvent {
  /** Global order, across all streams. */
  position: number
  /** Stream the event belongs to. */
  stream: string
  /** Rank in the stream, starting at 1. */
  version: number
  /** Time the event was recorded. */
  occurredAt: Date
}

/** Thrown when another write happened on the stream since it was read. */
export class ConcurrencyError extends Error {
  /**
   * @param stream - Stream in conflict.
   * @param expectedVersion - Version the caller expected.
   */
  constructor(stream: string, expectedVersion: number) {
    super(`Conflit d'écriture sur ${stream} (version attendue : ${expectedVersion})`)
    this.name = 'ConcurrencyError'
  }
}

/** Event store port, used by the module adapters. */
export interface EventStore {
  /**
   * Appends events at the end of a stream, all or none.
   *
   * @param stream - Target stream.
   * @param expectedVersion - Stream version read before deciding.
   * @param newEvents - Events to append.
   * @returns The recorded events.
   * @throws {@link ConcurrencyError} If `expectedVersion` is no longer the current version.
   */
  append(stream: string, expectedVersion: number, newEvents: NewEvent[]): Promise<StoredEvent[]>

  /**
   * Reads the events of a stream, in order.
   *
   * @param stream - Stream to read.
   * @param afterVersion - Only return events after this version; all by default.
   * @returns The events, sorted by version.
   */
  read(stream: string, afterVersion?: number): Promise<StoredEvent[]>
}

/**
 * Tells whether an error comes from a unique constraint violation (SQLSTATE 23505).
 * Drizzle wraps the driver error, so the cause chain is walked until the code is found.
 *
 * @param error - Error to inspect.
 * @returns True if any error in the cause chain has code `23505`.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  while (current && typeof current === 'object') {
    if ((current as { code?: string }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * Maps a table row to a stored event.
 *
 * @param row - Row of `platform.events`.
 * @returns The stored event.
 */
function toStored(row: typeof events.$inferSelect): StoredEvent {
  return {
    position: row.position,
    stream: row.stream,
    version: row.version,
    type: row.type,
    data: row.data as Record<string, unknown>,
    occurredAt: row.occurredAt,
  }
}

/**
 * Event store backed by the `platform.events` table. Versions of new events
 * follow the expected version, and the `(stream, version)` constraint rejects
 * stale writes; a single INSERT keeps a batch atomic.
 *
 * @param db - Database connection.
 * @returns The event store.
 */
export function createEventStore(db: Db): EventStore {
  return {
    async append(stream, expectedVersion, newEvents) {
      if (newEvents.length === 0) return []

      const rows = newEvents.map((event, i) => ({
        stream,
        version: expectedVersion + i + 1,
        type: event.type,
        data: event.data,
      }))

      try {
        const inserted = await db.insert(events).values(rows).returning()
        return inserted.map(toStored)
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConcurrencyError(stream, expectedVersion)
        throw error
      }
    },

    async read(stream, afterVersion = 0) {
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.stream, stream), gt(events.version, afterVersion)))
        .orderBy(asc(events.version))
      return rows.map(toStored)
    },
  }
}
