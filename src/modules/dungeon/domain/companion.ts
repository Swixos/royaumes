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
  /** The companion itself, when it has a class. */
  self?: Hero
  /** True when the skill of the companion is ready. */
  skillReady?: boolean
  /** Hero each monster announced it will attack, by monster identifier. */
  intents?: Record<string, string>
}

/** Share of hit points under which a hero counts as wounded, for the prayer and the bulwark. */
const WOUNDED_RATIO = 0.6

/**
 * Tells whether the companion should use its skill now:
 * - the cleric prays when at least two heroes are wounded;
 * - the warrior raises the bulwark when a monster aims at a wounded ally;
 * - the ranger looses a volley when at least two monsters stand.
 *
 * @param context - Situation of the round.
 * @returns True if the skill is worth using.
 */
function skillWorthIt({ heroes, monsters, self, skillReady, intents }: CompanionContext) {
  if (!self?.skill || !skillReady) return false
  const wounded = heroes.filter((hero) => healthRatio(hero) < WOUNDED_RATIO)
  if (self.skill === 'prayer') return wounded.length >= 2
  if (self.skill === 'volley') return monsters.length >= 2
  const threatened = new Set(Object.values(intents ?? {}))
  return wounded.some((hero) => hero.id !== self.id && threatened.has(hero.id))
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
 * 1. if its skill is ready and worth it, it uses it;
 * 2. if a standing hero is in danger, it heals the most wounded of them;
 * 3. otherwise, it attacks the monster with the fewest hit points, to bring it down quickly.
 *
 * @param context - Standing heroes and monsters.
 * @returns The action chosen for the round.
 */
export function chooseCompanionAction(context: CompanionContext): Action {
  const { heroes, monsters } = context
  if (skillWorthIt(context)) return { type: 'skill' }
  const endangered = heroes.filter((hero) => healthRatio(hero) < COMPANION_HEAL_RATIO)
  if (endangered.length > 0) {
    const mostWounded = endangered.reduce((a, b) => (healthRatio(b) < healthRatio(a) ? b : a))
    return { type: 'heal', target: mostWounded.id }
  }
  const weakest = monsters.reduce((a, b) => (b.hp < a.hp ? b : a))
  return { type: 'attack', target: weakest.id }
}
