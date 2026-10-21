import { bigserial, integer, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Erasure registry: one row per erased account, with the erasure date and the number of
 * rewritten events. On purpose, it holds no data about the erased player: it proves that
 * erasures happened, without keeping what they erased.
 */
export const erasures = platform.table('erasures', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  erasedAt: timestamp('erased_at', { withTimezone: true }).notNull().defaultNow(),
  eventsRewritten: integer('events_rewritten').notNull(),
})
