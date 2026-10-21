/**
 * Companion behavior: it chooses its action as a player would, when the round is
 * resolved. This is a pure function, with no random draw.
 *
 * @packageDocumentation
 */
import { COMPANION_HEAL_RATIO } from './content'
import type { Action, Hero, Monster } from './game'

/** Situation shown to the companion at the start of the round resolution. */
export interface CompanionContext {
  /** Heroes still standing, the companion included. */
  heroes: Hero[]
  /** Monsters still standing (never empty during a combat). */
  monsters: Monster[]
}

/**
 * Computes the share of hit points a fighter has left.
 *
 * @param fighter - Fighter with current and maximum hit points.
 * @returns Ratio between current and maximum hit points.
 */
const healthRatio = (fighter: { hp: number; maxHp: number }) => fighter.hp / fighter.maxHp

/**
 * Chooses the companion's action:
 * 1. if a standing hero is in danger, it heals the most wounded of them;
 * 2. otherwise, it attacks the monster with the fewest hit points, to bring it down quickly.
 *
 * @param context - Standing heroes and monsters.
 * @returns The action chosen for the round.
 */
export function chooseCompanionAction({ heroes, monsters }: CompanionContext): Action {
  const endangered = heroes.filter((hero) => healthRatio(hero) < COMPANION_HEAL_RATIO)
  if (endangered.length > 0) {
    const mostWounded = endangered.reduce((a, b) => (healthRatio(b) < healthRatio(a) ? b : a))
    return { type: 'heal', target: mostWounded.id }
  }
  const weakest = monsters.reduce((a, b) => (b.hp < a.hp ? b : a))
  return { type: 'attack', target: weakest.id }
}
