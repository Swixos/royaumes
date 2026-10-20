/**
 * Seeded pseudo-random generator: the same seed always produces the same
 * sequence, so unlike `Math.random` a draw can be replayed identically. It is not
 * cryptographic: knowing the seed lets anyone predict the draws.
 *
 * @packageDocumentation
 */

/** Generator: each call returns a number in [0, 1). */
export type Random = () => number

/**
 * Creates a generator from a seed, using the mulberry32 algorithm. The `>>> 0`
 * operations bring each result back to an unsigned 32-bit integer.
 *
 * @param seed - Seed of the sequence.
 * @returns The generator.
 */
export function seeded(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Combines several integers into a derived seed (simplified FNV-1a hash).
 * `mix(seed, 3)` always gives the same seed, different from `mix(seed, 4)`.
 *
 * @param parts - Integers to combine.
 * @returns The derived seed.
 */
export function mix(...parts: number[]): number {
  let hash = 0x811c9dc5
  for (const part of parts) hash = Math.imul(hash ^ (part >>> 0), 0x01000193) >>> 0
  return hash
}

/**
 * Draws an integer between two bounds.
 *
 * @param random - Generator.
 * @param min - Lower bound, included.
 * @param max - Upper bound, included.
 * @returns The drawn integer.
 */
export const randomInt = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))

/**
 * Draws an item from a non-empty list.
 *
 * @param random - Generator.
 * @param items - Items to draw from.
 * @returns The drawn item.
 */
export const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]
