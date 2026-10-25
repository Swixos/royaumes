/**
 * Layout of the village scene: an isometric ground grid, the walled town with its square
 * and streets, the place of every building, the roads leaving the gates, the fields, the
 * lots where houses rise as the village grows, and the trees. This file holds no drawing
 * and no rendering library, so the rules deciding what the scene shows are tested without
 * a browser.
 *
 * @packageDocumentation
 */
import { BUILDINGS, type Building, type Levels, MAX_LEVEL } from '../contracts'

/** A point of the world, in scene units. */
export interface Point {
  x: number
  y: number
}

/** Position on the ground grid, in tiles: `u` runs down to the right, `v` down to the left. */
export interface Tile {
  u: number
  v: number
}

/** Rectangle of ground, in tiles, centered on `at` and aligned with the grid. */
export interface Footprint {
  at: Tile
  size: Tile
}

/** Width of the world, in scene units; the canvas scales it to its own size. */
export const WORLD_WIDTH = 1600

/** Height of the world, in scene units. */
export const WORLD_HEIGHT = 900

/** Half the width of a tile on screen, in scene units. */
export const HALF_W = 32

/** Half the height of a tile on screen: the grid is seen at the classic 2:1 angle. */
export const HALF_H = 16

/** Center of the town square, origin of the grid and first point shown by the camera. */
export const TOWN: Point = { x: 800, y: 440 }

/** Half the side of the walled town, in tiles. */
export const TOWN_SIZE = 4

/** Half the side of the town square, in tiles. */
export const SQUARE_SIZE = 1.5

/** Half the width of a street, in tiles. */
export const STREET_WIDTH = 0.45

/**
 * Projects a tile of the ground onto the screen.
 *
 * @param tile - Position on the grid.
 * @returns The point of the world.
 */
export function project(tile: Tile): Point {
  return { x: TOWN.x + (tile.u - tile.v) * HALF_W, y: TOWN.y + (tile.u + tile.v) * HALF_H }
}

/**
 * Finds the tile of the ground under a point of the screen.
 *
 * @param point - Point of the world.
 * @returns The position on the grid.
 */
export function unproject(point: Point): Tile {
  const a = (point.x - TOWN.x) / HALF_W
  const b = (point.y - TOWN.y) / HALF_H
  return { u: (a + b) / 2, v: (b - a) / 2 }
}

/** Gates of the town wall, in the middle of each side; the wall building is the first. */
export const GATES: readonly Tile[] = [
  { u: TOWN_SIZE, v: 0 },
  { u: 0, v: TOWN_SIZE },
  { u: -TOWN_SIZE, v: 0 },
  { u: 0, v: -TOWN_SIZE },
]

/**
 * Ground of each building: the senate and the warehouse inside the walls, the producers on
 * their own ground (forest edge, cliff, mountain), the gate of the wall facing the harbor,
 * and the shipyard on the south-west shore.
 */
export const FOOTPRINTS: Record<Building, Footprint> = {
  senate: { at: { u: -2.3, v: -2.3 }, size: { u: 2.2, v: 2 } },
  sawmill: { at: { u: -7, v: 4 }, size: { u: 1.8, v: 1.4 } },
  quarry: { at: { u: -8, v: -2 }, size: { u: 2, v: 2 } },
  mine: { at: { u: 2, v: -9 }, size: { u: 1.8, v: 1.6 } },
  warehouse: { at: { u: 2.3, v: -2.3 }, size: { u: 1.6, v: 2 } },
  wall: { at: GATES[0], size: { u: 0.8, v: 1.4 } },
  shipyard: { at: { u: 6.5, v: 11.5 }, size: { u: 2, v: 2.4 } },
}

/** Anchor of each building on screen: the center of its ground. */
export const PLACES = Object.fromEntries(
  BUILDINGS.map((building) => [building, project(FOOTPRINTS[building].at)]),
) as Record<Building, Point>

/** Pier of the harbor, at the south shore. */
export const HARBOR_TILE: Tile = { u: 11, v: 6 }

/** Anchor of the harbor on screen. */
export const HARBOR = project(HARBOR_TILE)

/** Foot of the mountain holding the mine, behind its entrance. */
export const MOUNTAIN_TILE: Tile = { u: 0.6, v: -10.9 }

/** Foot of the mountain on screen. */
export const MOUNTAIN = project(MOUNTAIN_TILE)

/** Foot of the cliff the quarry cuts, behind it. */
export const CLIFF_TILE: Tile = { u: -9.8, v: -3.4 }

/** Foot of the cliff on screen. */
export const CLIFF = project(CLIFF_TILE)

/** Center of the forest feeding the sawmill. */
export const FOREST: Tile = { u: -10.5, v: 5.5 }

/** Crop growing in a field. */
export type Crop = 'wheat' | 'barley' | 'plowed' | 'meadow'

/** Fields around the town, aligned with the grid like a real patchwork of plots. */
export const FIELDS: ReadonlyArray<Footprint & { crop: Crop }> = [
  { at: { u: 6.6, v: -3.2 }, size: { u: 1.8, v: 2.2 }, crop: 'wheat' },
  { at: { u: 8.6, v: -3.2 }, size: { u: 1.8, v: 2.2 }, crop: 'plowed' },
  { at: { u: 6.6, v: -5.6 }, size: { u: 1.8, v: 2.2 }, crop: 'barley' },
  { at: { u: 8.6, v: -5.6 }, size: { u: 1.8, v: 2.2 }, crop: 'meadow' },
  { at: { u: -2.1, v: 7.4 }, size: { u: 2, v: 1.8 }, crop: 'barley' },
  { at: { u: -2.1, v: 9.4 }, size: { u: 2, v: 1.8 }, crop: 'wheat' },
  { at: { u: -4.3, v: 7.4 }, size: { u: 2, v: 1.8 }, crop: 'plowed' },
]

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
 * Sum of the levels of the village, which measures how far it has grown: how many houses
 * stand and how many villagers walk its streets.
 *
 * @param levels - Level of each building.
 * @returns The total level.
 */
export function totalLevel(levels: Levels): number {
  return BUILDINGS.reduce((sum, building) => sum + levels[building], 0)
}

/** Defense around the town, from the level of the wall. */
export type Wall = 'none' | 'palisade' | 'stone'

/**
 * Defense surrounding the town: only an earth bank first, then a wooden palisade, then a
 * stone wall from the fifth level.
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
 * Pseudo-random generator from a seed (mulberry32): the scene places its trees and its
 * houses with it, so they stand at the same place on every visit.
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

/**
 * Tells whether two pieces of ground overlap.
 *
 * @param a - First piece of ground.
 * @param b - Second piece of ground.
 * @param margin - Gap kept between them, in tiles.
 * @returns True if they overlap, or come closer than the margin.
 */
export function overlaps(a: Footprint, b: Footprint, margin = 0): boolean {
  return (
    Math.abs(a.at.u - b.at.u) < (a.size.u + b.size.u) / 2 + margin &&
    Math.abs(a.at.v - b.at.v) < (a.size.v + b.size.v) / 2 + margin
  )
}

/** Distance between two points. */
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** Buildings reached by a road from the town square. */
export const ROAD_ENDS: readonly Building[] = ['sawmill', 'quarry', 'mine', 'shipyard']

/**
 * Route of each road, in tiles: from the town square along a street to a gate, then across
 * the country to the door of a building, or to the harbor for the last one.
 */
const ROUTES: readonly Tile[][] = [
  [
    { u: 0, v: 0 },
    { u: -TOWN_SIZE, v: 0 },
    { u: -5.3, v: 1.1 },
    { u: -6.4, v: 3 },
  ],
  [
    { u: 0, v: 0 },
    { u: -TOWN_SIZE, v: 0 },
    { u: -5.6, v: -0.5 },
    { u: -6.9, v: -1.5 },
  ],
  [
    { u: 0, v: 0 },
    { u: 0, v: -TOWN_SIZE },
    { u: 0.5, v: -5.8 },
    { u: 1.6, v: -8 },
  ],
  [
    { u: 0, v: 0 },
    { u: 0, v: TOWN_SIZE },
    { u: 1.3, v: 6.3 },
    { u: 3.3, v: 8.7 },
    { u: 5.4, v: 10.3 },
  ],
  [
    { u: 0, v: 0 },
    { u: TOWN_SIZE, v: 0 },
    { u: 6, v: 1 },
    { u: 8.4, v: 3.4 },
    { u: 10.2, v: 5.4 },
  ],
]

/**
 * Samples a smooth curve through points (Catmull-Rom), the way a path worn by the
 * villagers rounds its corners.
 *
 * @param points - Points the curve goes through, in order.
 * @param samples - Number of segments between two points.
 * @returns The points of the curve.
 */
export function smooth(points: Point[], samples = 6): Point[] {
  const curve: Point[] = [points[0]]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    for (let s = 1; s <= samples; s++) {
      const t = s / samples
      const t2 = t * t
      const t3 = t2 * t
      /**
       * Interpolates one coordinate.
       *
       * @param a - Coordinate of the point before.
       * @param b - Coordinate of the start point.
       * @param c - Coordinate of the end point.
       * @param d - Coordinate of the point after.
       * @returns The coordinate on the curve.
       */
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
      curve.push({
        x: Math.round(at(p0.x, p1.x, p2.x, p3.x) * 10) / 10,
        y: Math.round(at(p0.y, p1.y, p2.y, p3.y) * 10) / 10,
      })
    }
  }
  return curve
}

/**
 * Roads of the village, from the town square to every producing building, the shipyard
 * and the harbor. Inside the walls they follow the straight streets; outside they bend
 * like paths, sampled into short segments so the scene draws them and walks the villagers
 * on the same points.
 *
 * @returns The points of each road, starting at the town square.
 */
export function roads(): Point[][] {
  return ROUTES.map((route) => {
    const [square, gate, ...country] = route.map(project)
    return [square, ...smooth([gate, ...country])]
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

/** Lot where a house rises as the village grows. */
export interface Lot extends Footprint {
  /** Direction of the ridge of its roof, along the street it faces. */
  ridge: 'u' | 'v'
  /** Seed choosing the look of the house. */
  seed: number
  /** True inside the walls; outside, the house lines a road of the suburbs. */
  inside: boolean
}

/** Positions of the lots inside the walls along each axis, between the streets. */
const BLOCK_ROWS = [-3.2, -2.15, -1.1, 1.1, 2.15, 3.2]

/** Largest number of houses lining the roads outside the walls. */
const SUBURB_LOTS = 16

/**
 * Lots of the houses, in the order they are built: inside the walls first, from the town
 * square outward, then along the roads leaving the gates. A lot never covers a building,
 * the square, a street, a road or a field.
 *
 * @returns The lots, in order of construction.
 */
export function lots(): Lot[] {
  const random = seeded(23)
  const taken: Footprint[] = [
    ...BUILDINGS.map((building) => FOOTPRINTS[building]),
    { at: { u: 0, v: 0 }, size: { u: SQUARE_SIZE * 2, v: SQUARE_SIZE * 2 } },
    ...FIELDS,
    { at: HARBOR_TILE, size: { u: 2.4, v: 2 } },
  ]
  const ways = roads()
  const inside: Lot[] = []
  for (const u of BLOCK_ROWS) {
    for (const v of BLOCK_ROWS) {
      const size = { u: 0.86, v: 0.86 }
      const lot = { at: { u, v }, size }
      if (taken.some((ground) => overlaps(lot, ground, 0.05))) continue
      inside.push({
        ...lot,
        ridge: Math.abs(u) < Math.abs(v) ? 'v' : 'u',
        seed: Math.floor(random() * 1e6),
        inside: true,
      })
    }
  }
  inside.sort((a, b) => Math.hypot(a.at.u, a.at.v) - Math.hypot(b.at.u, b.at.v))

  const coast = islandOutline()
  const outside: Lot[] = []
  for (let u = -11; u <= 11; u += 1.05) {
    for (let v = -11; v <= 11; v += 1.05) {
      const lot = { at: { u, v }, size: { u: 0.8, v: 0.8 } }
      if (Math.max(Math.abs(u), Math.abs(v)) < TOWN_SIZE + 0.9) continue
      const at = project(lot.at)
      const near = Math.min(...ways.map((way) => distanceToPath(at, way)))
      if (near < 34 || near > 52) continue
      if (!contains({ x: at.x, y: at.y + 30 }, coast) || !contains(at, coast)) continue
      if (taken.some((ground) => overlaps(lot, ground, 0.3))) continue
      if (outside.some((other) => overlaps(lot, other, 0.25))) continue
      outside.push({
        ...lot,
        ridge: random() > 0.5 ? 'u' : 'v',
        seed: Math.floor(random() * 1e6),
        inside: false,
      })
    }
  }
  outside.sort(
    (a, b) =>
      Math.min(...GATES.map((g) => Math.hypot(a.at.u - g.u, a.at.v - g.v))) -
      Math.min(...GATES.map((g) => Math.hypot(b.at.u - g.u, b.at.v - g.v))),
  )
  return [...inside, ...outside.slice(0, SUBURB_LOTS)]
}

/**
 * Houses standing in the village: a hamlet at the start, then a house more for every level
 * gained, filling the walls before spilling along the roads.
 *
 * @param levels - Level of each building.
 * @returns The lots built, in order of construction.
 */
export function housesFor(levels: Levels): Lot[] {
  const all = lots()
  return all.slice(0, Math.min(all.length, 4 + totalLevel(levels)))
}

/** A tree of the island. */
export interface TreeSpot extends Point {
  /** Scale of the tree. */
  size: number
  /** True for a pine, false for a leafy tree. */
  pine: boolean
}

/**
 * Trees of the island: a dense forest beside the sawmill, groves on the slopes of the
 * mountain, then a few trees between the fields. A tree never stands on the coast, in the
 * town, on a building, a field, a lot or a road.
 *
 * @param count - Number of trees.
 * @returns The foot of each tree, from back to front.
 */
export function trees(count = 110): TreeSpot[] {
  const random = seeded(7)
  const coast = islandOutline().map((p) => ({
    x: 800 + (p.x - 800) * 0.9,
    y: 470 + (p.y - 470) * 0.88,
  }))
  const taken: Footprint[] = [
    ...BUILDINGS.map((building) => FOOTPRINTS[building]),
    ...FIELDS,
    ...lots(),
    { at: HARBOR_TILE, size: { u: 2.4, v: 2 } },
    { at: { u: 0, v: 0 }, size: { u: TOWN_SIZE * 2 + 1, v: TOWN_SIZE * 2 + 1 } },
  ]
  const ways = roads()
  const groves: Array<{ at: Tile; spread: number; share: number }> = [
    { at: FOREST, spread: 3.4, share: 0.55 },
    { at: { u: -4.5, v: -7 }, spread: 2.2, share: 0.15 },
    { at: { u: 6.5, v: -9 }, spread: 2, share: 0.12 },
  ]
  const found: TreeSpot[] = []
  for (let attempt = 0; found.length < count && attempt < count * 60; attempt++) {
    const pick = random()
    let total = 0
    const grove = groves.find((g) => {
      total += g.share
      return pick < total
    })
    const tile = grove
      ? {
          u: grove.at.u + (random() - 0.5) * 2 * grove.spread,
          v: grove.at.v + (random() - 0.5) * 2 * grove.spread,
        }
      : { u: (random() - 0.5) * 26, v: (random() - 0.5) * 26 }
    const point = project(tile)
    const spot = { at: tile, size: { u: 0.3, v: 0.3 } }
    if (!contains(point, coast)) continue
    if (distance(point, MOUNTAIN) < 150 || distance(point, CLIFF) < 110) continue
    if (taken.some((ground) => overlaps(spot, ground, 0.2))) continue
    if (ways.some((way) => distanceToPath(point, way) < 22)) continue
    if (found.some((tree) => distance(point, tree) < (grove ? 15 : 30))) continue
    const pine = grove ? random() < (grove.at === FOREST ? 0.45 : 0.75) : random() < 0.2
    found.push({ ...point, size: 0.85 + random() * 0.35, pine })
  }
  return found.sort((a, b) => a.y - b.y)
}
