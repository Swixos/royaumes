/**
 * Shared public entry of the realm module, usable by both the server and the
 * interface. It only holds types, validation schemas and pure functions, with
 * no server-only code.
 *
 * @packageDocumentation
 */
import { z } from 'zod'
import { BUILDINGS, type Stock } from './domain/catalog'

export type { Building, Levels, Producer, Resource, Stock } from './domain/catalog'
export {
  BUILDINGS,
  hiddenAmount,
  MAX_LEVEL,
  PRODUCERS,
  PRODUCTION,
  REQUIREMENTS,
  RESOURCES,
  STARTING_LEVELS,
  warehouseCapacity,
} from './domain/catalog'
export type { Construction, DomainError, VillageView } from './domain/village'
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

/** Prefix shared by the stream, and channel, names of every village. */
export const VILLAGE_CHANNEL_PREFIX = 'village-'

/**
 * Builds the name of the real-time channel of a player's village. It equals the
 * name of the event store stream holding the village events: listening to this
 * channel means receiving that stream.
 *
 * @param userId - Player identifier.
 * @returns The channel name, `village-<userId>`.
 */
export const villageChannel = (userId: string) => `${VILLAGE_CHANNEL_PREFIX}${userId}`

/**
 * Topics of the messages the village module handles: its published language for
 * resource transfers.
 */
export const REALM_TOPICS = {
  /** Withdraw resources from a village; it may be refused. */
  withdraw: 'realm.withdraw',
  /** Deposit resources into a village; it cannot be refused. */
  deposit: 'realm.deposit',
} as const

/** Amount of a resource in a transfer: a strictly positive integer. */
const Amount = z.number().int().positive()

/** Resource amounts of a transfer: at least one resource, and no other key. */
export const ResourceAmounts = z
  .object({ wood: Amount.optional(), stone: Amount.optional(), gold: Amount.optional() })
  .strict()
  .refine((amounts) => Object.keys(amounts).length > 0, 'Au moins une ressource est attendue')

/** Content of a withdrawal or deposit message. */
export const TransferRequest = z.object({
  /** Transfer identifier, chosen by the requester: a duplicate carries the same one. */
  transferId: z.string().min(1),
  /** Player whose village is concerned. */
  playerId: z.string().min(1),
  /** Resources to move. */
  resources: ResourceAmounts,
  /** True for a plunder, which cannot take the resources hidden by the warehouse. */
  plunder: z.boolean().optional(),
  /** Topic of the reply message; missing if the requester expects no reply. */
  replyTo: z.string().min(1).optional(),
})

/** Content of a withdrawal or deposit message, inferred from its schema. */
export type TransferRequest = z.infer<typeof TransferRequest>

/** Content of the reply message sent by the village module to the `replyTo` topic. */
export interface TransferResult {
  /** Identifier of the transfer the reply is about. */
  transferId: string
  /** Outcome of the transfer. */
  outcome: 'withdrawn' | 'refused' | 'deposited'
  /** Missing amounts, when refused. */
  missing?: Partial<Stock>
}
