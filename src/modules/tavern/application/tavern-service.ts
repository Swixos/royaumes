import type { PresentPlayer, TavernMessage } from '../contracts'
import {
  checkBody,
  checkRate,
  expiredBefore,
  type MessageError,
  RATE_LIMIT,
} from '../domain/message'
import { staleBefore } from '../domain/presence'
import type { MessageRepository } from './message-repository'
import type { PresenceRepository } from './presence-repository'

/** Number of messages shown when the tavern opens. */
export const HISTORY_SIZE = 50

/** Result of posting: the recorded message, or the error. */
export type PostResult = { ok: true; message: TavernMessage } | { ok: false; error: MessageError }

/**
 * Tavern application service.
 *
 * @param repo - Persistence port of the messages.
 * @param presence - Persistence port of the presence.
 * @param clock - Reference clock in milliseconds; real time by default.
 * @returns The `post`, `heartbeat` and `leave` commands, the `latest` and `present` queries
 *   and the daily `purge` task.
 */
export function createTavernService(
  repo: MessageRepository,
  presence: PresenceRepository,
  clock = () => Date.now(),
) {
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
   * Reads the latest messages of the tavern, after deleting the expired ones.
   *
   * @returns The messages, oldest first.
   */
  async function latest() {
    await repo.removeOlderThan(expiredBefore(clock()))
    return repo.latest(HISTORY_SIZE)
  }

  /**
   * Daily task: applies the retention periods of messages and presence, even if nobody
   * visits the tavern.
   *
   * @returns The number of deleted messages and presence rows.
   */
  async function purge() {
    const now = clock()
    return {
      messages: await repo.removeOlderThan(expiredBefore(now)),
      presence: await presence.removeStale(staleBefore(now)),
    }
  }

  /**
   * Lists the present players. The rows of the players who left are deleted first:
   * presence is only kept for the duration of the visit, with no background task to
   * clean up.
   *
   * @returns The present players.
   */
  async function present(): Promise<PresentPlayer[]> {
    await presence.removeStale(staleBefore(clock()))
    return presence.list()
  }

  /**
   * Records the presence signal of a player.
   *
   * @param player - Player sending the signal.
   * @returns The present players.
   */
  async function heartbeat(player: PresentPlayer) {
    await presence.touch(player, clock())
    return present()
  }

  /**
   * Removes at once a player leaving the tavern.
   *
   * @param playerId - Player identifier.
   * @returns Resolves once the player is removed.
   */
  const leave = (playerId: string) => presence.remove(playerId)

  return { post, latest, present, heartbeat, leave, purge }
}

/** Service type inferred from its factory. */
export type TavernService = ReturnType<typeof createTavernService>
