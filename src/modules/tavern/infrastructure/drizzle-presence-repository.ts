import { asc, eq, lt } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { PresenceRepository } from '../application/presence-repository'
import { presence } from './schema'

/**
 * Creates the adapter of the `PresenceRepository` port, backed by the `tavern.presence`
 * table. A signal is a single statement: an insert on arrival, an update on later signals.
 *
 * @param db - Database holding the tavern tables.
 * @returns The presence repository.
 */
export function createDrizzlePresenceRepository(db: Db): PresenceRepository {
  return {
    async touch(player, at) {
      await db
        .insert(presence)
        .values({ playerId: player.id, playerName: player.name, lastSeen: at })
        .onConflictDoUpdate({
          target: presence.playerId,
          set: { playerName: player.name, lastSeen: at },
        })
    },

    async remove(playerId) {
      await db.delete(presence).where(eq(presence.playerId, playerId))
    },

    async removeStale(before) {
      await db.delete(presence).where(lt(presence.lastSeen, before))
    },

    list() {
      return db
        .select({ id: presence.playerId, name: presence.playerName })
        .from(presence)
        .orderBy(asc(presence.playerName))
    },
  }
}
