/**
 * Rules of the tavern messaging. The tavern does not use Event Sourcing: its rules come
 * down to validating a message and limiting the number of messages of a player.
 *
 * @packageDocumentation
 */

/** Maximum length of a message, in characters. */
export const MESSAGE_MAX_LENGTH = 280

/** Retention period of a message: thirty days, in milliseconds. */
export const RETENTION_MS = 30 * 24 * 60 * 60_000

/**
 * Computes the time before which a message has exceeded its retention period.
 *
 * @param now - Current time in milliseconds.
 * @returns The expiry threshold in milliseconds.
 */
export const expiredBefore = (now: number) => now - RETENTION_MS

/** Maximum number of messages of a player during the rate limiting window. */
export const RATE_LIMIT = { messages: 5, windowMs: 30_000 }

/** Reasons for refusing a message. */
export type MessageError =
  | { code: 'EMPTY_MESSAGE' }
  | { code: 'MESSAGE_TOO_LONG'; max: number }
  | { code: 'TOO_MANY_MESSAGES'; retryAfterMs: number }

/**
 * Checks the text of a message and normalizes it by trimming leading and trailing
 * spaces. The length is counted in characters rather than UTF-16 units, so a symbol
 * such as "🍺" counts as a single character.
 *
 * @param body - Text of the message.
 * @returns The normalized text, or the error.
 */
export function checkBody(
  body: string,
): { ok: true; body: string } | { ok: false; error: MessageError } {
  const trimmed = body.trim()
  if (trimmed.length === 0) return { ok: false, error: { code: 'EMPTY_MESSAGE' } }
  if ([...trimmed].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH } }
  }
  return { ok: true, body: trimmed }
}

/**
 * Applies the rate limit. The player may post again once the oldest message of the
 * window leaves it.
 *
 * @param recent - Times of the player's messages posted during the window before `now`.
 * @param now - Current time in milliseconds.
 * @returns Null if the player may post, otherwise the error with the delay to wait.
 */
export function checkRate(recent: number[], now: number): MessageError | null {
  if (recent.length < RATE_LIMIT.messages) return null
  const oldest = Math.min(...recent)
  return { code: 'TOO_MANY_MESSAGES', retryAfterMs: oldest + RATE_LIMIT.windowMs - now }
}
