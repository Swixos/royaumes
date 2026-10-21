import { bigint, text, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Checkpoints of the projections: for each projection, the position, in the global
 * order of the log, of the last event it handled. One row per projection.
 */
export const projections = platform.table('projections', {
  name: text('name').primaryKey(),
  position: bigint('position', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
