import type { TavernMessage } from '../contracts'
import { checkBody, checkRate, type MessageError, RATE_LIMIT } from '../domain/message'
import type { MessageRepository } from './message-repository'

/** Number of messages shown when the tavern opens. */
export const HISTORY_SIZE = 50

/** Result of posting: the recorded message, or the error. */
export type PostResult = { ok: true; message: TavernMessage } | { ok: false; error: MessageError }

/**
 * Tavern application service.
 *
 * @param repo - Persistence port of the messages.
 * @param clock - Reference clock in milliseconds; real time by default.
 * @returns The `post` command and the `latest` query.
 */
export function createTavernService(repo: MessageRepository, clock = () => Date.now()) {
  /**
   * Posts a message on behalf of a player, after validation and rate limiting.
   *
   * @param player - Author of the message.
   * @param body - Text of the message.
   * @returns The recorded message, or the error.
   */
  async function post(player: { id: string; name: string }, body: string): Promise<PostResult> {
    const checked = checkBody(body)
    if (!checked.ok) return checked
    const now = clock()
    const recent = await repo.postedSince(player.id, now - RATE_LIMIT.windowMs)
    const limited = checkRate(recent, now)
    if (limited) return { ok: false, error: limited }
    const message = await repo.add({
      authorId: player.id,
      authorName: player.name,
      body: checked.body,
      postedAt: now,
    })
    return { ok: true, message }
  }

  /**
   * Reads the latest messages of the tavern.
   *
   * @returns The messages, oldest first.
   */
  const latest = () => repo.latest(HISTORY_SIZE)

  return { post, latest }
}

/** Service type inferred from its factory. */
export type TavernService = ReturnType<typeof createTavernService>
