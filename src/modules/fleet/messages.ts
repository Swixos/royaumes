import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { FleetService } from './application/fleet-service'
import { FLEET_TOPICS } from './contracts'
import { raidIdOf } from './domain/raid'

/** Reply of the village module to a resource transfer (its `TransferResult` type, checked here). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/** Delayed reminder of a raid. */
const ArriveMessage = z.object({ raidId: z.string().min(1) })

/** Notice addressed to a harbor: only identifiers, the names are read from the raid. */
const NoticeMessage = z.object({
  playerId: z.string().min(1),
  raidId: z.string().min(1),
  notice: z.enum(['sighted', 'turned-back', 'report']),
})

/**
 * Creates the handlers of the messages addressed to the fleet module: the replies of the
 * village module, which move the saga forward, the arrival reminders of the raids, and
 * the notices of the harbors. They only turn a message into a service call; each one is
 * idempotent, so a message delivered twice changes nothing more.
 *
 * @param service - Fleet application service.
 * @returns The handlers, by topic.
 */
export function createFleetHandlers(service: FleetService): Record<string, MessageHandler> {
  return {
    [FLEET_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      await service.step(raidIdOf(transferId), {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        missing,
      })
    },

    [FLEET_TOPICS.arrive]: async (message) => {
      const { raidId } = ArriveMessage.parse(message.payload)
      await service.arrive(raidId)
    },

    [FLEET_TOPICS.notice]: async (message) => {
      const { playerId, raidId, notice } = NoticeMessage.parse(message.payload)
      await service.notify(playerId, raidId, notice)
    },
  }
}
