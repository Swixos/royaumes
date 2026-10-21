import { eq } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { OFFER_STREAM_PREFIX } from '../contracts'
import type { OfferEvent } from '../domain/offer'
import { offers } from './schema'

/**
 * Extracts the offer identifier from its stream name: "market-7f3a" gives "7f3a".
 *
 * @param event - Event of an offer.
 * @returns The offer identifier.
 */
const offerIdOf = (event: StoredEvent) => event.stream.slice(OFFER_STREAM_PREFIX.length)

/**
 * Projection of the ongoing offers, built from the market events. An offer reaching a
 * final state leaves the list.
 */
export const offersProjection: Projection = {
  name: 'market-offers',
  version: 1,
  eventTypes: [
    'OfferPublished',
    'OfferOpened',
    'OfferRejected',
    'OfferAccepted',
    'PaymentRefused',
    'TradeCompleted',
    'OfferWithdrawn',
  ],

  async apply(stored, tx) {
    const event = { type: stored.type, data: stored.data } as OfferEvent
    const offerId = offerIdOf(stored)
    /**
     * Changes the state of the offer in the table.
     *
     * @param status - New state.
     * @returns The update query.
     */
    const setStatus = (status: string) =>
      tx.update(offers).set({ status }).where(eq(offers.offerId, offerId))

    switch (event.type) {
      case 'OfferPublished':
        await tx.insert(offers).values({
          offerId,
          sellerId: event.data.sellerId,
          sellerName: event.data.sellerName,
          give: event.data.give,
          want: event.data.want,
          status: 'reserving',
          publishedAt: event.data.at,
          expiresAt: event.data.expiresAt,
        })
        return
      case 'OfferOpened':
      case 'PaymentRefused':
        await setStatus('open')
        return
      case 'OfferAccepted':
        await setStatus('settling')
        return
      case 'OfferRejected':
      case 'TradeCompleted':
      case 'OfferWithdrawn':
        await tx.delete(offers).where(eq(offers.offerId, offerId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(offers)
  },
}
