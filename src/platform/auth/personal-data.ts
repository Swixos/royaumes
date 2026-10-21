import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { PersonalDataContributor } from '../privacy/privacy'
import { session, user } from './schema'

/**
 * Creates the personal data contributor of identity: the player's account and sessions.
 * The password hash and the session tokens are never exported: they are secrets, not
 * information useful to the player. Deleting the account also deletes its sessions and
 * credentials, through the foreign keys declared with `onDelete: 'cascade'`, which signs
 * the player out.
 *
 * @param db - Database holding the identity tables.
 * @returns The identity contributor.
 */
export function createIdentityPersonalData(db: Db): PersonalDataContributor {
  return {
    name: 'identity',

    async export(playerId) {
      const [account] = await db
        .select({ name: user.name, email: user.email, createdAt: user.createdAt })
        .from(user)
        .where(eq(user.id, playerId))
      const sessions = await db
        .select({
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
        })
        .from(session)
        .where(eq(session.userId, playerId))
      return { account: account ?? null, sessions }
    },

    async erase(playerId) {
      await db.delete(user).where(eq(user.id, playerId))
    },
  }
}
