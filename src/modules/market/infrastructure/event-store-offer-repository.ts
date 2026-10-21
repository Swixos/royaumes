import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { OfferRepository } from '../application/offer-repository'
import { offerStream } from '../contracts'
import { type OfferEvent, replay } from '../domain/offer'

/**
 * {@link OfferRepository} adapter backed by the event store. The events of the offer
 * and the saga messages are recorded in a single transaction.
 *
 * @param store - Platform event store.
 * @returns The offer repository.
 */
export function createEventStoreOfferRepository(store: EventStore): OfferRepository {
  return {
    async load(offerId) {
      const stored = await store.read(offerStream(offerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as OfferEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(offerId, expectedVersion, events, messages) {
      await store.append(
        offerStream(offerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
