/**
 * Market domain: a trade offer and its fate, following the decider pattern. The state
 * of an offer sums up the progress of the trade saga. Pure TypeScript: it imports no
 * other module.
 *
 * @packageDocumentation
 */

/** Resource amounts of an offer, by resource name ("wood", "stone", "gold"). */
export type Amounts = Partial<Record<string, number>>

/** Validity of an open offer, in milliseconds. */
export const OFFER_TTL_MS = 24 * 60 * 60_000

/** States of an offer; the last three are final. */
export type OfferStatus = 'reserving' | 'open' | 'settling' | 'completed' | 'rejected' | 'withdrawn'

/** State of an offer, rebuilt from its events. */
export interface OfferState {
  /** False until the offer is published. */
  exists: boolean
  /** Offer identifier. */
  offerId: string
  /** Identifier of the seller. */
  sellerId: string
  /** Name of the seller. */
  sellerName: string
  /** Resources given by the seller. */
  give: Amounts
  /** Resources wanted in return. */
  want: Amounts
  /** Progress of the trade saga. */
  status: OfferStatus
  /** Buyer whose payment is in progress, or who completed the trade. */
  buyerId: string | null
  /** Name of that buyer. */
  buyerName: string | null
  /** Number of the last acceptance attempt: each payment has its own transfer. */
  attempt: number
  /** Last refused payment: the buyer concerned, and the amounts they lacked. */
  refusal: { buyerId: string; missing: Amounts } | null
  /** Publication time in milliseconds. */
  publishedAt: number
  /** Expiry time in milliseconds. */
  expiresAt: number
  /** Reason the offer was withdrawn: the seller's decision, or expiry. */
  withdrawnBecause: 'seller' | 'expired' | null
}

/** State of an offer before any event. */
export const initialState: OfferState = {
  exists: false,
  offerId: '',
  sellerId: '',
  sellerName: '',
  give: {},
  want: {},
  status: 'reserving',
  buyerId: null,
  buyerName: null,
  attempt: 0,
  refusal: null,
  publishedAt: 0,
  expiresAt: 0,
  withdrawnBecause: null,
}

/** Facts recorded for an offer. */
export type OfferEvent =
  | {
      type: 'OfferPublished'
      data: {
        offerId: string
        sellerId: string
        sellerName: string
        give: Amounts
        want: Amounts
        at: number
        expiresAt: number
      }
    }
  | { type: 'OfferOpened'; data: { at: number } }
  | { type: 'OfferRejected'; data: { missing: Amounts; at: number } }
  | {
      type: 'OfferAccepted'
      data: { buyerId: string; buyerName: string; attempt: number; at: number }
    }
  | { type: 'PaymentRefused'; data: { buyerId: string; missing: Amounts; at: number } }
  | { type: 'TradeCompleted'; data: { at: number } }
  | { type: 'OfferWithdrawn'; data: { reason: 'seller' | 'expired'; at: number } }

/**
 * Requests on an offer: player commands, then saga commands coming from outbox
 * messages (`RecordTransferResult`, `ExpireOffer`).
 */
export type OfferCommand =
  | {
      type: 'PublishOffer'
      offerId: string
      sellerId: string
      sellerName: string
      give: Amounts
      want: Amounts
    }
  | { type: 'AcceptOffer'; buyerId: string; buyerName: string }
  | { type: 'WithdrawOffer'; playerId: string }
  | {
      type: 'RecordTransferResult'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }
  | { type: 'ExpireOffer' }

/** Business reasons for refusing a command. */
export type OfferError =
  | { code: 'OFFER_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'NOT_OPEN'; status: OfferStatus }
  | { code: 'OWN_OFFER' }
  | { code: 'NOT_SELLER' }
  | { code: 'EXPIRED' }
  | { code: 'NOT_EXPIRED' }

/** Outcome of {@link decide}: the events to record, or the refusal. */
export type Decision = { ok: true; events: OfferEvent[] } | { ok: false; error: OfferError }

/**
 * Builds a refusal.
 *
 * @param error - Business reason.
 * @returns The failed decision.
 */
const fail = (error: OfferError): Decision => ({ ok: false, error })

/**
 * Builds an accepted decision.
 *
 * @param events - Events to record; none for a command without effect.
 * @returns The accepted decision.
 */
const accept = (...events: OfferEvent[]): Decision => ({ ok: true, events })

/**
 * Builds the identifier of a resource transfer. It is set by the offer and the saga step,
 * and serves as idempotency key for the village module. Each payment attempt has its own.
 *
 * @param offerId - Offer identifier.
 * @param step - Saga step, such as "reserve" or "pay-1".
 * @returns The transfer identifier.
 */
export const transferIdOf = (offerId: string, step: string) => `${offerId}:${step}`

/**
 * Finds the offer a transfer belongs to.
 *
 * @param transferId - Transfer identifier.
 * @returns The offer identifier.
 */
export const offerIdOf = (transferId: string) => transferId.slice(0, transferId.indexOf(':'))

/**
 * Applies an event to a state. A refused payment opens the offer again: the buyer lost
 * nothing, and the seller gave nothing.
 *
 * @param state - Current offer state.
 * @param event - Event to apply.
 * @returns The new state; the given state is never modified.
 */
export function evolve(state: OfferState, event: OfferEvent): OfferState {
  switch (event.type) {
    case 'OfferPublished':
      return {
        ...initialState,
        exists: true,
        offerId: event.data.offerId,
        sellerId: event.data.sellerId,
        sellerName: event.data.sellerName,
        give: event.data.give,
        want: event.data.want,
        publishedAt: event.data.at,
        expiresAt: event.data.expiresAt,
      }
    case 'OfferOpened':
      return { ...state, status: 'open' }
    case 'OfferRejected':
      return { ...state, status: 'rejected' }
    case 'OfferAccepted':
      return {
        ...state,
        status: 'settling',
        buyerId: event.data.buyerId,
        buyerName: event.data.buyerName,
        attempt: event.data.attempt,
      }
    case 'PaymentRefused':
      return {
        ...state,
        status: 'open',
        buyerId: null,
        buyerName: null,
        refusal: { buyerId: event.data.buyerId, missing: event.data.missing },
      }
    case 'TradeCompleted':
      return { ...state, status: 'completed' }
    case 'OfferWithdrawn':
      return { ...state, status: 'withdrawn', withdrawnBecause: event.data.reason }
  }
}

/**
 * Rebuilds an offer from its events.
 *
 * @param events - Events of the offer, in order.
 * @returns The current state.
 */
export const replay = (events: OfferEvent[]) => events.reduce(evolve, initialState)

/**
 * Decides whether a command is accepted. An expired offer is no longer accepted, even if
 * its withdrawal is not recorded yet. Expiry has no effect on an offer that is no longer
 * open, and is refused before the deadline so the message is retried later.
 *
 * @param state - Current offer state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record, or the domain error.
 */
export function decide(state: OfferState, command: OfferCommand, now: number): Decision {
  if (command.type === 'PublishOffer') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { offerId, sellerId, sellerName, give, want } = command
    return accept({
      type: 'OfferPublished',
      data: { offerId, sellerId, sellerName, give, want, at: now, expiresAt: now + OFFER_TTL_MS },
    })
  }

  if (!state.exists) return fail({ code: 'OFFER_NOT_FOUND' })

  switch (command.type) {
    case 'AcceptOffer':
      if (state.status !== 'open') return fail({ code: 'NOT_OPEN', status: state.status })
      if (command.buyerId === state.sellerId) return fail({ code: 'OWN_OFFER' })
      if (now >= state.expiresAt) return fail({ code: 'EXPIRED' })
      return accept({
        type: 'OfferAccepted',
        data: {
          buyerId: command.buyerId,
          buyerName: command.buyerName,
          attempt: state.attempt + 1,
          at: now,
        },
      })

    case 'WithdrawOffer':
      if (command.playerId !== state.sellerId) return fail({ code: 'NOT_SELLER' })
      if (state.status !== 'open') return fail({ code: 'NOT_OPEN', status: state.status })
      return accept({ type: 'OfferWithdrawn', data: { reason: 'seller', at: now } })

    case 'ExpireOffer':
      if (state.status !== 'open') return accept()
      if (now < state.expiresAt) return fail({ code: 'NOT_EXPIRED' })
      return accept({ type: 'OfferWithdrawn', data: { reason: 'expired', at: now } })

    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)
  }
}

/**
 * Records the reply of the village module to a withdrawal: the reservation of the
 * seller's resources (step 2), or the payment of the buyer for the current attempt
 * (step 4). Only the reply expected in the current state moves the saga forward; any
 * other reply (duplicate, late reply) is ignored. If the offer expired during the
 * payment, it is withdrawn as soon as it opens again: its deadline has passed, and no one
 * could accept it any more.
 *
 * @param state - Current offer state.
 * @param result - Reply of the village module.
 * @param now - Current time in milliseconds.
 * @returns The events to record; none for an ignored reply.
 */
function recordTransferResult(
  state: OfferState,
  result: Extract<OfferCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const refused = result.outcome === 'refused'
  const missing = result.missing ?? {}

  if (
    state.status === 'reserving' &&
    result.transferId === transferIdOf(state.offerId, 'reserve')
  ) {
    return refused
      ? accept({ type: 'OfferRejected', data: { missing, at: now } })
      : accept({ type: 'OfferOpened', data: { at: now } })
  }

  const payment = transferIdOf(state.offerId, `pay-${state.attempt}`)
  if (state.status === 'settling' && result.transferId === payment && state.buyerId) {
    if (!refused) return accept({ type: 'TradeCompleted', data: { at: now } })
    const refusal: OfferEvent = {
      type: 'PaymentRefused',
      data: { buyerId: state.buyerId, missing, at: now },
    }
    return now >= state.expiresAt
      ? accept(refusal, { type: 'OfferWithdrawn', data: { reason: 'expired', at: now } })
      : accept(refusal)
  }

  return accept()
}
