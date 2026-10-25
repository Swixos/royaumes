/**
 * Layout of the village scene: size of the world, outline of the island, place of every
 * building, roads and trees. This file holds no drawing and no rendering library, so the
 * rules deciding what the scene shows are tested without a browser.
 *
 * @packageDocumentation
 */
import { BUILDINGS, type Building, type Levels, MAX_LEVEL, PRODUCERS } from '../contracts'

/** A point of the world, in scene units. */
export interface Point {
  x: number
  y: number
}

/** Width of the world, in scene units; the canvas scales it to its own size. */
export const WORLD_WIDTH = 1600

/** Height of the world, in scene units. */
export const WORLD_HEIGHT = 900

/** Center of the island, where the senate stands. */
export const TOWN_HALL: Point = { x: 800, y: 440 }

/** Gate of the wall, south of the senate, where its plaque hangs. */
export const GATE: Point = { x: 800, y: 548 }

/** Landing stage of the harbor, at the south shore. */
export const HARBOR: Point = { x: 930, y: 735 }

/**
 * Place of each building: the senate at the center, the producers on their own ground
 * (forest, cliff and mountain), the warehouse near the fields, the wall around the senate
 * and the shipyard on the shore, west of the pier.
 */
export const PLACES: Record<Building, Point> = {
  senate: TOWN_HALL,
  sawmill: { x: 430, y: 540 },
  quarry: { x: 560, y: 300 },
  mine: { x: 1190, y: 400 },
  warehouse: { x: 1040, y: 585 },
  wall: GATE,
  shipyard: { x: 520, y: 730 },
}

/** Buildings reached by a road from the senate. */
export const ROAD_ENDS: readonly Building[] = [...PRODUCERS, 'warehouse', 'shipyard']

/** Foot of the mountain holding the mine, behind its entrance. */
export const MOUNTAIN: Point = { x: 1250, y: 330 }

/** Foot of the cliff the quarry cuts, behind it. */
export const CLIFF: Point = { x: 600, y: 240 }

/** Center of the forest feeding the sawmill. */
export const FOREST: Point = { x: 270, y: 430 }

/**
 * Size stage of a building, from its level: 0 is an empty plot, then the building grows
 * every three levels, and the last stage crowns the maximum level.
 *
 * @param level - Level of the building, from 0 to `MAX_LEVEL`.
 * @returns The stage, from 0 to 4.
 */
export function stageOf(level: number): number {
  if (level <= 0) return 0
  if (level >= MAX_LEVEL) return 4
  return Math.min(3, Math.ceil(level / 3))
}

/**
 * Sum of the levels of the village, which measures how far it has grown and how many
 * villagers walk its roads.
 *
 * @param levels - Level of each building.
 * @returns The total level.
 */
export function totalLevel(levels: Levels): number {
  return BUILDINGS.reduce((sum, building) => sum + levels[building], 0)
}

/** Defense around the senate, from the level of the wall. */
export type Wall = 'none' | 'palisade' | 'stone'

/**
 * Defense surrounding the senate: a wooden palisade first, then a stone wall from the
 * fifth level.
 *
 * @param level - Level of the wall.
 * @returns The kind of wall.
 */
export function wallOf(level: number): Wall {
  if (level >= 5) return 'stone'
  if (level >= 1) return 'palisade'
  return 'none'
}

/**
 * Outline of the island: an ellipse whose radius is bent by a few waves, so the coast
 * looks drawn by hand while staying the same on every render.
 *
 * @param count - Number of points of the outline.
 * @returns The points of the outline, clockwise.
 */
export function islandOutline(count = 72): Point[] {
  const center = { x: 800, y: 470 }
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    const bend =
      1 +
      0.07 * Math.sin(angle * 3 + 0.6) +
      0.045 * Math.sin(angle * 5 + 1.9) +
      0.02 * Math.sin(angle * 11)
    return {
      x: Math.round(center.x + Math.cos(angle) * 660 * bend),
      y: Math.round(center.y + Math.sin(angle) * 300 * bend),
    }
  })
}

/**
 * Tells whether a point lies inside a polygon, by counting the edges a horizontal ray
 * crosses.
 *
 * @param point - Point to test.
 * @param polygon - Points of the polygon, in order.
 * @returns True if the point is inside.
 */
export function contains(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Pseudo-random generator from a seed (mulberry32): the scene places its trees with it,
 * so they stand at the same place on every visit.
 *
 * @param seed - Seed of the sequence.
 * @returns A function giving the next number, between 0 and 1.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Distance between two points. */
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Trees of the island: a dense forest around the sawmill, then scattered trees. A tree
 * never stands on the coast, on a building or on a road.
 *
 * @param count - Number of trees.
 * @returns The foot of each tree with its size, from back to front.
 */
export function trees(count = 64): Array<Point & { size: number }> {
  const random = seeded(7)
  const coast = islandOutline()
  const blocked: Array<{ at: Point; radius: number }> = [
    { at: TOWN_HALL, radius: 230 },
    { at: HARBOR, radius: 90 },
    { at: { x: 1150, y: 650 }, radius: 80 },
    { at: MOUNTAIN, radius: 190 },
    { at: CLIFF, radius: 130 },
    ...BUILDINGS.map((b) => ({ at: PLACES[b], radius: 135 })),
  ]
  const found: Array<Point & { size: number }> = []
  for (let attempt = 0; found.length < count && attempt < count * 40; attempt++) {
    const inForest = found.length < count * 0.6
    const point = inForest
      ? { x: FOREST.x + (random() - 0.5) * 360, y: FOREST.y + (random() - 0.5) * 300 }
      : { x: 200 + random() * 1200, y: 230 + random() * 480 }
    const inland = contains(point, coast) && contains({ x: point.x, y: point.y + 40 }, coast)
    const free = blocked.every(({ at, radius }) => distance(point, at) > radius)
    const spaced = found.every((tree) => distance(point, tree) > 26)
    const offRoad = roads().every((road) => distanceToPath(point, road) > 26)
    if (inland && free && spaced && offRoad) {
      found.push({ ...point, size: 0.8 + random() * 0.5 })
    }
  }
  return found.sort((a, b) => a.y - b.y)
}

/**
 * Roads of the village, from the town hall to every building and to the harbor. Each road
 * is a curve, like a path worn by the villagers, sampled into short segments so the scene
 * draws it and walks the villagers on the same points.
 *
 * @param samples - Number of segments of each road.
 * @returns The points of each road, starting at the town hall.
 */
export function roads(samples = 14): Point[][] {
  const targets = [...ROAD_ENDS.map((b) => PLACES[b]), HARBOR]
  return targets.map((to) => {
    const from = { x: TOWN_HALL.x, y: TOWN_HALL.y + 40 }
    const end = { x: to.x, y: to.y + 20 }
    const bend = {
      x: (from.x + end.x) / 2 + (end.y - from.y) * 0.35,
      y: (from.y + end.y) / 2 - (end.x - from.x) * 0.12 + 30,
    }
    return Array.from({ length: samples + 1 }, (_, i) => {
      const t = i / samples
      return {
        x: Math.round((1 - t) ** 2 * from.x + 2 * (1 - t) * t * bend.x + t ** 2 * end.x),
        y: Math.round((1 - t) ** 2 * from.y + 2 * (1 - t) * t * bend.y + t ** 2 * end.y),
      }
    })
  })
}

/**
 * Length of a path.
 *
 * @param path - Points of the path, in order.
 * @returns The sum of the length of its segments.
 */
export function pathLength(path: Point[]): number {
  return path.slice(1).reduce((sum, point, i) => sum + distance(path[i], point), 0)
}

/**
 * Point reached on a path after a share of its length, used to walk the villagers.
 *
 * @param path - Points of the path, in order.
 * @param share - Share of the length, between 0 (start) and 1 (end); clamped.
 * @returns The point reached.
 */
export function pointAlong(path: Point[], share: number): Point {
  let left = Math.min(1, Math.max(0, share)) * pathLength(path)
  for (let i = 1; i < path.length; i++) {
    const step = distance(path[i - 1], path[i])
    if (left <= step) {
      const t = step === 0 ? 0 : left / step
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * t,
      }
    }
    left -= step
  }
  return path[path.length - 1]
}

/**
 * Shortest distance from a point to a path.
 *
 * @param point - Point to measure.
 * @param path - Points of the path, in order.
 * @returns The distance to the closest segment.
 */
export function distanceToPath(point: Point, path: Point[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t =
      length === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length),
          )
    best = Math.min(best, distance(point, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }))
  }
  return best
}
