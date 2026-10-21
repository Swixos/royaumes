import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import type { TransferResult } from '../contracts'
import {
  type DomainError,
  decide,
  type TransferCommand,
  toView,
  type VillageCommand,
  type VillageEvent,
  type VillageView,
} from '../domain/village'
import type { VillageRepository } from './village-repository'

/** Result of a command: the updated view, or the domain error. */
export type CommandResult = { ok: true; view: VillageView } | { ok: false; error: DomainError }

/**
 * Builds the reply matching the event of a resource transfer.
 *
 * @param event - Recorded event.
 * @returns The reply, or null for another event.
 */
function resultOf(event: VillageEvent): TransferResult | null {
  switch (event.type) {
    case 'ResourcesWithdrawn':
      return { transferId: event.data.transferId, outcome: 'withdrawn' }
    case 'WithdrawalRefused':
      return { transferId: event.data.transferId, outcome: 'refused', missing: event.data.missing }
    case 'ResourcesDeposited':
      return { transferId: event.data.transferId, outcome: 'deposited' }
    default:
      return null
  }
}

/**
 * Village application service, orchestrating the domain and persistence.
 *
 * @param repo - Persistence port.
 * @param clock - Returns the current time in milliseconds; real time by default.
 * @returns The `execute` and `transfer` command handlers and the `getView` query.
 */
export function createVillageService(repo: VillageRepository, clock = () => Date.now()) {
  /**
   * Handles a command: load, read the clock once, decide, save, then return
   * the view. On a write conflict, the whole handling is replayed on the fresh
   * state.
   *
   * @param userId - Player issuing the command.
   * @param command - Command to apply.
   * @returns The updated view, or the domain error if the command is refused.
   */
  function execute(userId: string, command: VillageCommand): Promise<CommandResult> {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(userId)
      const now = clock()

      const decision = decide(state, command, now)
      if (!decision.ok) return decision

      await repo.save(userId, version, decision.events)

      const updated = await repo.load(userId)
      return { ok: true, view: toView(updated.state, now) }
    })
  }

  /**
   * Processes a resource transfer requested by another module. The reply, if any, is
   * recorded in the outbox under the `replyTo` topic, in the same transaction as the
   * transfer event. A transfer already processed produces neither event nor reply: the
   * reply was recorded the first time, along with the event. A domain error is an
   * anomaly rather than a refusal: it is thrown, so the message is retried and, failing
   * that, abandoned.
   *
   * @param userId - Player whose village is concerned.
   * @param command - Withdrawal or deposit command.
   * @param replyTo - Topic of the reply message, if the requester expects one.
   * @returns Resolves once the transfer and its reply are recorded.
   * @throws Error if the domain rejects the command.
   */
  function transfer(userId: string, command: TransferCommand, replyTo?: string) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(userId)
      const decision = decide(state, command, clock())
      if (!decision.ok) {
        throw new Error(`Mouvement ${command.transferId} impossible : ${decision.error.code}`)
      }
      const messages: NewMessage[] = []
      for (const event of decision.events) {
        const result = resultOf(event)
        if (result && replyTo) messages.push({ topic: replyTo, payload: { ...result } })
      }
      await repo.save(userId, version, decision.events, messages)
    })
  }

  /**
   * Reads a player's village.
   *
   * @param userId - Player identifier.
   * @returns The village view, or `null` if no village was founded yet.
   */
  async function getView(userId: string): Promise<VillageView | null> {
    const { state } = await repo.load(userId)
    return state.founded ? toView(state, clock()) : null
  }

  return { execute, transfer, getView }
}

/** Service type inferred from its factory, used by the module API. */
export type VillageService = ReturnType<typeof createVillageService>
