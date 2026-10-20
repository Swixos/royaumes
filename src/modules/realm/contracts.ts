/**
 * Shared public entry of the realm module, usable by both the server and the
 * interface. It only holds types, validation schemas and pure functions, with
 * no server-only code.
 *
 * @packageDocumentation
 */
import { z } from 'zod'
import { BUILDINGS } from './domain/catalog'

export type { Building, Resource, Stock } from './domain/catalog'
export { BUILDINGS, MAX_LEVEL, RESOURCES } from './domain/catalog'
export type { DomainError, VillageView } from './domain/village'
export { stockAt } from './domain/village'

/** Expected body to found a village. */
export const FoundVillageInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(30, 'Le nom doit comporter au plus 30 caractères'),
})

/** Expected body to upgrade a building from the catalog. */
export const UpgradeBuildingInput = z.object({
  building: z.enum(BUILDINGS),
})

/**
 * Builds the name of the real-time channel of a player's village. It equals the
 * name of the event store stream holding the village events: listening to this
 * channel means receiving that stream.
 *
 * @param userId - Player identifier.
 * @returns The channel name, `village-<userId>`.
 */
export const villageChannel = (userId: string) => `village-${userId}`
