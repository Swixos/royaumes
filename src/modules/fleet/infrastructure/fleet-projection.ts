import { eq, sql } from 'drizzle-orm'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_VILLAGE } from '@/platform/privacy/privacy'
import type { Projection } from '@/platform/projection/projection'
import { RAID_STREAM_PREFIX } from '../contracts'
import type { RaidEvent, RaidStatus } from '../domain/raid'
import { harbors, raids } from './schema'

/**
 * Data of `VillageFounded`, as read by the fleet. The village events read here form the
 * published language of the realm module: only the useful fields are described.
 */
interface VillageFoundedData {
  /** Name of the village. */
  name: string
}

/** Data of a village `BuildingUpgraded` event, in the published language of the realm module. */
interface BuildingUpgradedData {
  /** Upgraded building. */
  building: string
  /** Level reached. */
  toLevel: number
  /** Time of the order. */
  at: number
  /** Time the construction completes; missing on events recorded before construction times. */
  completesAt?: number
}

/**
 * Extracts an identifier from a stream name: "raid-7f3a" gives "7f3a".
 *
 * @param event - Event whose stream is read.
 * @param prefix - Stream prefix.
 * @returns The identifier after the prefix.
 */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/**
 * Fleet projection: the villages that may be raided, from the village events, and the
 * raids, from the fleet events. A village whose owner was erased is no longer a target:
 * its founding event, rewritten, carries the neutral name, and is skipped on a rebuild
 * exactly as the erasure deletes its row.
 */
export const fleetProjection: Projection = {
  name: 'fleet',
  version: 2,
  eventTypes: [
    'VillageFounded',
    'BuildingUpgraded',
    'RaidLaunched',
    'RaidCancelled',
    'FleetSailed',
    'FleetRecalled',
    'RaidAborted',
    'BattleFought',
    'RaidPlundered',
  ],

  async apply(stored, tx) {
    if (stored.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) {
      const playerId = idFrom(stored, VILLAGE_CHANNEL_PREFIX)
      if (stored.type === 'VillageFounded') {
        const { name } = stored.data as unknown as VillageFoundedData
        if (name === ERASED_VILLAGE) return
        await tx
          .insert(harbors)
          .values({ playerId, villageName: name })
          .onConflictDoUpdate({ target: harbors.playerId, set: { villageName: name } })
      } else if (stored.type === 'BuildingUpgraded') {
        const { building, toLevel, at, completesAt } =
          stored.data as unknown as BuildingUpgradedData
        if (building !== 'wall' && building !== 'shipyard') return
        const step = JSON.stringify([[toLevel, completesAt ?? at]])
        await tx
          .update(harbors)
          .set({ [building]: sql`${harbors[building]} || ${step}::jsonb` })
          .where(eq(harbors.playerId, playerId))
      }
      return
    }
    if (!stored.stream.startsWith(RAID_STREAM_PREFIX)) return

    const raidId = idFrom(stored, RAID_STREAM_PREFIX)
    const event = { type: stored.type, data: stored.data } as RaidEvent
    /**
     * Changes the state of the raid in the table.
     *
     * @param status - New state.
     * @param extra - Other columns to update.
     * @returns The update query.
     */
    const set = (status: RaidStatus, extra: Partial<typeof raids.$inferInsert> = {}) =>
      tx
        .update(raids)
        .set({ status, ...extra })
        .where(eq(raids.raidId, raidId))

    switch (event.type) {
      case 'RaidLaunched': {
        const { target } = event.data
        await tx
          .insert(raids)
          .values({
            raidId,
            attackerId: event.data.attackerId,
            attackerName: event.data.attackerName,
            targetKind: target.kind,
            targetId: target.kind === 'village' ? target.playerId : target.islandId,
            targetName: target.name,
            ships: event.data.ships,
            tactic: event.data.tactic,
            status: 'provisioning',
            launchedAt: event.data.at,
          })
          .onConflictDoNothing()
        return
      }
      case 'RaidCancelled':
        await set('cancelled')
        return
      case 'FleetSailed':
        await set('at-sea', { sailedAt: event.data.at, arrivesAt: event.data.arrivesAt })
        return
      case 'FleetRecalled':
        await set('recalled')
        return
      case 'RaidAborted':
        await set('aborted')
        return
      case 'BattleFought':
        await set(event.data.victory ? 'plundering' : 'sunk', { victory: event.data.victory })
        return
      case 'RaidPlundered':
        await set('returned', { loot: event.data.loot })
        return
    }
  },

  async reset(tx) {
    await tx.delete(raids)
    await tx.delete(harbors)
  },
}
