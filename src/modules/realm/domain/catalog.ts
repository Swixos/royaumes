/**
 * Village content: resources, buildings and balancing values. This file only
 * holds data; the rules using it live in `village.ts`, so rebalancing the game
 * only changes this file.
 *
 * @packageDocumentation
 */

/** Game resources, declared `as const` to derive a union type. */
export const RESOURCES = ['wood', 'stone', 'gold'] as const
/** A game resource. */
export type Resource = (typeof RESOURCES)[number]

/** Amount of each resource. */
export type Stock = Record<Resource, number>

/** Village buildings. */
export const BUILDINGS = ['sawmill', 'quarry', 'mine'] as const
/** A village building. */
export type Building = (typeof BUILDINGS)[number]

/** Level of each building, 0 meaning not built. */
export type Levels = Record<Building, number>

/** Maximum level of a building. */
export const MAX_LEVEL = 10

/**
 * For each building: the produced resource, the production per minute and
 * per level, and the cost of the first upgrade.
 */
export const CATALOG: Record<
  Building,
  { produces: Resource; perMinute: number; baseCost: Partial<Stock> }
> = {
  sawmill: { produces: 'wood', perMinute: 10, baseCost: { wood: 40, stone: 20 } },
  quarry: { produces: 'stone', perMinute: 6, baseCost: { wood: 60, stone: 10 } },
  mine: { produces: 'gold', perMinute: 2, baseCost: { wood: 80, stone: 60 } },
}

/** Cost rule exponent: base cost × (level + 1) ^ COST_EXPONENT. */
export const COST_EXPONENT = 1.3

/** Stock of a village when founded. */
export const STARTING_STOCK: Stock = { wood: 100, stone: 50, gold: 0 }
/** Building levels of a village when founded. */
export const STARTING_LEVELS: Levels = { sawmill: 1, quarry: 1, mine: 0 }
