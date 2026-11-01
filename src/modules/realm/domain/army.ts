/**
 * Units of the village, as in Grepolis: land troops trained at the barracks, ships built at
 * the shipyard, each with its cost, its population, its training time and its fighting
 * values. This file holds the data and the formulas reading it, with no rule of the
 * village: rebalancing the troops only changes this file.
 *
 * @packageDocumentation
 */
import type { Building, Levels, Stock } from './catalog'

/** Land units, trained at the barracks. */
export const LAND_UNITS = ['swordsman', 'slinger', 'archer', 'hoplite'] as const

/** Naval units, built at the shipyard. */
export const NAVAL_UNITS = ['transport', 'bireme', 'lightShip'] as const

/** Every unit, land units first. */
export const UNITS = [...LAND_UNITS, ...NAVAL_UNITS] as const

/** A land unit. */
export type LandUnit = (typeof LAND_UNITS)[number]

/** A naval unit. */
export type NavalUnit = (typeof NAVAL_UNITS)[number]

/** A unit. */
export type Unit = (typeof UNITS)[number]

/** Number of each unit, missing meaning none. */
export type Army = Partial<Record<Unit, number>>

/** Kinds of damage a land unit deals; each defender resists them differently. */
export const DAMAGES = ['blunt', 'sharp', 'distance'] as const

/** A kind of damage. */
export type Damage = (typeof DAMAGES)[number]

/** Values of a land unit. */
export interface LandStats {
  /** Attack of one unit. */
  attack: number
  /** Kind of damage it deals. */
  damage: Damage
  /** Defense of one unit against each kind of damage. */
  defense: Record<Damage, number>
  /** Resources one unit carries back from a plunder. */
  booty: number
}

/** Values of a naval unit. */
export interface NavalStats {
  /** Attack of one ship in a naval battle. */
  attack: number
  /** Defense of one ship in a naval battle. */
  defense: number
  /** Land units one ship carries. */
  capacity: number
  /** Speed of the ship: the slowest ship of a fleet sets its crossing time. */
  speed: number
}

/** Fighting values of the land units, from Grepolis. */
export const LAND_STATS: Record<LandUnit, LandStats> = {
  swordsman: {
    attack: 5,
    damage: 'blunt',
    defense: { blunt: 14, sharp: 8, distance: 30 },
    booty: 16,
  },
  slinger: {
    attack: 23,
    damage: 'distance',
    defense: { blunt: 7, sharp: 8, distance: 2 },
    booty: 8,
  },
  archer: {
    attack: 8,
    damage: 'distance',
    defense: { blunt: 7, sharp: 25, distance: 13 },
    booty: 12,
  },
  hoplite: {
    attack: 16,
    damage: 'sharp',
    defense: { blunt: 18, sharp: 12, distance: 7 },
    booty: 8,
  },
}

/** Fighting values of the ships, from Grepolis. */
export const NAVAL_STATS: Record<NavalUnit, NavalStats> = {
  transport: { attack: 0, defense: 0, capacity: 10, speed: 8 },
  bireme: { attack: 24, defense: 160, capacity: 0, speed: 15 },
  lightShip: { attack: 200, defense: 60, capacity: 0, speed: 13 },
}

/** Cost of one unit. */
export const UNIT_COSTS: Record<Unit, Partial<Stock>> = {
  swordsman: { wood: 20, stone: 8 },
  slinger: { wood: 22, stone: 12, gold: 3 },
  archer: { wood: 18, stone: 10, gold: 4 },
  hoplite: { wood: 15, stone: 20, gold: 6 },
  transport: { wood: 40, stone: 15 },
  bireme: { wood: 50, stone: 30, gold: 8 },
  lightShip: { wood: 60, stone: 40, gold: 12 },
}

/** Population one unit takes at the farm. */
export const UNIT_POPULATION: Record<Unit, number> = {
  swordsman: 1,
  slinger: 1,
  archer: 1,
  hoplite: 1,
  transport: 3,
  bireme: 4,
  lightShip: 5,
}

/** Training time of one unit, in seconds, before the speedup of its building. */
export const UNIT_SECONDS: Record<Unit, number> = {
  swordsman: 8,
  slinger: 10,
  archer: 10,
  hoplite: 14,
  transport: 20,
  bireme: 25,
  lightShip: 30,
}

/** Level of its building each unit needs. */
export const UNIT_LEVELS: Record<Unit, number> = {
  swordsman: 1,
  slinger: 2,
  archer: 3,
  hoplite: 5,
  transport: 1,
  bireme: 2,
  lightShip: 4,
}

/** Share of every training time saved per level of the building training the unit. */
export const TRAINING_SPEEDUP = 0.05

/** Number of orders each building can have waiting or under way at once. */
export const TRAINING_SLOTS = 3

/** Largest number of units in one order. */
export const MAX_ORDER = 50

/**
 * Tells whether a unit fights on land.
 *
 * @param unit - Unit to check.
 * @returns True for a land unit.
 */
export const isLand = (unit: Unit): unit is LandUnit =>
  (LAND_UNITS as readonly string[]).includes(unit)

/**
 * Building training a unit: the barracks for land units, the shipyard for ships.
 *
 * @param unit - Unit to train.
 * @returns The building.
 */
export const trainedAt = (unit: Unit): Extract<Building, 'barracks' | 'shipyard'> =>
  isLand(unit) ? 'barracks' : 'shipyard'

/**
 * Tells whether the buildings of a village allow a unit.
 *
 * @param levels - Building levels.
 * @param unit - Unit to train.
 * @returns True if its building has the level the unit needs.
 */
export const unitAllowed = (levels: Levels, unit: Unit) =>
  levels[trainedAt(unit)] >= UNIT_LEVELS[unit]

/**
 * Training time of one unit, shortened by the level of its building.
 *
 * @param unit - Unit to train.
 * @param level - Level of the building training it.
 * @returns The time in milliseconds.
 */
export const trainingMs = (unit: Unit, level: number) =>
  Math.round(UNIT_SECONDS[unit] * (1 - TRAINING_SPEEDUP * Math.min(level, 10)) * 1000)

/** Order of units in training: they come out one after the other. */
export interface Training {
  /** Unit trained. */
  unit: Unit
  /** Number of units ordered. */
  count: number
  /** Time the first unit starts, in milliseconds. */
  startsAt: number
  /** Training time of one unit, in milliseconds. */
  each: number
}

/**
 * Number of units of an order out of training at a given time.
 *
 * @param training - Order.
 * @param at - Time in milliseconds.
 * @returns The units trained by then, from 0 to the order size.
 */
export function trainedBy(training: Training, at: number): number {
  if (at < training.startsAt) return 0
  return Math.min(training.count, Math.floor((at - training.startsAt) / training.each))
}

/**
 * Time the last unit of an order is trained.
 *
 * @param training - Order.
 * @returns The time in milliseconds.
 */
export const trainingEnd = (training: Training) =>
  training.startsAt + training.count * training.each

/**
 * Adds two armies, or removes one from the other.
 *
 * @param army - First army.
 * @param other - Army to add or remove.
 * @param sign - 1 to add, -1 to remove.
 * @returns A new army, without the units at zero.
 */
export function addArmy(army: Army, other: Army, sign: 1 | -1 = 1): Army {
  const result: Army = {}
  for (const unit of UNITS) {
    const count = (army[unit] ?? 0) + sign * (other[unit] ?? 0)
    if (count !== 0) result[unit] = count
  }
  return result
}

/**
 * Units of an army, in the order of the catalog.
 *
 * @param army - Army to read.
 * @returns The units present, with their number.
 */
export const unitsOf = (army: Army): Array<[Unit, number]> =>
  UNITS.filter((unit) => (army[unit] ?? 0) > 0).map((unit) => [unit, army[unit] ?? 0])

/**
 * Total number of units of an army.
 *
 * @param army - Army to count.
 * @returns The number of units.
 */
export const armySize = (army: Army) => unitsOf(army).reduce((sum, [, count]) => sum + count, 0)

/**
 * Population an army takes at the farm.
 *
 * @param army - Army to count.
 * @returns The population.
 */
export const populationOf = (army: Army) =>
  unitsOf(army).reduce((sum, [unit, count]) => sum + UNIT_POPULATION[unit] * count, 0)

/**
 * Units at home at a given time: the units counted so far, plus those coming out of the
 * orders under way by then. The count may go below zero on its own while an order is
 * still feeding it: a unit leaving as soon as it is trained is taken from it ahead.
 *
 * @param base - Units at home, orders apart.
 * @param trainings - Orders under way.
 * @param at - Time in milliseconds.
 * @returns The units at home.
 */
export function armyAt(base: Army, trainings: readonly Training[], at: number): Army {
  let army = { ...base }
  for (const training of trainings) {
    army = addArmy(army, { [training.unit]: trainedBy(training, at) })
  }
  return army
}

/**
 * Tells what an army lacks to cover another.
 *
 * @param available - Units available.
 * @param wanted - Units asked.
 * @returns The missing units; empty if the available units are enough.
 */
export function missingUnits(available: Army, wanted: Army): Army {
  const missing: Army = {}
  for (const [unit, count] of unitsOf(wanted)) {
    const lack = count - Math.max(0, available[unit] ?? 0)
    if (lack > 0) missing[unit] = lack
  }
  return missing
}

/** One move of units in the ledger of a village, as read from its events. */
export type ArmyMove =
  /** Units ordered, coming out of training one after the other. */
  | ({ kind: 'train' } & Training)
  /** Units leaving or coming home, or lost, at a given time. */
  | { kind: 'move'; at: number; units: Army; sign: 1 | -1 }

/**
 * Units at home in a village at a given time, from the moves of its units. Another module
 * reading the published events of the village counts its garrison with it.
 *
 * @param moves - Moves of the units of the village, in the order of its events.
 * @param at - Time in milliseconds.
 * @returns The units at home, never below zero.
 */
export function garrisonAt(moves: readonly ArmyMove[], at: number): Army {
  let army: Army = {}
  for (const move of moves) {
    if (move.kind === 'train') army = addArmy(army, { [move.unit]: trainedBy(move, at) })
    else if (move.at <= at) army = addArmy(army, move.units, move.sign)
  }
  const home: Army = {}
  for (const [unit, count] of unitsOf(army)) home[unit] = count
  return home
}
