/**
 * Pirate captains, played by the computer. A captain draws nothing: he reads the past
 * fights of the attacker against the pirates, and readies the defense that answers the
 * attacker's habit. Against the armies, he calls up a reserve of the unit that best
 * resists the kind of damage the attacker dealt most; against the triremes of old, he held
 * the posture beating the tactic the attacker used most. A player who always attacks the
 * same way is thus punished, and the one who varies is rewarded.
 *
 * @packageDocumentation
 */
import type { Army, ArmyRules, Damage } from './battle'
import { BEATS, type PirateIsland, TACTICS, type Tactic } from './naval'

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

/**
 * Chooses the reserve a pirate captain calls up against an army (rule 11): the land unit
 * of the village catalog that best resists the kind of damage the attacker dealt most in
 * their previous fights against the pirates.
 *
 * @param island - Island attacked.
 * @param history - Main kind of damage of each previous fight of the attacker, in order.
 * @param rules - Values of the units.
 * @returns The reserve; empty without history, or on a tie.
 */
export function captainReserve(
  island: PirateIsland,
  history: readonly Damage[],
  rules: ArmyRules,
): Army {
  const counts = new Map<Damage, number>()
  for (const damage of history) counts.set(damage, (counts.get(damage) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return {}
  const habit = ranked[0][0]
  const units = Object.entries(rules.land).sort(
    (a, b) => b[1].defense[habit] - a[1].defense[habit] || a[0].localeCompare(b[0]),
  )
  return units.length > 0 ? { [units[0][0]]: island.reserve } : {}
}
