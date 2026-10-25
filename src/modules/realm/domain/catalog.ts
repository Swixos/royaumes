/**
 * Village content: resources, buildings and balancing values. This file only
 * holds data and the formulas reading it; the rules using them live in `village.ts`,
 * so rebalancing the game only changes this file.
 *
 * @packageDocumentation
 */

/** Game resources, declared `as const` to derive a union type. */
export const RESOURCES = ['wood', 'stone', 'gold'] as const
/** A game resource. */
export type Resource = (typeof RESOURCES)[number]

/** Amount of each resource. */
export type Stock = Record<Resource, number>

/**
 * Village buildings, in the order of the screen: the senate first, then production,
 * storage, defense and the shipyard.
 */
export const BUILDINGS = [
  'senate',
  'sawmill',
  'quarry',
  'mine',
  'warehouse',
  'wall',
  'shipyard',
] as const
/** A village building. */
export type Building = (typeof BUILDINGS)[number]

/** Buildings producing a resource. */
export const PRODUCERS = ['sawmill', 'quarry', 'mine'] as const
/** A building producing a resource. */
export type Producer = (typeof PRODUCERS)[number]

/** Level of each building, 0 meaning not built. */
export type Levels = Record<Building, number>

/** Maximum level of a building. */
export const MAX_LEVEL = 10

/** For each producer: the produced resource and the production per minute and per level. */
export const PRODUCTION: Record<Producer, { produces: Resource; perMinute: number }> = {
  sawmill: { produces: 'wood', perMinute: 10 },
  quarry: { produces: 'stone', perMinute: 6 },
  mine: { produces: 'gold', perMinute: 2 },
}

/** Cost of the first upgrade of each building. */
export const BASE_COSTS: Record<Building, Partial<Stock>> = {
  senate: { wood: 60, stone: 60 },
  sawmill: { wood: 40, stone: 20 },
  quarry: { wood: 60, stone: 10 },
  mine: { wood: 80, stone: 60 },
  warehouse: { wood: 50, stone: 30 },
  wall: { wood: 40, stone: 80 },
  shipyard: { wood: 100, stone: 40, gold: 10 },
}

/** Cost rule exponent: base cost × (level + 1) ^ COST_EXPONENT. */
export const COST_EXPONENT = 1.3

/** Duration of the first upgrade of each building, in seconds. */
export const BASE_SECONDS: Record<Building, number> = {
  senate: 40,
  sawmill: 15,
  quarry: 15,
  mine: 25,
  warehouse: 20,
  wall: 30,
  shipyard: 35,
}

/** Duration rule exponent: base duration × (level + 1) ^ DURATION_EXPONENT. */
export const DURATION_EXPONENT = 1.2

/** Share of every duration saved per level of the senate. */
export const SENATE_SPEEDUP = 0.05

/** Number of upgrades a village can have waiting or under way at once. */
export const QUEUE_SLOTS = 2

/** Levels of other buildings a building needs before its first construction. */
export const REQUIREMENTS: Record<Building, Partial<Levels>> = {
  senate: {},
  sawmill: {},
  quarry: {},
  mine: { senate: 2 },
  warehouse: {},
  wall: { senate: 3 },
  shipyard: { senate: 2, sawmill: 3 },
}

/** Stock of a village when founded. */
export const STARTING_STOCK: Stock = { wood: 100, stone: 50, gold: 0 }

/** Building levels of a village when founded. */
export const STARTING_LEVELS: Levels = {
  senate: 1,
  sawmill: 1,
  quarry: 1,
  mine: 0,
  warehouse: 1,
  wall: 0,
  shipyard: 0,
}

/**
 * Storage capacity of the warehouse, for each resource: production stops when the stock
 * of a resource reaches it.
 *
 * @param level - Level of the warehouse.
 * @returns The capacity, per resource.
 */
export const warehouseCapacity = (level: number) => Math.round(300 * (level + 1) ** 1.5)

/**
 * Amount of each resource the warehouse hides from plunderers: a raid never takes it.
 *
 * @param level - Level of the warehouse.
 * @returns The hidden amount, per resource.
 */
export const hiddenAmount = (level: number) => 60 * level

/**
 * Duration of an upgrade, shortened by the senate.
 *
 * @param building - Building to upgrade.
 * @param level - Current level of the building.
 * @param senate - Level of the senate.
 * @returns The duration in milliseconds.
 */
export function buildDuration(building: Building, level: number, senate: number) {
  const base = BASE_SECONDS[building] * (level + 1) ** DURATION_EXPONENT
  const speedup = 1 - SENATE_SPEEDUP * Math.min(senate, MAX_LEVEL)
  return Math.round(base * speedup) * 1000
}
