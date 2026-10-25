import type { MessageHandler } from '@/platform/outbox/outbox'
import type { VillageService } from './application/village-service'
import { REALM_TOPICS, TransferRequest } from './contracts'
import type { TransferCommand } from './domain/village'

/**
 * Creates the handlers of the messages addressed to the village module, delivered by the
 * outbox dispatcher. This file plays, for messages, the role `api.ts` plays for HTTP
 * requests: it turns a message into a service call, with no business rule.
 *
 * @param service - Village application service.
 * @returns The handlers, by topic.
 */
export function createRealmHandlers(service: VillageService): Record<string, MessageHandler> {
  /**
   * Builds the handler of a kind of transfer. The message content is checked like a
   * request body, since it comes from another module: a malformed message throws, and
   * ends up abandoned as a dead letter.
   *
   * @param type - Kind of transfer command.
   * @returns The message handler.
   */
  const handle =
    (type: TransferCommand['type']): MessageHandler =>
    async (message) => {
      const { transferId, playerId, resources, plunder, replyTo } = TransferRequest.parse(
        message.payload,
      )
      const command: TransferCommand =
        type === 'WithdrawResources'
          ? { type, transferId, resources, plunder }
          : { type, transferId, resources }
      await service.transfer(playerId, command, replyTo)
    }

  return {
    [REALM_TOPICS.withdraw]: handle('WithdrawResources'),
    [REALM_TOPICS.deposit]: handle('DepositResources'),
  }
}
