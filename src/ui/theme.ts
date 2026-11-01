/**
 * Theme layer: the look of every game entity is defined here and in the icon set
 * (`game-icons.ts`), nowhere else. Components never hard-code a drawing or a color, they
 * ask for an entity by its identifier, so changing the art direction only changes these
 * two files.
 *
 * @packageDocumentation
 */

/** Look of a game entity. */
export interface Look {
  /** French label, read by screen readers and shown on hover. */
  label: string
  /** Color of its icon. */
  color: string
}

/** Look of each known entity, by identifier. Its drawing has the same identifier. */
export const theme: Record<string, Look> = {
  village: { label: 'Village', color: '#8f2a20' },
  wood: { label: 'Bois', color: '#8a5a2b' },
  stone: { label: 'Pierre', color: '#6f6a62' },
  gold: { label: 'Or', color: '#c98a0b' },
  sawmill: { label: 'Scierie', color: '#6f6a62' },
  quarry: { label: 'Carrière', color: '#5d4a3a' },
  mine: { label: 'Mine', color: '#4a3a2a' },
  senate: { label: 'Sénat', color: '#8f2a20' },
  warehouse: { label: 'Entrepôt', color: '#6b3f23' },
  wall: { label: 'Rempart', color: '#5b5650' },
  shipyard: { label: 'Chantier naval', color: '#1f5f92' },
  build: { label: 'Chantier', color: '#6b3f23' },
  capacity: { label: 'Capacité', color: '#6b3f23' },
  dungeon: { label: 'Donjon', color: '#4a3a2a' },
  hero: { label: 'Héros', color: '#1f5f92' },
  companion: { label: 'Compagnon', color: '#2f7f7a' },
  goblin: { label: 'Gobelin', color: '#3f7a33' },
  skeleton: { label: 'Squelette', color: '#5a5148' },
  troll: { label: 'Troll', color: '#6a4a7e' },
  door: { label: 'Porte', color: '#6b3f23' },
  ranking: { label: 'Classement', color: '#c98a0b' },
  market: { label: 'Marché', color: '#1f5f92' },
  tavern: { label: 'Taverne', color: '#b9761a' },
  fleet: { label: 'Flotte', color: '#1f5f92' },
  trireme: { label: 'Trirème', color: '#6b3f23' },
  pirates: { label: 'Pirates', color: '#2a1a10' },
  harbor: { label: 'Port', color: '#1f5f92' },
  ram: { label: 'Éperonnage', color: '#b2382c' },
  board: { label: 'Abordage', color: '#4a5560' },
  blockade: { label: 'Blocus', color: '#4a5560' },
  history: { label: 'Historique', color: '#6b3f23' },
  advisor: { label: 'Conseillère', color: '#6a4a7e' },
  quest: { label: 'Quête', color: '#6b3f23' },
  chest: { label: 'Récompense', color: '#c98a0b' },
  done: { label: 'Terminée', color: '#4a7428' },
  locked: { label: 'À venir', color: '#7a5f40' },
  sparkle: { label: 'Prête', color: '#c98a0b' },
  barracks: { label: 'Caserne', color: '#8f2a20' },
  farm: { label: 'Ferme', color: '#4a7428' },
  population: { label: 'Population', color: '#6b3f23' },
  warrior: { label: 'Guerrier', color: '#8f2a20' },
  ranger: { label: 'Rôdeuse', color: '#3f6b2a' },
  cleric: { label: 'Prêtresse', color: '#c98a0b' },
  spider: { label: 'Araignée', color: '#4b2a5c' },
  cultist: { label: 'Cultiste', color: '#6b1f3a' },
  lich: { label: 'Liche', color: '#3a5a7a' },
  shrine: { label: 'Sanctuaire', color: '#c98a0b' },
  torch: { label: 'Torche', color: '#e08a2c' },
  bulwark: { label: 'Rempart', color: '#5b5650' },
  volley: { label: 'Pluie de flèches', color: '#3f6b2a' },
  prayer: { label: 'Prière', color: '#c98a0b' },
  attack: { label: 'Attaque', color: '#8f2a20' },
  potion: { label: 'Soin', color: '#3f7a3a' },
  target: { label: 'Cible', color: '#a32a1a' },
  web: { label: 'Salle vide', color: '#7a6a58' },
  boss: { label: 'Gardien', color: '#2a170a' },
  troops: { label: 'Troupes', color: '#8f2a20' },
  swordsman: { label: 'Épéiste', color: '#5b5650' },
  slinger: { label: 'Frondeur', color: '#7a5f40' },
  archer: { label: 'Archer', color: '#4a7428' },
  hoplite: { label: 'Hoplite', color: '#8f2a20' },
  transport: { label: 'Bateau de transport', color: '#6b3f23' },
  bireme: { label: 'Birème', color: '#1f5f92' },
  lightShip: { label: 'Navire léger', color: '#b2382c' },
  blunt: { label: 'Contondant', color: '#5b5650' },
  sharp: { label: 'Tranchant', color: '#8f2a20' },
  distance: { label: 'Distance', color: '#4a7428' },
}

/**
 * Finds the look of an entity.
 *
 * @param kind - Entity identifier.
 * @returns Its look, or a neutral look if the entity is unknown.
 */
export const look = (kind: string): Look => theme[kind] ?? { label: kind, color: 'currentColor' }
