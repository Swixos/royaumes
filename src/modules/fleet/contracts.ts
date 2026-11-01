/**
 * Shared public entry of the fleet module, usable by both the server and the interface.
 * It only holds types, validation schemas and pure functions, with no server-only code.
 *
 * @packageDocumentation
 */
import { z } from 'zod'
import { type Army, UnitCounts } from '@/modules/realm/contracts'
import type { Amounts, FleetLimits, Tactic } from './domain/naval'
import type { RaidStatus } from './domain/raid'

export type {
  ArmyError,
  ArmyRules,
  BattleReport,
  Damage,
  LandFight,
  NavalFight,
} from './domain/battle'
export {
  armyError,
  BASE_DEFENSE,
  fightArmies,
  landOf,
  paceOf,
  shipsOf,
  WALL_BONUS,
} from './domain/battle'
export type { HarborEvent } from './domain/harbor'
export type { Amounts, Battle, FleetLimits, LevelSteps, PirateIsland, Tactic } from './domain/naval'
export {
  ATTACK_PER_SHIP,
  BEATS,
  crossingMinutes,
  DEFAULT_POSTURE,
  DEFENSE_PER_WALL_LEVEL,
  equipmentCost,
  fight,
  fleetLimits,
  hash,
  holdOf,
  islandTravelMinutes,
  levelAt,
  MAX_RAIDS_AT_SEA,
  MAX_SHIPS,
  MAX_TRAVEL_MINUTES,
  MIN_SHIPS,
  mapPositionOf,
  PIRATE_ISLANDS,
  SHIP_COST,
  SHIP_HOLD,
  seaDistance,
  TACTICS,
  travelMinutes,
  villageDefense,
} from './domain/naval'
export type { RaidError, RaidStatus, Target } from './domain/raid'
export type { RaidView } from './domain/view'

/** Expected body to launch a raid. The target name is never taken from the request. */
export const LaunchRaidInput = z.object({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('village'), playerId: z.string().min(1).max(100) }),
    z.object({ kind: z.literal('pirates'), islandId: z.string().min(1).max(50) }),
  ]),
  army: UnitCounts,
})

/** Expected query of the targets: an optional part of a village name to look for. */
export const TargetsQuery = z.object({ search: z.string().trim().max(30).optional() })

/** Prefix shared by the stream names of every raid. */
export const RAID_STREAM_PREFIX = 'raid-'

/**
 * Builds the name of the stream holding the events of a raid.
 *
 * @param raidId - Raid identifier.
 * @returns The stream name, `raid-<raidId>`.
 */
export const raidStream = (raidId: string) => `${RAID_STREAM_PREFIX}${raidId}`

/** Prefix shared by the stream, and channel, names of every harbor. */
export const HARBOR_CHANNEL_PREFIX = 'harbor-'

/**
 * Builds the name of the real-time channel of a player's harbor. It equals the name of
 * the stream holding the harbor events: listening to it means receiving that stream.
 *
 * @param playerId - Player identifier.
 * @returns The channel name, `harbor-<playerId>`.
 */
export const harborChannel = (playerId: string) => `${HARBOR_CHANNEL_PREFIX}${playerId}`

/** Topics of the messages addressed to the fleet module. */
export const FLEET_TOPICS = {
  /** Reply of the village module to a resource transfer. */
  transferResult: 'fleet.transfer-result',
  /** Delayed reminder of a raid, at the arrival of its fleet. */
  arrive: 'fleet.arrive',
  /** Notice addressed by a raid to a player's harbor. */
  notice: 'fleet.notice',
} as const

/** Position on the sea map, in percent of its width and height. */
export interface MapPoint {
  /** Horizontal position. */
  x: number
  /** Vertical position. */
  y: number
}

/** Village of another player, as a target. */
export interface VillageTarget {
  /** Owner of the village. */
  playerId: string
  /** Name of the village. */
  name: string
  /** Defense of the village without troops, its wall included. */
  defense: number
  /** Level of the wall of the village. */
  wall: number
  /** Crossing time from the viewer's village, shipyard included, in minutes. */
  travelMinutes: number
  /** Position on the sea map. */
  map: MapPoint
}

/** Pirate island, as a target. */
export interface IslandTarget {
  /** Island identifier. */
  islandId: string
  /** Name of the island. */
  name: string
  /** Units guarding the island, with the reserve its captain readies against the viewer. */
  garrison: Army
  /** Crossing time from the viewer's village, shipyard included, in minutes. */
  travelMinutes: number
  /** Treasure of the day. */
  treasure: Amounts
  /** True if the viewer already raided it today. */
  raidedToday: boolean
  /** Position on the sea map. */
  map: MapPoint
}

/** Targets returned by the API. */
export interface TargetsList {
  /** Position of the log up to which the list is up to date. */
  position: number
  /**
   * Village of the viewer, or null if they have none: its defense, the limits its
   * shipyard gives to its fleets, and the units at home, ready to sail.
   */
  home: {
    name: string
    defense: number
    limits: FleetLimits
    map: MapPoint
    garrison: Army
  } | null
  /** Villages of the other players. */
  villages: VillageTarget[]
  /** Pirate islands. */
  islands: IslandTarget[]
}

/** Raid as shown by the list of a player's raids. */
export interface RaidSummary {
  /** Raid identifier. */
  raidId: string
  /** Side of the viewer. */
  role: 'attacker' | 'defender'
  /** Identifier of the attacker, which places their village on the sea map. */
  attackerId: string
  /** Name of the attacker. */
  attackerName: string
  /** Kind of target. */
  targetKind: 'village' | 'pirates'
  /** Identifier of the target: its owner, or the island. */
  targetId: string
  /** Name of the target. */
  targetName: string
  /** Number of ships. */
  ships: number
  /** Tactic of a fleet of triremes: shown to the defender only after the battle. */
  tactic: Tactic | null
  /** Army sent: shown to the defender only after the battle; null for triremes. */
  army: Army | null
  /** Time the surviving units come home; 0 before they turn back. */
  returnsAt: number
  /** Progress of the raid. */
  status: RaidStatus
  /** Launch time in milliseconds. */
  launchedAt: number
  /** Time the fleet sailed; 0 before. */
  sailedAt: number
  /** Arrival time; 0 before the fleet sails. */
  arrivesAt: number
  /** Battle outcome for the attacker, once fought. */
  victory: boolean | null
  /** Plunder brought back, once known. */
  loot: Amounts | null
}

/** Raids of a player returned by the API. */
export interface RaidsList {
  /** Position of the log up to which the list is up to date. */
  position: number
  /** Raids, latest first. */
  raids: RaidSummary[]
}

/** Harbor of the player returned by the API. */
export interface HarborView {
  /** Units at home, defending the village. */
  garrison: Army
  /** Level of the wall. */
  wall: number
  /** Latest notices of the harbor, latest first, with their stream version. */
  log: { version: number; type: string; data: Record<string, unknown> }[]
}
