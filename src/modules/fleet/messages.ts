import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { FleetService } from './application/fleet-service'
import { FLEET_TOPICS } from './contracts'
import type { HarborNotice } from './domain/harbor'
import { raidIdOf } from './domain/raid'

/** Reply of the village module to a resource transfer (its `TransferResult` type, checked here). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/** Delayed reminder of a raid. */
const ArriveMessage = z.object({ raidId: z.string().min(1) })

/** Resource amounts carried by a battle report. */
const Loot = z.object({ wood: z.number(), stone: z.number(), gold: z.number() }).partial()

/** Notice addressed to a harbor. */
const NoticeMessage = z.object({
  playerId: z.string().min(1),
  notice: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('sighted'),
      raidId: z.string().min(1),
      attackerId: z.string().min(1),
      attackerName: z.string(),
      ships: z.number().int(),
      arrivesAt: z.number(),
    }),
    z.object({ kind: z.literal('turned-back'), raidId: z.string().min(1) }),
    z.object({
      kind: z.literal('report'),
      raidId: z.string().min(1),
      role: z.enum(['attacker', 'defender']),
      won: z.boolean(),
      opponentId: z.string().min(1),
      opponentName: z.string(),
      loot: Loot,
    }),
  ]),
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
      const { playerId, notice } = NoticeMessage.parse(message.payload)
      await service.notify(playerId, notice as HarborNotice)
    },
  }
}
