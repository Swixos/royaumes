/**
 * Theme layer: the look of every game entity is defined here and nowhere else.
 * Components never hard-code a glyph, they ask for an entity look by its
 * identifier, so changing the art direction only changes this file.
 *
 * @packageDocumentation
 */

/** Look of a game entity. */
export interface Look {
  /** Displayed glyph. */
  glyph: string
  /** French label, read by screen readers and shown on hover. */
  label: string
}

/** Look of each known entity, by identifier. */
export const theme: Record<string, Look> = {
  village: { glyph: '🏰', label: 'Village' },
  wood: { glyph: '🪵', label: 'Bois' },
  stone: { glyph: '🪨', label: 'Pierre' },
  gold: { glyph: '🪙', label: 'Or' },
  sawmill: { glyph: '🪚', label: 'Scierie' },
  quarry: { glyph: '⛏️', label: 'Carrière' },
  mine: { glyph: '⚒️', label: 'Mine' },
  dungeon: { glyph: '⚔️', label: 'Donjon' },
  hero: { glyph: '🛡️', label: 'Héros' },
  companion: { glyph: '🤖', label: 'Compagnon' },
  goblin: { glyph: '👺', label: 'Gobelin' },
  skeleton: { glyph: '💀', label: 'Squelette' },
  troll: { glyph: '👹', label: 'Troll' },
  door: { glyph: '🚪', label: 'Porte' },
  ranking: { glyph: '🏆', label: 'Classement' },
}

/**
 * Finds the look of an entity.
 *
 * @param kind - Entity identifier.
 * @returns Its look, or a neutral look if the entity is unknown.
 */
export const look = (kind: string): Look => theme[kind] ?? { glyph: '?', label: kind }
