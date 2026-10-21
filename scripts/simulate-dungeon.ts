/**
 * Measures the balance of the dungeon: share of won expeditions, as a percentage,
 * by difficulty level, expedition composition and player behaviour.
 * Run with: pnpm exec tsx scripts/simulate-dungeon.ts
 *
 * @packageDocumentation
 */
import { winRate } from '@/modules/dungeon'

/** Number of simulated expeditions for each measure. */
const SEEDS = 500

/** Measured compositions: number of players and number of companions. */
const PARTIES = [
  [1, 0],
  [1, 1],
  [1, 3],
  [2, 0],
  [2, 2],
  [4, 0],
] as const

const rows = []
for (const behaviour of ['active', 'absent'] as const) {
  for (const [players, companions] of PARTIES) {
    const setup = { players, companions, behaviour }
    rows.push({
      joueurs: behaviour === 'active' ? 'actifs' : 'absents',
      composition: `${players} joueur(s), ${companions} compagnon(s)`,
      facile: `${winRate({ ...setup, difficulty: 'easy' }, SEEDS)} %`,
      difficile: `${winRate({ ...setup, difficulty: 'hard' }, SEEDS)} %`,
    })
  }
}
console.table(rows)
