/**
 * Pirate captains, played by the computer. A captain draws nothing: he reads the past
 * tactics of the attacker against the pirates, and holds the posture that beats the one
 * the attacker used most. A player who always attacks the same way is thus punished, and
 * the one who varies is rewarded.
 *
 * @packageDocumentation
 */
import { BEATS, TACTICS, type Tactic } from './naval'

/** Posture of a captain facing an attacker with no history, or a tie. */
export const OPENING_POSTURE: Tactic = 'board'

/**
 * Finds the posture that beats a tactic.
 *
 * @param tactic - Tactic to counter.
 * @returns The posture beating it.
 */
export function counterOf(tactic: Tactic): Tactic {
  return TACTICS.find((posture) => BEATS[posture] === tactic) ?? OPENING_POSTURE
}

/**
 * Chooses the posture of a pirate captain (rule 11).
 *
 * @param history - Tactics of the attacker's previous fights against the pirates, in order.
 * @returns The posture beating the most used tactic; the opening posture on a tie or
 *   without history.
 */
export function captainPosture(history: readonly Tactic[]): Tactic {
  const counts = new Map<Tactic, number>()
  for (const tactic of history) counts.set(tactic, (counts.get(tactic) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return OPENING_POSTURE
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return OPENING_POSTURE
  return counterOf(ranked[0][0])
}
