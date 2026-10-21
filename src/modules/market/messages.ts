import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { MarketService } from './application/market-service'
import { MARKET_TOPICS } from './contracts'
import { offerIdOf } from './domain/offer'

/** Reply of the village module to a resource transfer (its `TransferResult` type, checked here). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/** Delayed reminder of an offer. */
const ExpireMessage = z.object({ offerId: z.string().min(1) })

/**
 * Creates the handlers of the messages addressed to the market module: the replies of the
 * village module, which move the saga forward, and the deadline reminders of the offers.
 * Like the village handlers, they only turn a message into a service call. The transfer
 * identifier was built by the market module, so it names the offer concerned.
 *
 * @param service - Market application service.
 * @returns The handlers, by topic.
 */
export function createMarketHandlers(service: MarketService): Record<string, MessageHandler> {
  return {
    [MARKET_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      await service.step(offerIdOf(transferId), {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        missing,
      })
    },

    [MARKET_TOPICS.expire]: async (message) => {
      const { offerId } = ExpireMessage.parse(message.payload)
      await service.step(offerId, { type: 'ExpireOffer' })
    },
  }
}
