/**
 * Monster strategies: each difficulty level provides its own way of choosing the
 * attacked hero. The combat rules (`rules.ts`) call the strategy of the
 * expedition level without knowing how it works.
 *
 * @packageDocumentation
 */
import { DAMAGE_SPREAD, type Difficulty } from './content'
import type { Action, Hero, Monster } from './game'
import { pick, type Random } from './random'

/** Situation given to a strategy when a monster attacks. */
export interface TargetingContext {
  /** Attacking monster. */
  monster: Monster
  /** Standing heroes, with their hit points at this point of the resolution. */
  heroes: Hero[]
  /** Actions of the round: monsters act after the heroes and know them. */
  actions: Record<string, Action>
  /** Generator of the round: a strategy never draws by any other means. */
  random: Random
}

/**
 * Strategy port: picks the attacked hero.
 *
 * @param context - Attacking monster, standing heroes (never empty), actions and generator.
 * @returns The targeted hero.
 */
export type MonsterStrategy = (context: TargetingContext) => Hero

/**
 * Finds the hero with the fewest hit points.
 *
 * @param heroes - Candidate heroes, never empty.
 * @returns The weakest hero, the first in order on a tie.
 */
const weakest = (heroes: Hero[]) =>
  heroes.reduce((chosen, hero) => (hero.hp < chosen.hp ? hero : chosen))

/**
 * Easy level: each monster attacks a random hero.
 *
 * @param context - Targeting context.
 * @returns A hero drawn with the round generator.
 */
export const easyStrategy: MonsterStrategy = ({ heroes, random }) => pick(random, heroes)

/**
 * Hard level: monsters focus their attacks, in order of preference:
 * 1. a hero the monster will surely knock down, even with its minimal damage;
 * 2. otherwise, the weakest hero who is not defending;
 * 3. otherwise, if everyone defends, the weakest of all.
 *
 * @param context - Targeting context.
 * @returns The targeted hero.
 */
export const hardStrategy: MonsterStrategy = ({ monster, heroes, actions }) => {
  const defends = (hero: Hero) => actions[hero.id]?.type === 'defend'
  const minimalDamage = (hero: Hero) => {
    const damage = Math.max(1, monster.attack - DAMAGE_SPREAD.monster)
    return defends(hero) ? Math.ceil(damage / 2) : damage
  }

  const doomed = heroes.filter((hero) => hero.hp <= minimalDamage(hero))
  if (doomed.length > 0) return weakest(doomed)

  const exposed = heroes.filter((hero) => !defends(hero))
  return weakest(exposed.length > 0 ? exposed : heroes)
}

/** Strategy of each difficulty level. */
export const MONSTER_STRATEGIES: Record<Difficulty, MonsterStrategy> = {
  easy: easyStrategy,
  hard: hardStrategy,
}
