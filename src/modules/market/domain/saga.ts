/**
 * Steps of the trade saga: for each event of an offer, the requests to address to the
 * village module, or to the offer itself. The domain decides on these requests; the
 * service turns them into outbox messages.
 *
 * @packageDocumentation
 */
import { type Amounts, type OfferEvent, type OfferState, transferIdOf } from './offer'

/** Request produced by a step of the saga. */
export type SagaRequest =
  /** Withdraw resources: the village module replies, and the reply moves the saga forward. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Deposit resources: a deposit cannot fail, so no reply is expected. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }
  /** Reminder addressed to the offer itself at its deadline, to withdraw it if still open. */
  | { kind: 'expire'; offerId: string; at: number }

/**
 * Lists the requests triggered by an event:
 * 1. publication puts the seller's resources in escrow (compensable step);
 * 2. once open, the offer will remind itself at its deadline;
 * 3. acceptance withdraws the buyer's payment (pivot step);
 * 4. a completed trade delivers to both players (steps retried until they succeed);
 * - withdrawal refunds the escrowed resources to the seller (compensation);
 * - a refused reservation or payment withdrew nothing, so there is nothing to compensate.
 *
 * @param state - State after the event is applied: it holds the seller, the buyer and
 *   the amounts of the offer.
 * @param event - Recorded event.
 * @returns The requests to send.
 */
export function requestsFor(state: OfferState, event: OfferEvent): SagaRequest[] {
  const id = (step: string) => transferIdOf(state.offerId, step)

  switch (event.type) {
    case 'OfferPublished':
      return [
        {
          kind: 'withdraw',
          transferId: id('reserve'),
          playerId: state.sellerId,
          resources: state.give,
        },
      ]

    case 'OfferOpened':
      return [{ kind: 'expire', offerId: state.offerId, at: state.expiresAt }]

    case 'OfferAccepted':
      return [
        {
          kind: 'withdraw',
          transferId: id(`pay-${state.attempt}`),
          playerId: event.data.buyerId,
          resources: state.want,
        },
      ]

    case 'TradeCompleted':
      return [
        {
          kind: 'deposit',
          transferId: id('deliver-seller'),
          playerId: state.sellerId,
          resources: state.want,
        },
        {
          kind: 'deposit',
          transferId: id('deliver-buyer'),
          playerId: state.buyerId ?? '',
          resources: state.give,
        },
      ]

    case 'OfferWithdrawn':
      return [
        {
          kind: 'deposit',
          transferId: id('refund'),
          playerId: state.sellerId,
          resources: state.give,
        },
      ]

    case 'OfferRejected':
    case 'PaymentRefused':
      return []
  }
}
