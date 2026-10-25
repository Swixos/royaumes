/**
 * Naval rules of the fleet: tactics, costs, travel, battle and plunder. Pure TypeScript,
 * with neither randomness nor clock: two identical raids always end the same way.
 *
 * @packageDocumentation
 */

/** Resource amounts, by resource name ("wood", "stone", "gold"). */
export type Amounts = Partial<Record<'wood' | 'stone' | 'gold', number>>

/** Battle tactics: ramming, boarding and blockade. */
export const TACTICS = ['ram', 'board', 'blockade'] as const

/** Battle tactic of an attacking fleet, or defensive posture of a harbor. */
export type Tactic = (typeof TACTICS)[number]

/** Tactic beaten by each tactic: boarding beats ramming, ramming beats blockade, blockade beats boarding. */
export const BEATS: Record<Tactic, Tactic> = { board: 'ram', ram: 'blockade', blockade: 'board' }

/** Posture of a harbor whose owner never chose one. */
export const DEFAULT_POSTURE: Tactic = 'blockade'

/** Smallest number of triremes in a raid. */
export const MIN_SHIPS = 1
/** Largest number of triremes in a raid, without shipyard. */
export const MAX_SHIPS = 10
/** Largest number of raids a player may have at sea at once, without shipyard. */
export const MAX_RAIDS_AT_SEA = 2
/** Triremes added to the largest raid by each level of the shipyard. */
export const SHIPS_PER_SHIPYARD_LEVEL = 2
/** Levels of the shipyard needed for each more raid at sea. */
export const SHIPYARD_LEVELS_PER_RAID = 4
/** Share of every crossing time saved per level of the shipyard. */
export const SHIPYARD_SPEEDUP = 0.04

/** Equipment cost of one trireme, withdrawn from the attacker's village. */
export const SHIP_COST = { wood: 15, stone: 5 } as const
/** Hold of one trireme: the most it brings back from a plunder. */
export const SHIP_HOLD = { wood: 10, stone: 5, gold: 2 } as const
/** Attack strength of one trireme. */
export const ATTACK_PER_SHIP = 10
/** Base defense of a village, without wall. */
export const BASE_DEFENSE = 20
/** Defense added by each level of the wall of a village. */
export const DEFENSE_PER_WALL_LEVEL = 12

/** Shortest crossing towards a village, in minutes. */
export const MIN_TRAVEL_MINUTES = 2
/** Longest crossing towards a village, in minutes. */
export const MAX_TRAVEL_MINUTES = 6

/** Island held by pirates, played by the computer. */
export interface PirateIsland {
  /** Island identifier. */
  id: string
  /** Name shown to players. */
  name: string
  /** Defense of the island. */
  defense: number
  /** Crossing time, in minutes. */
  travelMinutes: number
  /** Treasure of the day: the most a victorious fleet takes from the island. */
  treasure: Amounts
  /** Position on the sea map, in percent of its width and height. */
  map: { x: number; y: number }
}

/** Pirate islands of the sea, from the easiest to the hardest. */
export const PIRATE_ISLANDS: readonly PirateIsland[] = [
  {
    id: 'misty-reef',
    name: 'Récif des Brumes',
    defense: 25,
    travelMinutes: 3,
    treasure: { wood: 40, gold: 10 },
    map: { x: 18, y: 26 },
  },
  {
    id: 'raven-cove',
    name: 'Crique du Corbeau',
    defense: 45,
    travelMinutes: 4,
    treasure: { stone: 30, gold: 20 },
    map: { x: 80, y: 20 },
  },
  {
    id: 'scarlet-atoll',
    name: 'Atoll Écarlate',
    defense: 70,
    travelMinutes: 6,
    treasure: { wood: 60, stone: 40, gold: 40 },
    map: { x: 70, y: 78 },
  },
]

/**
 * Finds a pirate island.
 *
 * @param islandId - Island identifier.
 * @returns The island, or undefined if it does not exist.
 */
export const islandOf = (islandId: string) => PIRATE_ISLANDS.find((i) => i.id === islandId)

/**
 * Multiplies amounts by a number of triremes.
 *
 * @param unit - Amounts for one trireme.
 * @param ships - Number of triremes.
 * @returns The total amounts.
 */
const times = (unit: Amounts, ships: number): Amounts =>
  Object.fromEntries(Object.entries(unit).map(([resource, amount]) => [resource, amount * ships]))

/**
 * Equipment cost of a raid (rule 4).
 *
 * @param ships - Number of triremes.
 * @returns The resources to withdraw from the attacker's village.
 */
export const equipmentCost = (ships: number): Amounts => times(SHIP_COST, ships)

/**
 * Hold of a raid: the most its fleet brings back (rule 9).
 *
 * @param ships - Number of triremes.
 * @returns The largest plunder.
 */
export const holdOf = (ships: number): Amounts => times(SHIP_HOLD, ships)

/**
 * Hashes a text into an unsigned 32-bit integer (FNV-1a): the same text always gives the
 * same number.
 *
 * @param text - Text to hash.
 * @returns The hash.
 */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Crossing time between two villages (rule 5): from 2 to 6 minutes, the same whichever
 * village sends the fleet.
 *
 * @param a - Identifier of one player.
 * @param b - Identifier of the other player.
 * @returns The crossing time in minutes.
 */
export function travelMinutes(a: string, b: string): number {
  const [first, second] = [a, b].sort()
  const span = MAX_TRAVEL_MINUTES - MIN_TRAVEL_MINUTES + 1
  return MIN_TRAVEL_MINUTES + (hash(`${first}|${second}`) % span)
}

/**
 * Position of a village on the sea map, drawn from its owner identifier so it never moves.
 *
 * @param playerId - Owner of the village.
 * @returns The position, in percent of the map width and height.
 */
export function mapPositionOf(playerId: string): { x: number; y: number } {
  const h = hash(playerId)
  return { x: 10 + (h % 80), y: 12 + ((h >>> 8) % 74) }
}

/**
 * Defense of a village (rule 8): its wall protects it.
 *
 * @param wall - Level of the wall of the village.
 * @returns The defense.
 */
export const villageDefense = (wall: number) => BASE_DEFENSE + DEFENSE_PER_WALL_LEVEL * wall

/**
 * Levels reached by a building of a village, each with the time it was reached, as the
 * fleet read model records them from the village events.
 */
export type LevelSteps = Array<[level: number, at: number]>

/**
 * Level of a building at a given time: its constructions complete by then.
 *
 * @param steps - Levels reached by the building, with their time.
 * @param at - Time in milliseconds.
 * @returns The level at `at`; 0 if the building was not built yet.
 */
export const levelAt = (steps: LevelSteps, at: number) =>
  steps.reduce((level, [reached, when]) => (when <= at ? Math.max(level, reached) : level), 0)

/** What the shipyard of a player allows their fleets. */
export interface FleetLimits {
  /** Largest number of triremes in a raid. */
  maxShips: number
  /** Largest number of raids at sea at once. */
  maxRaids: number
  /** Factor applied to every crossing time, 1 without shipyard. */
  speed: number
}

/**
 * Limits of the fleets of a player, set by the level of their shipyard (rules 1, 3, 5).
 *
 * @param shipyard - Level of the shipyard.
 * @returns The limits.
 */
export const fleetLimits = (shipyard: number): FleetLimits => ({
  maxShips: MAX_SHIPS + SHIPS_PER_SHIPYARD_LEVEL * shipyard,
  maxRaids: MAX_RAIDS_AT_SEA + Math.floor(shipyard / SHIPYARD_LEVELS_PER_RAID),
  speed: 1 - SHIPYARD_SPEEDUP * shipyard,
})

/**
 * Crossing time of a fleet, shortened by the shipyard of its owner.
 *
 * @param minutes - Crossing time without shipyard, in minutes.
 * @param limits - Limits of the attacker's fleets.
 * @returns The crossing time in milliseconds.
 */
export const crossingMs = (minutes: number, limits: FleetLimits) =>
  Math.round(minutes * 60_000 * limits.speed)

/**
 * Multiplier of the attack, from the tactic triangle (rule 7).
 *
 * @param tactic - Tactic of the attacking fleet.
 * @param posture - Posture of the defender.
 * @returns 1.5 if the tactic beats the posture, 0.5 if it is beaten by it, 1 otherwise.
 */
export function tacticMultiplier(tactic: Tactic, posture: Tactic): number {
  if (BEATS[tactic] === posture) return 1.5
  if (BEATS[posture] === tactic) return 0.5
  return 1
}

/** Outcome of a battle. */
export interface Battle {
  /** Attack strength of the fleet. */
  attack: number
  /** Defense of the target. */
  defense: number
  /** Posture the defender held. */
  posture: Tactic
  /** True if the fleet won: its strength is strictly above the defense. */
  victory: boolean
}

/**
 * Resolves a battle (rules 7 and 8).
 *
 * @param ships - Number of attacking triremes.
 * @param tactic - Tactic of the fleet.
 * @param posture - Posture of the defender.
 * @param defense - Defense of the target.
 * @returns The battle outcome.
 */
export function fight(ships: number, tactic: Tactic, posture: Tactic, defense: number): Battle {
  const attack = ships * ATTACK_PER_SHIP * tacticMultiplier(tactic, posture)
  return { attack, defense, posture, victory: attack > defense }
}

/**
 * Plunder taken from a pirate island: its treasure, within the hold of the fleet.
 *
 * @param island - Plundered island.
 * @param ships - Number of triremes.
 * @returns The plunder.
 */
export function pirateLoot(island: PirateIsland, ships: number): Amounts {
  const hold = holdOf(ships)
  const loot: Amounts = {}
  for (const [resource, amount] of Object.entries(island.treasure) as [keyof Amounts, number][]) {
    const taken = Math.min(amount, hold[resource] ?? 0)
    if (taken > 0) loot[resource] = taken
  }
  return loot
}

/**
 * Plunder reduced after a refusal (rule 9): what was asked, less what the village lacked.
 *
 * @param asked - Plunder asked.
 * @param missing - Amounts the village lacked.
 * @returns What the village can give; empty if it can give nothing.
 */
export function reducedLoot(asked: Amounts, missing: Amounts): Amounts {
  const reduced: Amounts = {}
  for (const [resource, amount] of Object.entries(asked) as [keyof Amounts, number][]) {
    const left = amount - (missing[resource] ?? 0)
    if (left > 0) reduced[resource] = left
  }
  return reduced
}

/**
 * Tells whether amounts hold no resource.
 *
 * @param amounts - Amounts to check.
 * @returns True if no amount is positive.
 */
export const isEmpty = (amounts: Amounts) => !Object.values(amounts).some((a) => (a ?? 0) > 0)

/**
 * Day of a time, used for the daily treasure of the islands (rule 12).
 *
 * @param at - Time in milliseconds.
 * @returns The UTC day number since 1970.
 */
export const dayOf = (at: number) => Math.floor(at / 86_400_000)
