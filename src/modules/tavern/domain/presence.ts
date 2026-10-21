/**
 * Rules of the presence in the tavern. With no permanent connection, presence relies
 * on a signal sent regularly by each player's browser.
 *
 * @packageDocumentation
 */

/** Interval between two presence signals, in milliseconds. */
export const HEARTBEAT_MS = 30_000

/**
 * Delay, in milliseconds, beyond which a player without signal is considered gone. It
 * tolerates three missed signals: a browser may slow down the timers of a background
 * tab, down to one firing per minute.
 */
export const PRESENCE_TTL_MS = 120_000

/**
 * Computes the time before which a signal is too old: a player whose last signal is
 * older than that time has left.
 *
 * @param now - Current time in milliseconds.
 * @returns The staleness threshold in milliseconds.
 */
export const staleBefore = (now: number) => now - PRESENCE_TTL_MS
