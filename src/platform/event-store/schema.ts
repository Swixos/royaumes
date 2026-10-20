import { bigserial, integer, jsonb, pgSchema, text, timestamp, unique } from 'drizzle-orm/pg-core'

/** PostgreSQL schema of the technical platform. */
export const platform = pgSchema('platform')

/**
 * Append-only event log: no row is ever updated or deleted.
 *
 * - `position`: global order of all events, assigned by the database.
 * - `stream`: stream the event belongs to, such as `village-<player>`.
 * - `version`: rank of the event in its stream, starting at 1.
 * - `type` and `data`: the event itself, which the platform does not interpret.
 *
 * The unique `(stream, version)` constraint is what guarantees optimistic concurrency.
 */
export const events = platform.table(
  'events',
  {
    position: bigserial('position', { mode: 'number' }).primaryKey(),
    stream: text('stream').notNull(),
    version: integer('version').notNull(),
    type: text('type').notNull(),
    data: jsonb('data').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('events_stream_version').on(t.stream, t.version)],
)
