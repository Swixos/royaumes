/**
 * Dungeon content: monsters, rooms and balancing values. This file only holds
 * data; the rules using it live in `rules.ts`, so rebalancing the game only
 * changes this file.
 *
 * @packageDocumentation
 */

/** Difficulty levels of an expedition, declared `as const` to derive a union type. */
export const DIFFICULTIES = ['easy', 'hard'] as const
/** A difficulty level. */
export type Difficulty = (typeof DIFFICULTIES)[number]

/** Level given to expeditions recorded before difficulty levels existed. */
export const DEFAULT_DIFFICULTY: Difficulty = 'easy'

/** Attack bonus given to monsters at each difficulty level. */
export const MONSTER_ATTACK_BONUS: Record<Difficulty, number> = { easy: 0, hard: 3 }

/** Maximum number of heroes in an expedition. */
export const MAX_HEROES = 4

/** Number of rooms in the dungeon; the last one always holds the troll. */
export const DUNGEON_LENGTH = 6

/** Maximum duration of a combat round, in milliseconds. */
export const ROUND_MS = 30_000

/** Time allowed to open the next door, in milliseconds. */
export const EXPLORE_MS = 60_000

/** Hit points restored by a heal. */
export const HEAL_AMOUNT = 8

/** Share of maximum hit points under which a companion heals a hero rather than attacking. */
export const COMPANION_HEAL_RATIO = 0.4

/** Starting stats of each hero. */
export const HERO = { hp: 30, attack: 6 }

/** Maximum deviation, up or down, between the damage dealt and the attack. */
export const DAMAGE_SPREAD = { hero: 2, monster: 1 }

/**
 * Game monsters, declared `as const` to derive a union type. The hit points of
 * the last room monster ({@link BOSS}) are per hero: the troll has 20 hit points
 * against a single hero, 80 against four.
 */
export const MONSTERS = {
  goblin: { name: 'Gobelin', hp: 10, attack: 3 },
  skeleton: { name: 'Squelette', hp: 14, attack: 4 },
  troll: { name: 'Troll', hp: 20, attack: 7 },
} as const

/** A kind of monster. */
export type MonsterKind = keyof typeof MONSTERS

/** Monsters that can populate ordinary rooms. */
export const COMMON_MONSTERS: MonsterKind[] = ['goblin', 'skeleton']

/** Monster of the last room. */
export const BOSS: MonsterKind = 'troll'

/**
 * Probability of each kind of ordinary room, summing to 1. A monster room holds
 * between 1 and the number of heroes, at most 3.
 */
export const ROOM_ODDS = { empty: 0.3, treasure: 0.3, monsters: 0.4 }

/** Gold held in a treasure: minimum and maximum. */
export const TREASURE_GOLD = { min: 10, max: 30 }

/** Time during which an expedition not started yet stays listed, in milliseconds. */
export const OPEN_GAME_MS = 60 * 60_000
