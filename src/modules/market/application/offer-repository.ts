import type { NewMessage } from '@/platform/outbox/outbox'
import type { OfferEvent, OfferState } from '../domain/offer'

/** Persistence port of the offers, owned by the application layer. */
export interface OfferRepository {
  /**
   * Loads an offer, rebuilt from its events.
   *
   * @param offerId - Offer identifier.
   * @returns The state and its version, the number of stored events.
   */
  load(offerId: string): Promise<{ state: OfferState; version: number }>

  /**
   * Appends new events, and the saga messages they trigger, in a single transaction.
   *
   * @param offerId - Offer identifier.
   * @param expectedVersion - Version read at load time.
   * @param events - Events to append.
   * @param messages - Saga messages to record in the outbox.
   * @throws `ConcurrencyError` if other events were stored since the read.
   */
  save(
    offerId: string,
    expectedVersion: number,
    events: OfferEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
