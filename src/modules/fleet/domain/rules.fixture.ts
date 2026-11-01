/**
 * Values of the units for the tests of the fleet domain: a copy of the catalog the village
 * module publishes, since the domain receives it as rules and imports no other module.
 *
 * @packageDocumentation
 */
import type { ArmyRules } from './battle'

/** Values of the units, as the village module publishes them. */
export const RULES: ArmyRules = {
  land: {
    swordsman: {
      attack: 5,
      damage: 'blunt',
      defense: { blunt: 14, sharp: 8, distance: 30 },
      booty: 16,
    },
    slinger: {
      attack: 23,
      damage: 'distance',
      defense: { blunt: 7, sharp: 8, distance: 2 },
      booty: 8,
    },
    archer: {
      attack: 8,
      damage: 'distance',
      defense: { blunt: 7, sharp: 25, distance: 13 },
      booty: 12,
    },
    hoplite: {
      attack: 16,
      damage: 'sharp',
      defense: { blunt: 18, sharp: 12, distance: 7 },
      booty: 8,
    },
  },
  naval: {
    transport: { attack: 0, defense: 0, capacity: 10, speed: 8 },
    bireme: { attack: 24, defense: 160, capacity: 0, speed: 15 },
    lightShip: { attack: 200, defense: 60, capacity: 0, speed: 13 },
  },
}
