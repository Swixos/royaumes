import { eq, type SQL, sql } from 'drizzle-orm'
import {
  type Army,
  type ArmyMove,
  type Unit,
  VILLAGE_CHANNEL_PREFIX,
} from '@/modules/realm/contracts'
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

/** Data of a village `UnitsRecruited` event, in the published language of the realm module. */
interface UnitsRecruitedData {
  /** Unit ordered. */
  unit: Unit
  /** Number of units ordered. */
  count: number
  /** Time the first unit starts. */
  startsAt: number
  /** Training time of one unit. */
  each: number
}

/** Data of the village events moving units, in the published language of the realm module. */
interface UnitsMovedData {
  /** Units leaving, coming home or lost. */
  units: Army
  /** Time of the move. */
  at: number
}

/** Sign of each village event moving units in the garrison. */
const MOVES: Record<string, 1 | -1> = { UnitsWithdrawn: -1, UnitsReturned: 1, UnitsLost: -1 }

/**
 * Extracts an identifier from a stream name: "raid-7f3a" gives "7f3a".
 *
 * @param event - Event whose stream is read.
 * @param prefix - Stream prefix.
 * @returns The identifier after the prefix.
 */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/**
 * Fleet projection: the villages that may be raided, with the moves of their units, from
 * the village events, and the raids, from the fleet events. A village whose owner was
 * erased is no longer a target: its founding event, rewritten, carries the neutral name,
 * and is skipped on a rebuild exactly as the erasure deletes its row.
 *
 * Version 3: adds the units of the villages, and the armies of the raids.
 */
export const fleetProjection: Projection = {
  name: 'fleet',
  version: 3,
  eventTypes: [
    'VillageFounded',
    'BuildingUpgraded',
    'UnitsRecruited',
    'UnitsWithdrawn',
    'UnitsReturned',
    'UnitsLost',
    'RaidLaunched',
    'RaidCancelled',
    'FleetSailed',
    'FleetRecalled',
    'RaidAborted',
    'BattleFought',
    'RaidPlundered',
  ],

  async apply(stored, tx) {
    /**
     * Records a move of the units of a village.
     *
     * @param playerId - Owner of the village.
     * @param move - Move to add.
     * @returns The update query.
     */
    const addMove = (playerId: string, move: ArmyMove) =>
      tx
        .update(harbors)
        .set({ units: sql`${harbors.units} || ${JSON.stringify([move])}::jsonb` })
        .where(eq(harbors.playerId, playerId))

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
      } else if (stored.type === 'UnitsRecruited') {
        const { unit, count, startsAt, each } = stored.data as unknown as UnitsRecruitedData
        await addMove(playerId, { kind: 'train', unit, count, startsAt, each })
      } else if (stored.type in MOVES) {
        const { units, at } = stored.data as unknown as UnitsMovedData
        await addMove(playerId, { kind: 'move', at, units, sign: MOVES[stored.type] })
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
    const set = (
      status: RaidStatus,
      extra: { [K in keyof typeof raids.$inferInsert]?: (typeof raids.$inferInsert)[K] | SQL } = {},
    ) =>
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
            tactic: event.data.tactic ?? null,
            army: event.data.army ?? {},
            damage: event.data.damage ?? null,
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
        await set('recalled', {
          returnsAt: sql`${event.data.at} + greatest(0, ${event.data.at} - ${raids.sailedAt})`,
        })
        return
      case 'RaidAborted':
        await set('aborted', {
          returnsAt: sql`2 * ${raids.arrivesAt} - ${raids.sailedAt}`,
        })
        return
      case 'BattleFought':
        await set(event.data.victory ? 'plundering' : 'sunk', {
          victory: event.data.victory,
          ...(event.data.report
            ? { returnsAt: sql`2 * ${raids.arrivesAt} - ${raids.sailedAt}` }
            : {}),
        })
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
