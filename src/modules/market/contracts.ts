/**
 * Shared public entry of the market module, usable by both the server and the
 * interface.
 *
 * @packageDocumentation
 */
import { z } from 'zod'
import { ResourceAmounts } from '@/modules/realm/contracts'
import type { Amounts } from './domain/offer'

export type { Amounts, OfferError, OfferStatus } from './domain/offer'
export { OFFER_TTL_MS } from './domain/offer'
export type { OfferView } from './domain/view'

/** Expected body to publish an offer: the resources given, and those wanted. */
export const PublishOfferInput = z.object({ give: ResourceAmounts, want: ResourceAmounts })

/** Offer as shown by the market list. */
export interface OfferSummary {
  /** Offer identifier. */
  offerId: string
  /** Name of the seller. */
  sellerName: string
  /** Resources given by the seller. */
  give: Amounts
  /** Resources wanted in return. */
  want: Amounts
  /** Progress of the trade saga; final offers leave the list. */
  status: 'reserving' | 'open' | 'settling'
  /** True if the viewing player is the seller. */
  mine: boolean
  /** Expiry time in milliseconds. */
  expiresAt: number
}

/** List of offers returned by the API. */
export interface MarketList {
  /** Position of the log up to which the list is up to date. */
  position: number
  /** Offers of the list. */
  offers: OfferSummary[]
}

/** Prefix shared by the stream names of every offer. */
export const OFFER_STREAM_PREFIX = 'market-'

/**
 * Builds the name of the stream holding the events of an offer.
 *
 * @param offerId - Offer identifier.
 * @returns The stream name, `market-<offerId>`.
 */
export const offerStream = (offerId: string) => `${OFFER_STREAM_PREFIX}${offerId}`

/** Name of the global real-time channel of the market, which announces offer changes. */
export const MARKET_CHANNEL = 'market'

/** Topics of the messages addressed to the market module. */
export const MARKET_TOPICS = {
  /** Reply of the village module to a resource transfer. */
  transferResult: 'market.transfer-result',
  /** Delayed reminder of an offer, at its deadline. */
  expire: 'market.expire',
} as const
