import type { MessageHandler } from '@/platform/outbox/outbox'
import type { VillageService } from './application/village-service'
import { REALM_TOPICS, TransferRequest } from './contracts'
import type { TransferCommand } from './domain/village'

/**
 * Turns a transfer message into the village command it asks for: resources or units,
 * leaving or coming in.
 *
 * @param direction - Topic of the message: a withdrawal or a deposit.
 * @param request - Content of the message.
 * @returns The transfer command.
 */
function commandOf(direction: 'withdraw' | 'deposit', request: TransferRequest): TransferCommand {
  const { transferId } = request
  if (request.units) {
    return direction === 'withdraw'
      ? { type: 'WithdrawUnits', transferId, units: request.units, casualties: request.casualties }
      : { type: 'ReturnUnits', transferId, units: request.units, lost: request.lost ?? {} }
  }
  const resources = request.resources ?? {}
  return direction === 'withdraw'
    ? { type: 'WithdrawResources', transferId, resources, plunder: request.plunder }
    : { type: 'DepositResources', transferId, resources }
}

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
    (direction: 'withdraw' | 'deposit'): MessageHandler =>
    async (message) => {
      const request = TransferRequest.parse(message.payload)
      const { playerId, replyTo } = request
      await service.transfer(playerId, commandOf(direction, request), replyTo)
    }

  return {
    [REALM_TOPICS.withdraw]: handle('withdraw'),
    [REALM_TOPICS.deposit]: handle('deposit'),
  }
}
