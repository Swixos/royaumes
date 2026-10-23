import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore, StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { OFFER_STREAM_PREFIX } from './contracts'
import { offers } from './infrastructure/schema'

/**
 * Rewrites a market event with a new name of the player: their name as seller, or as
 * buyer. It serves both erasure, with the neutral name, and rectification.
 *
 * @param event - Candidate event.
 * @param playerId - Identifier of the player.
 * @param name - Name to write.
 * @returns The rewritten data, or null if the event holds no copy of the player's name.
 */
function renameInOffer(event: StoredEvent, playerId: string, name: string) {
  if (!event.stream.startsWith(OFFER_STREAM_PREFIX)) return null
  if (event.type === 'OfferPublished' && event.data.sellerId === playerId) {
    return event.data.sellerName === name ? null : { ...event.data, sellerName: name }
  }
  if (event.type === 'OfferAccepted' && event.data.buyerId === playerId) {
    return event.data.buyerName === name ? null : { ...event.data, buyerName: name }
  }
  return null
}

/**
 * Creates the personal data contributor of the market module: the player's name, copied
 * into the offers they published and the acceptances they made. On erasure or rectification,
 * the table of
 * ongoing offers, which holds the seller name, is updated.
 *
 * @param store - Platform event store.
 * @param db - Database holding the offers table.
 * @returns The market contributor.
 */
export function createMarketPersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'market',

    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: OFFER_STREAM_PREFIX,
        types: ['OfferPublished', 'OfferAccepted'],
      })
      const offerId = (stream: string) => stream.slice(OFFER_STREAM_PREFIX.length)
      return {
        published: stored
          .filter((e) => e.type === 'OfferPublished' && e.data.sellerId === playerId)
          .map((e) => ({
            offerId: offerId(e.stream),
            give: e.data.give,
            want: e.data.want,
            at: e.data.at,
          })),
        accepted: stored
          .filter((e) => e.type === 'OfferAccepted' && e.data.buyerId === playerId)
          .map((e) => ({ offerId: offerId(e.stream), at: e.data.at })),
      }
    },

    rename: renameInOffer,

    redact: (event, playerId) => renameInOffer(event, playerId, ERASED_NAME),

    async erase(playerId) {
      await db.update(offers).set({ sellerName: ERASED_NAME }).where(eq(offers.sellerId, playerId))
    },

    async rectify(playerId, name) {
      await db.update(offers).set({ sellerName: name }).where(eq(offers.sellerId, playerId))
    },
  }
}
