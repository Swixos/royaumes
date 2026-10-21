import { eq, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { StoredEvent } from '../event-store/event-store'
import { events } from '../event-store/schema'
import { erasures } from './schema'

/** Name replacing that of an erased player, in the log and in the read tables. */
export const ERASED_NAME = 'Joueur effacé'

/** Name replacing that of an erased player's village. */
export const ERASED_VILLAGE = 'Village effacé'

/**
 * Participation of a module, or of a platform brick, in player rights. Each module knows
 * its own personal data: it exports them, points them out in its events, and erases those
 * of its tables. The platform knows no module.
 */
export interface PersonalDataContributor {
  /** Name of the export section about this module, such as "realm". */
  name: string
  /**
   * Exports the data the module keeps about the player.
   *
   * @param playerId - Player identifier.
   * @returns The data, in a readable form.
   */
  export(playerId: string): Promise<unknown>
  /**
   * Rewrites an event of the module. The type, the version and the other data of the
   * event must not change.
   *
   * @param event - Candidate event.
   * @param playerId - Identifier of the player being erased.
   * @returns The event data without the player's personal data, or null if the event
   *   holds none.
   */
  redact?(event: StoredEvent, playerId: string): Record<string, unknown> | null
  /**
   * Erases the player's data in the module tables, once the log is rewritten.
   *
   * @param playerId - Identifier of the player being erased.
   * @param rewritten - Rewritten events, with their new data.
   * @returns Resolves once the data is erased.
   */
  erase?(playerId: string, rewritten: StoredEvent[]): Promise<void>
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
 * Creates the player rights service: export and erasure of personal data. The order of
 * the contributors is that of the export and of the erasure; identity must come last, so
 * an interrupted erasure can be restarted by the player themselves.
 *
 * @param db - Database holding the log and the erasure registry.
 * @param contributors - Personal data contributors, identity last.
 * @param clock - Reference clock in milliseconds; real time by default.
 * @returns The `exportData` and `erase` operations.
 */
export function createPrivacyService(
  db: Db,
  contributors: PersonalDataContributor[],
  clock = () => Date.now(),
) {
  /**
   * Exports all the personal data of a player, module by module.
   *
   * @param playerId - Player identifier.
   * @returns The export, with its generation date and a section per contributor.
   */
  async function exportData(playerId: string) {
    const sections: Record<string, unknown> = {}
    for (const contributor of contributors) {
      sections[contributor.name] = await contributor.export(playerId)
    }
    return { generatedAt: new Date(clock()).toISOString(), playerId, sections }
  }

  /**
   * Rewrites the events of the log holding the player's personal data. It is the only
   * function of the project that modifies a recorded event. Candidate events are those
   * whose stream or data mention the player identifier; the SQL `position()` function
   * looks for an exact string, with no special character. Each module rewrites the events
   * it recognizes, if needed. The rewrites and the entry of the erasure registry are
   * recorded in a single transaction.
   *
   * @param playerId - Identifier of the player being erased.
   * @returns The rewritten events.
   */
  async function rewriteJournal(playerId: string) {
    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(events)
        .where(
          or(
            sql`position(${playerId} in ${events.stream}) > 0`,
            sql`position(${playerId} in ${events.data}::text) > 0`,
          ),
        )

      const rewritten: StoredEvent[] = []
      for (const row of rows) {
        let event = toStored(row)
        let changed = false
        for (const contributor of contributors) {
          const data = contributor.redact?.(event, playerId)
          if (data) {
            event = { ...event, data }
            changed = true
          }
        }
        if (changed) {
          await tx.update(events).set({ data: event.data }).where(eq(events.position, row.position))
          rewritten.push(event)
        }
      }

      await tx.insert(erasures).values({ eventsRewritten: rewritten.length })
      return rewritten
    })
  }

  /**
   * Erases the personal data of a player: the log is rewritten first, then each
   * contributor erases the data of its tables, identity last. Each step is idempotent,
   * so an interrupted erasure can be restarted.
   *
   * @param playerId - Identifier of the player to erase.
   * @returns The number of rewritten events.
   */
  async function erase(playerId: string) {
    const rewritten = await rewriteJournal(playerId)
    for (const contributor of contributors) await contributor.erase?.(playerId, rewritten)
    return { eventsRewritten: rewritten.length }
  }

  return { exportData, erase }
}

/** Service type inferred from its factory. */
export type PrivacyService = ReturnType<typeof createPrivacyService>
