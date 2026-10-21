/**
 * View of an offer: what a given player sees of it.
 *
 * @packageDocumentation
 */
import type { Amounts, OfferState, OfferStatus } from './offer'

/** Offer as shown to a player. */
export interface OfferView {
  /** Offer identifier. */
  offerId: string
  /** Name of the seller. */
  sellerName: string
  /** Resources given by the seller. */
  give: Amounts
  /** Resources wanted in return. */
  want: Amounts
  /** Progress of the trade saga. */
  status: OfferStatus
  /** True if the viewing player is the seller. */
  isSeller: boolean
  /** Buyer whose payment is in progress, or who completed the trade. */
  buyerName: string | null
  /** Expiry time in milliseconds. */
  expiresAt: number
  /** Resources the viewer lacked at their last refused payment; null otherwise. */
  missing: Amounts | null
  /** Reason the offer was withdrawn, if it was. */
  withdrawnBecause: 'seller' | 'expired' | null
}

/**
 * Builds the view of an offer for a player. The detail of a refused payment only
 * concerns the refused buyer.
 *
 * @param state - Offer state.
 * @param viewerId - Identifier of the viewing player.
 * @returns The view, or null if the offer does not exist.
 */
export function toView(state: OfferState, viewerId: string): OfferView | null {
  if (!state.exists) return null
  return {
    offerId: state.offerId,
    sellerName: state.sellerName,
    give: state.give,
    want: state.want,
    status: state.status,
    isSeller: state.sellerId === viewerId,
    buyerName: state.buyerName,
    expiresAt: state.expiresAt,
    missing: state.refusal?.buyerId === viewerId ? state.refusal.missing : null,
    withdrawnBecause: state.withdrawnBecause,
  }
}
