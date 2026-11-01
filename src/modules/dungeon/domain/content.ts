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

/** Hit points restored by a heal of a hero without class, recorded before the classes existed. */
export const HEAL_AMOUNT = 8

/** Share of maximum hit points under which a companion heals a hero rather than attacking. */
export const COMPANION_HEAL_RATIO = 0.4

/** Starting stats of a hero without class, recorded before the classes existed. */
export const HERO = { hp: 30, attack: 6 }

/** Classes a hero can choose, declared `as const` to derive a union type. */
export const HERO_CLASSES = ['warrior', 'ranger', 'cleric'] as const
/** A hero class. */
export type HeroClass = (typeof HERO_CLASSES)[number]

/** Signature skill of each class. */
export type Skill = 'bulwark' | 'volley' | 'prayer'

/** Values of a hero class. */
export interface ClassSpec {
  /** Name shown to players. */
  name: string
  /** Starting hit points. */
  hp: number
  /** Attack value. */
  attack: number
  /** Hit points restored by a heal. */
  heal: number
  /** Chance of a critical hit, which doubles the damage, from 0 to 1. */
  critical: number
  /** Signature skill. */
  skill: Skill
}

/**
 * Hero classes. The warrior holds the line, the ranger strikes hard and often critically,
 * the cleric keeps the party alive.
 */
export const CLASSES: Record<HeroClass, ClassSpec> = {
  warrior: { name: 'Guerrier', hp: 40, attack: 5, heal: 4, critical: 0.1, skill: 'bulwark' },
  ranger: { name: 'Rôdeuse', hp: 26, attack: 8, heal: 4, critical: 0.3, skill: 'volley' },
  cleric: { name: 'Prêtresse', hp: 30, attack: 4, heal: 10, critical: 0.1, skill: 'prayer' },
}

/** Words of each skill, shown to players. */
export const SKILLS: Record<Skill, { name: string; text: string }> = {
  bulwark: {
    name: 'Rempart',
    text: 'Attire sur soi toutes les attaques de la manche, et en encaisse la moitié.',
  },
  volley: {
    name: 'Pluie de flèches',
    text: 'Frappe chaque monstre debout, un peu moins fort qu’une attaque.',
  },
  prayer: { name: 'Prière', text: 'Soigne tous les héros debout.' },
}

/** Rounds to wait between two uses of a skill. */
export const SKILL_COOLDOWN = 3

/** Damage the volley takes off the attack of the ranger, for each monster. */
export const VOLLEY_MALUS = 2

/** Share of the heal of the cleric given to each hero by the prayer. */
export const PRAYER_SHARE = 0.7

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
  spider: { name: 'Araignée', hp: 8, attack: 5 },
  cultist: { name: 'Cultiste', hp: 12, attack: 4 },
  troll: { name: 'Troll', hp: 20, attack: 7 },
  lich: { name: 'Liche', hp: 24, attack: 8 },
} as const

/** A kind of monster. */
export type MonsterKind = keyof typeof MONSTERS

/** Monsters that can populate ordinary rooms. */
export const COMMON_MONSTERS: MonsterKind[] = ['goblin', 'skeleton', 'spider', 'cultist']

/** Monster of the last room, at each difficulty level. */
export const BOSSES: Record<Difficulty, MonsterKind> = { easy: 'troll', hard: 'lich' }

/** Monster of the last room of the expeditions recorded before the bosses of each level. */
export const BOSS: MonsterKind = 'troll'

/**
 * Probability of each kind of ordinary room, summing to 1. A monster room holds
 * between 1 and the number of heroes, at most 3; a shrine heals every standing hero.
 */
export const ROOM_ODDS = { empty: 0.2, treasure: 0.25, shrine: 0.15, monsters: 0.4 }

/** Hit points a shrine gives back to each standing hero. */
export const SHRINE_HEAL = 12

/** Gold held in a treasure: minimum and maximum. */
export const TREASURE_GOLD = { min: 10, max: 30 }

/** Time during which an expedition not started yet stays listed, in milliseconds. */
export const OPEN_GAME_MS = 60 * 60_000
