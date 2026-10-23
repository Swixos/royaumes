import { and, eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, StoredEvent } from '@/platform/event-store/event-store'
import {
  ERASED_NAME,
  ERASED_VILLAGE,
  type PersonalDataContributor,
} from '@/platform/privacy/privacy'
import { HARBOR_CHANNEL_PREFIX, harborChannel, RAID_STREAM_PREFIX } from './contracts'
import type { Target } from './domain/raid'
import { harbors, raids } from './infrastructure/schema'

/**
 * Rewrites a fleet event with a new name of the player: their name as attacker, in the
 * raids they launched and in the harbors that saw their fleets. It serves both erasure,
 * with the neutral name, and rectification.
 *
 * @param event - Candidate event.
 * @param playerId - Identifier of the player.
 * @param name - Name to write.
 * @returns The rewritten data, or null if the event holds no copy of the player's name.
 */
export function renameInFleet(event: StoredEvent, playerId: string, name: string) {
  const data = event.data
  if (event.stream.startsWith(RAID_STREAM_PREFIX) && event.type === 'RaidLaunched') {
    return data.attackerId === playerId && data.attackerName !== name
      ? { ...data, attackerName: name }
      : null
  }
  if (!event.stream.startsWith(HARBOR_CHANNEL_PREFIX)) return null
  if (event.type === 'FleetSighted' && data.attackerId === playerId) {
    return data.attackerName === name ? null : { ...data, attackerName: name }
  }
  if (event.type === 'BattleReported' && data.role === 'defender' && data.opponentId === playerId) {
    return data.opponentName === name ? null : { ...data, opponentName: name }
  }
  return null
}

/**
 * Rewrites a fleet event without the player's personal data: their name as attacker,
 * the name of their village as target, in the raids and in the harbors of the other
 * players.
 *
 * @param event - Candidate event.
 * @param playerId - Identifier of the player being erased.
 * @returns The rewritten data, or null if the event holds nothing to rewrite.
 */
export function redactFleetEvent(event: StoredEvent, playerId: string) {
  const data = event.data
  if (event.stream.startsWith(RAID_STREAM_PREFIX) && event.type === 'RaidLaunched') {
    const target = data.target as Target
    let changed = false
    let next = { ...data }
    if (data.attackerId === playerId && data.attackerName !== ERASED_NAME) {
      next = { ...next, attackerName: ERASED_NAME }
      changed = true
    }
    if (
      target.kind === 'village' &&
      target.playerId === playerId &&
      target.name !== ERASED_VILLAGE
    ) {
      next = { ...next, target: { ...target, name: ERASED_VILLAGE } }
      changed = true
    }
    return changed ? next : null
  }
  if (!event.stream.startsWith(HARBOR_CHANNEL_PREFIX)) return null
  if (event.type === 'FleetSighted' && data.attackerId === playerId) {
    return data.attackerName === ERASED_NAME ? null : { ...data, attackerName: ERASED_NAME }
  }
  if (event.type === 'BattleReported' && data.opponentId === playerId) {
    const name = data.role === 'defender' ? ERASED_NAME : ERASED_VILLAGE
    return data.opponentName === name ? null : { ...data, opponentName: name }
  }
  return null
}

/**
 * Creates the personal data contributor of the fleet module: the player's name, copied
 * into the raids they launched and the harbors that saw their fleets, the name of their
 * village, copied as a target, and the posture of their harbor. On erasure, the read
 * model is updated as a rebuild from the rewritten log would update it: names replaced,
 * and the village removed from the targets. A rectified name is written in the same places
 * as the neutral name of an erasure.
 *
 * @param store - Platform event store.
 * @param db - Database holding the fleet tables.
 * @returns The fleet contributor.
 */
export function createFleetPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'fleet',

    async export(playerId) {
      const launched = await store.readAll({
        streamPrefix: RAID_STREAM_PREFIX,
        types: ['RaidLaunched'],
      })
      const harbor = await store.read(harborChannel(playerId))
      const raidOf = (e: StoredEvent) => ({
        raidId: e.stream.slice(RAID_STREAM_PREFIX.length),
        target: (e.data.target as Target).name,
        ships: e.data.ships,
        tactic: e.data.tactic,
        at: e.data.at,
      })
      return {
        launched: launched.filter((e) => e.data.attackerId === playerId).map(raidOf),
        suffered: launched
          .filter((e) => {
            const target = e.data.target as Target
            return target.kind === 'village' && target.playerId === playerId
          })
          .map((e) => ({ ...raidOf(e), attacker: e.data.attackerName })),
        harbor: harbor.map((e) => ({ type: e.type, ...e.data })),
      }
    },

    redact: redactFleetEvent,

    rename: renameInFleet,

    async rectify(playerId, name) {
      await db.update(raids).set({ attackerName: name }).where(eq(raids.attackerId, playerId))
    },

    async erase(playerId) {
      await db
        .update(raids)
        .set({ attackerName: ERASED_NAME })
        .where(eq(raids.attackerId, playerId))
      await db
        .update(raids)
        .set({ targetName: ERASED_VILLAGE })
        .where(and(eq(raids.targetKind, 'village'), eq(raids.targetId, playerId)))
      await db.delete(harbors).where(eq(harbors.playerId, playerId))
    },
  }
}
