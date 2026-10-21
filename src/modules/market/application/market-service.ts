import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { MARKET_TOPICS } from '../contracts'
import {
  type Amounts,
  decide,
  evolve,
  type OfferCommand,
  type OfferError,
  type OfferEvent,
  type OfferState,
} from '../domain/offer'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type OfferView, toView } from '../domain/view'
import type { OfferRepository } from './offer-repository'
import type { OffersReader } from './offers-reader'

/** Result of a player command: the view of the offer, or the domain error. */
export type CommandResult = { ok: true; view: OfferView } | { ok: false; error: OfferError }

/** Player issuing a command. */
export interface Player {
  /** Player identifier. */
  id: string
  /** Display name. */
  name: string
}

/** Options of the market service. */
export interface MarketServiceOptions {
  /** Outbox dispatch, triggered after each command and each read. */
  dispatch: () => Promise<unknown>
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
  /** Identifier of a new offer; a random UUID by default. */
  newId?: () => string
}

/**
 * Turns a saga request into an outbox message. A withdrawal carries the reply topic, so
 * the reply of the village module moves the saga forward; an expiry reminder is delayed
 * until the deadline.
 *
 * @param request - Saga request.
 * @param now - Current time in milliseconds.
 * @returns The message to record.
 */
function toMessage(request: SagaRequest, now: number): NewMessage {
  switch (request.kind) {
    case 'withdraw':
      return {
        topic: REALM_TOPICS.withdraw,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
          replyTo: MARKET_TOPICS.transferResult,
        },
      }
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
    case 'expire':
      return {
        topic: MARKET_TOPICS.expire,
        payload: { offerId: request.offerId },
        delayMs: Math.max(0, request.at - now),
      }
  }
}

/**
 * Lists the messages triggered by a series of events, applied one by one to the state.
 *
 * @param state - Offer state before the events.
 * @param events - Events to record.
 * @param now - Current time in milliseconds.
 * @returns The saga messages, in order.
 */
function messagesFor(state: OfferState, events: OfferEvent[], now: number): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request, now))
  }
  return messages
}

/**
 * Market application service, orchestrator of the trade saga. Each decision is recorded
 * with the messages it triggers, in a single transaction.
 *
 * @param repo - Persistence port of the offers.
 * @param reader - Read port of the list of offers.
 * @param options - Outbox dispatch, clock and identifier generator.
 * @returns The player commands, the reads and the `step` saga handler.
 */
export function createMarketService(
  repo: OfferRepository,
  reader: OffersReader,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: MarketServiceOptions,
) {
  /**
   * Decides and records a command on an offer, with the saga messages. On a version
   * conflict, everything is replayed on the fresh state: the refused attempt recorded no
   * message.
   *
   * @param offerId - Offer identifier.
   * @param command - Command to decide on.
   * @returns The decision.
   */
  function process(offerId: string, command: OfferCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(offerId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(offerId, version, decision.events, messagesFor(state, decision.events, now))
      return decision
    })
  }

  /**
   * Runs a player command: the decision is recorded, then the outbox dispatched. In the
   * usual case, the saga has reached its next stable state when the view is returned.
   *
   * @param offerId - Offer identifier.
   * @param viewerId - Identifier of the player issuing the command.
   * @param command - Command to decide on.
   * @returns The updated view, or the domain error.
   */
  async function execute(offerId: string, viewerId: string, command: OfferCommand) {
    const decision = await process(offerId, command)
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await repo.load(offerId)
    const view = toView(state, viewerId)
    return view
      ? ({ ok: true, view } as const)
      : ({ ok: false, error: { code: 'OFFER_NOT_FOUND' } } as const)
  }

  /**
   * Publishes an offer on behalf of a player.
   *
   * @param player - Seller.
   * @param give - Resources given.
   * @param want - Resources wanted in return.
   * @returns The new offer identifier and the command result.
   */
  async function publish(player: Player, give: Amounts, want: Amounts) {
    const offerId = newId()
    const result: CommandResult = await execute(offerId, player.id, {
      type: 'PublishOffer',
      offerId,
      sellerId: player.id,
      sellerName: player.name,
      give,
      want,
    })
    return { offerId, result }
  }

  /**
   * Accepts an offer on behalf of a player.
   *
   * @param offerId - Offer identifier.
   * @param player - Buyer.
   * @returns The updated view, or the domain error.
   */
  const acceptOffer = (offerId: string, player: Player): Promise<CommandResult> =>
    execute(offerId, player.id, { type: 'AcceptOffer', buyerId: player.id, buyerName: player.name })

  /**
   * Withdraws an offer on behalf of its seller.
   *
   * @param offerId - Offer identifier.
   * @param playerId - Identifier of the player asking.
   * @returns The updated view, or the domain error.
   */
  const withdrawOffer = (offerId: string, playerId: string): Promise<CommandResult> =>
    execute(offerId, playerId, { type: 'WithdrawOffer', playerId })

  /**
   * Reads an offer for a player.
   *
   * @param offerId - Offer identifier.
   * @param viewerId - Identifier of the viewing player.
   * @returns The view, or null if the offer does not exist.
   */
  async function getView(offerId: string, viewerId: string) {
    const { state } = await repo.load(offerId)
    return toView(state, viewerId)
  }

  /**
   * Lists the offers. The outbox is dispatched first: an interrupted saga resumes as soon
   * as a player reads the market, and expired offers are withdrawn.
   *
   * @param viewerId - Identifier of the viewing player.
   * @returns The list, with its log position.
   */
  async function list(viewerId: string) {
    await dispatch()
    return reader.list(viewerId, clock())
  }

  /**
   * Runs a saga step, triggered by a message. A domain error is an anomaly here: it is
   * thrown, so the message is retried.
   *
   * @param offerId - Offer identifier.
   * @param command - Saga command.
   * @returns Resolves once the step is recorded.
   * @throws Error if the domain rejects the command.
   */
  async function step(offerId: string, command: OfferCommand) {
    const decision = await process(offerId, command)
    if (!decision.ok) throw new Error(`Offre ${offerId} : ${decision.error.code}`)
  }

  return { publish, acceptOffer, withdrawOffer, getView, list, step }
}

/** Service type inferred from its factory. */
export type MarketService = ReturnType<typeof createMarketService>
