import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { messages, presence } from './infrastructure/schema'

/**
 * Creates the personal data contributor of the tavern module: the player's messages and
 * presence. The tavern records no events, so erasure is a plain deletion.
 *
 * @param db - Database holding the tavern tables.
 * @returns The tavern contributor.
 */
export function createTavernPersonalData(db: Db): PersonalDataContributor {
  return {
    name: 'tavern',

    async export(playerId) {
      return {
        messages: await db
          .select({ body: messages.body, postedAt: messages.postedAt })
          .from(messages)
          .where(eq(messages.authorId, playerId))
          .orderBy(asc(messages.id)),
        presence: await db
          .select({ lastSeen: presence.lastSeen })
          .from(presence)
          .where(eq(presence.playerId, playerId)),
      }
    },

    async erase(playerId) {
      await db.delete(messages).where(eq(messages.authorId, playerId))
      await db.delete(presence).where(eq(presence.playerId, playerId))
    },
  }
}
