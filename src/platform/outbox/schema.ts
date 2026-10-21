import { sql } from 'drizzle-orm'
import { index, integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Outbox: messages addressed to a module, recorded in the same transaction as the
 * events that produced them, then delivered by the dispatcher.
 *
 * - `topic`: subject of the message, which names the handler in charge of it.
 * - `available_at`: time from which the message may be delivered; it is pushed back
 *   during processing (lease) and after a failure (delay before the next attempt).
 * - `processed_at`: time of successful processing; null while the message is pending.
 *
 * The partial index only holds pending messages, so looking for messages to deliver
 * never walks the processed ones, however many there are.
 */
export const outbox = platform.table(
  'outbox',
  {
    id: text('id').primaryKey(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('outbox_pending_idx').on(t.availableAt).where(sql`processed_at is null`)],
)
