import { and, asc, desc, eq, gt, gte, max } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { MessageRepository } from '../application/message-repository'
import { messages } from './schema'

/**
 * Creates the adapter of the `MessageRepository` port, backed by the `tavern.messages`
 * table. The latest messages are read newest first, then put back in order.
 *
 * @param db - Database holding the tavern tables.
 * @returns The message repository.
 */
export function createDrizzleMessageRepository(db: Db): MessageRepository {
  return {
    async add(message) {
      const [row] = await db.insert(messages).values(message).returning()
      return row
    },

    async latest(limit) {
      const rows = await db.select().from(messages).orderBy(desc(messages.id)).limit(limit)
      return rows.reverse()
    },

    after(id, limit) {
      return db
        .select()
        .from(messages)
        .where(gt(messages.id, id))
        .orderBy(asc(messages.id))
        .limit(limit)
    },

    async lastId() {
      const [row] = await db.select({ value: max(messages.id) }).from(messages)
      return Number(row?.value ?? 0)
    },

    async postedSince(authorId, since) {
      const rows = await db
        .select({ postedAt: messages.postedAt })
        .from(messages)
        .where(and(eq(messages.authorId, authorId), gte(messages.postedAt, since)))
      return rows.map((row) => row.postedAt)
    },
  }
}
