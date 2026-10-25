/**
 * Drawings of the village scene, all in one isometric projection: every element stands on
 * the ground grid of the layout, lit from the upper left, so its left faces are bright, its
 * right faces in shade, and its shadow falls to the lower right. Every function draws
 * around a ground anchor at (0, 0), the center of the ground of the element, so the scene
 * only has to place it.
 *
 * @packageDocumentation
 */
import { Container, Graphics } from 'pixi.js'
import { PALETTE } from '@/ui/pixi/drawing'
import type { Building } from '../contracts'
import {
  type Crop,
  HALF_H,
  HALF_W,
  type Lot,
  type Point,
  seeded,
  type Tile,
  type Wall,
} from './layout'

/** Colors of the village that the shared palette lacks. */
export const TONES = {
  yard: 0xb3ab78,
  garden: 0x87a24e,
  cobble: 0xcfc2a0,
  cobbleLine: 0xa49574,
  bank: 0x9f8556,
  cut: 0xd6ccb8,
  plank: 0x9a6a3e,
  window: 0x3b2c20,
  barley: 0xcdb866,
  plowed: 0x8e6b43,
  meadow: 0x95b25c,
  hedge: 0x4d7230,
  slate: 0x6d7480,
  plasters: [0xecdcb5, 0xe9d2a4, 0xf2e6c9, 0xdcc6a0, 0xd9c7b0],
  roofs: [0xa8452a, 0xb65a3a, 0x93402a, 0xa8452a, 0x7d5a44],
  cloths: [0xb5432b, 0x2f6f9f, 0xd9a440, 0x5d8a3a],
} as const

/** Darkening of the faces turned away from the light. */
const SHADE = 0.74

/** Outline of every face: thin and soft, so the volumes read without a cartoon line. */
const EDGE = { width: 1.2, color: PALETTE.ink, alpha: 0.5, join: 'round' as const }

/**
 * Darkens or lightens a color.
 *
 * @param color - Color to change.
 * @param factor - Factor applied to each channel: below 1 darkens, above 1 lightens.
 * @returns The new color.
 */
export function tint(color: number, factor: number): number {
  /**
   * Scales one channel.
   *
   * @param shift - Position of the channel in the color.
   * @returns The scaled channel, in place.
   */
  const channel = (shift: number) =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor)) << shift
  return channel(16) | channel(8) | channel(0)
}

/**
 * Projects a point of the ground grid, raised by a height, relative to the anchor.
 *
 * @param u - Position along the `u` axis, in tiles.
 * @param v - Position along the `v` axis, in tiles.
 * @param h - Height above the ground, in scene units.
 * @returns The point on screen.
 */
export function iso(u: number, v: number, h = 0): Point {
  return { x: (u - v) * HALF_W, y: (u + v) * HALF_H - h }
}

/**
 * Fills a polygon, outlined with the soft edge of the scene.
 *
 * @param g - Graphics to draw into.
 * @param points - Corners of the polygon.
 * @param color - Fill color.
 * @param edge - False to leave it without outline.
 */
function face(g: Graphics, points: Point[], color: number, edge = true) {
  g.poly(points.flatMap((p) => [p.x, p.y])).fill(color)
  if (edge) g.stroke(EDGE)
}

/**
 * Draws a straight line.
 *
 * @param g - Graphics to draw into.
 * @param a - Start of the line.
 * @param b - End of the line.
 * @param color - Color of the line.
 * @param width - Width of the line.
 * @param alpha - Opacity of the line.
 */
function line(g: Graphics, a: Point, b: Point, color: number, width = 1.2, alpha = 1) {
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha, cap: 'round' })
}

/**
 * Point between two points.
 *
 * @param a - First point.
 * @param b - Second point.
 * @param t - Share of the way from `a` to `b`.
 * @returns The point.
 */
function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Convex hull of a set of points (monotone chain), used to draw shadows.
 *
 * @param points - Points to wrap.
 * @returns The corners of the hull, in order.
 */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  /**
   * Turn made by three points.
   *
   * @param o - First point.
   * @param a - Second point.
   * @param b - Third point.
   * @returns Positive for a counterclockwise turn.
   */
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Rectangle of ground, in tiles relative to the anchor. */
interface Area {
  u0: number
  u1: number
  v0: number
  v1: number
}

/**
 * Draws the shadow an element casts on the ground, to the lower right.
 *
 * @param g - Graphics to draw into.
 * @param area - Ground of the element.
 * @param height - Height of the element.
 */
export function castShadow(g: Graphics, area: Area, height: number) {
  const d = height * 0.02
  const corners = [
    [area.u0, area.v0],
    [area.u1, area.v0],
    [area.u1, area.v1],
    [area.u0, area.v1],
  ]
  const points = corners.flatMap(([u, v]) => [iso(u, v), iso(u + d, v - d * 0.3)])
  g.poly(hull(points).flatMap((p) => [p.x, p.y])).fill({ color: PALETTE.shadow, alpha: 0.2 })
}

/**
 * Draws a box standing on the ground: its two visible walls and its top.
 *
 * @param g - Graphics to draw into.
 * @param area - Ground of the box.
 * @param h1 - Height of its top.
 * @param color - Color of its lit wall; the shaded wall and the top derive from it.
 * @param h0 - Height of its bottom.
 * @param top - Color of its top.
 */
export function box(
  g: Graphics,
  area: Area,
  h1: number,
  color: number,
  h0 = 0,
  top = tint(color, 1.1),
) {
  const { u0, u1, v0, v1 } = area
  face(g, [iso(u1, v1, h0), iso(u1, v0, h0), iso(u1, v0, h1), iso(u1, v1, h1)], tint(color, SHADE))
  face(g, [iso(u0, v1, h0), iso(u1, v1, h0), iso(u1, v1, h1), iso(u0, v1, h1)], color)
  face(g, [iso(u0, v0, h1), iso(u1, v0, h1), iso(u1, v1, h1), iso(u0, v1, h1)], top)
}

/**
 * Ground of an element from its center and its size.
 *
 * @param at - Center of the ground, in tiles.
 * @param size - Size of the ground, in tiles.
 * @returns The rectangle of ground.
 */
function area(at: Tile, size: Tile): Area {
  return {
    u0: at.u - size.u / 2,
    u1: at.u + size.u / 2,
    v0: at.v - size.v / 2,
    v1: at.v + size.v / 2,
  }
}

/** Point of a wall: share of its width, height. */
type WallPoint = (t: number, h: number) => Point

/**
 * Draws a rectangle on a wall, such as a window, a door or a banner.
 *
 * @param g - Graphics to draw into.
 * @param wall - Points of the wall.
 * @param t0 - Start, as a share of the width of the wall.
 * @param t1 - End, as a share of the width of the wall.
 * @param h0 - Bottom height.
 * @param h1 - Top height.
 * @param color - Fill color.
 */
function panel(
  g: Graphics,
  wall: WallPoint,
  t0: number,
  t1: number,
  h0: number,
  h1: number,
  color: number,
) {
  face(g, [wall(t0, h0), wall(t1, h0), wall(t1, h1), wall(t0, h1)], color)
}

/** Look of a house. */
export interface HouseSpec {
  /** Center of its ground, relative to the anchor. */
  at?: Tile
  /** Size of its ground. */
  size: Tile
  /** Height of its walls. */
  h: number
  /** Rise of its roof above the walls. */
  r: number
  /** Direction of the ridge of its roof. */
  ridge: 'u' | 'v'
  /** Color of its walls. */
  wall?: number
  /** Color of its roof. */
  roof?: number
  /** True for a thatched roof, false for tiles. */
  thatch?: boolean
  /** Number of windows on its long lit wall. */
  windows?: number
  /** True to draw a door on its lit wall. */
  door?: boolean
  /** True to draw timber framing on its walls. */
  timbered?: boolean
  /** True to draw stone courses on its walls. */
  stone?: boolean
  /** True to draw upright planks on its walls. */
  planks?: boolean
  /** True to put a chimney on its roof. */
  chimney?: boolean
}

/**
 * Draws the details of a wall: stone courses, timber framing or planks, then its windows.
 *
 * @param g - Graphics to draw into.
 * @param wall - Points of the wall.
 * @param spec - Look of the house.
 * @param color - Color of the wall.
 * @param width - Width of the wall, in tiles.
 * @param windows - Number of windows on it.
 */
function dress(
  g: Graphics,
  wall: WallPoint,
  spec: HouseSpec,
  color: number,
  width: number,
  windows: number,
) {
  if (spec.stone) {
    for (let h = 7; h < spec.h; h += 7) line(g, wall(0, h), wall(1, h), tint(color, 0.75), 1, 0.6)
  }
  if (spec.planks) {
    const count = Math.round(width / 0.11)
    for (let i = 1; i < count; i++) {
      line(g, wall(i / count, 0), wall(i / count, spec.h), tint(color, 0.78), 1, 0.7)
    }
  }
  if (spec.timbered) {
    const beam = PALETTE.timber
    line(g, wall(0, spec.h * 0.52), wall(1, spec.h * 0.52), beam, 2)
    line(g, wall(0, spec.h - 1), wall(1, spec.h - 1), beam, 2)
    for (const t of [0.02, 0.98]) line(g, wall(t, 0), wall(t, spec.h), beam, 2)
    if (width > 0.7) line(g, wall(0.02, spec.h * 0.52), wall(0.3, spec.h - 1), beam, 1.6)
  }
  for (let i = 0; i < windows; i++) {
    const t = (i + 1) / (windows + 1)
    const half = 0.07 / width
    panel(g, wall, t - half, t + half, spec.h * 0.5, spec.h * 0.5 + 9, TONES.window)
    line(
      g,
      wall(t - half - 0.02, spec.h * 0.5 - 1),
      wall(t + half + 0.02, spec.h * 0.5 - 1),
      PALETTE.timber,
      1.6,
    )
  }
}

/**
 * Draws the lines of a roof slope, parallel to its ridge: rows of tiles or of thatch.
 *
 * @param g - Graphics to draw into.
 * @param slope - Corners of the slope: the two eaves, then the two ends of the ridge.
 * @param color - Color of the slope.
 * @param thatch - True for thatch.
 */
function roofRows(g: Graphics, slope: Point[], color: number, thatch: boolean) {
  const [e0, e1, r1, r0] = slope
  const rows = thatch ? 6 : 5
  for (let k = 1; k < rows; k++) {
    const t = k / rows
    line(g, lerp(e0, r0, t), lerp(e1, r1, t), tint(color, thatch ? 0.86 : 0.8), thatch ? 1.6 : 1.1)
  }
  line(g, r0, r1, tint(color, 0.62), 2)
}

/**
 * Draws a house with a gable roof, in the order the eye sees it: back slope, chimney,
 * walls, gable, then front slope.
 *
 * @param g - Graphics to draw into.
 * @param spec - Look of the house.
 * @returns The top of its chimney, where the smoke comes out, or null without one.
 */
export function house(g: Graphics, spec: HouseSpec): Point | null {
  const at = spec.at ?? { u: 0, v: 0 }
  const { u0, u1, v0, v1 } = area(at, spec.size)
  const wall = spec.wall ?? PALETTE.plaster
  const roof = spec.roof ?? PALETTE.roof
  const thatch = spec.thatch ?? false
  const { h, r } = spec
  const o = 0.07
  const eave = h - 2
  const top = h + r
  castShadow(g, { u0, u1, v0, v1 }, h + r * 0.6)

  const left: WallPoint = (t, hh) => iso(u0 + (u1 - u0) * t, v1, hh)
  const right: WallPoint = (t, hh) => iso(u1, v1 - (v1 - v0) * t, hh)
  const chimneyAt =
    spec.ridge === 'u'
      ? { u: u0 + (u1 - u0) * 0.28, v: at.v - 0.1 }
      : { u: at.u - 0.1, v: v0 + (v1 - v0) * 0.3 }
  /** Draws the chimney behind the ridge. */
  const chimney = () => {
    if (!spec.chimney) return
    const c = chimneyAt
    box(g, area(c, { u: 0.13, v: 0.13 }), top + 8, PALETTE.stoneSide, h + r * 0.4)
  }
  /** Draws the two visible walls with their details. */
  const walls = () => {
    face(g, [right(0, 0), right(1, 0), right(1, h), right(0, h)], tint(wall, SHADE))
    face(g, [left(0, 0), left(1, 0), left(1, h), left(0, h)], wall)
    const long = spec.ridge === 'u'
    dress(g, right, spec, tint(wall, SHADE), v1 - v0, long ? 1 : (spec.windows ?? 0))
    dress(g, left, spec, wall, u1 - u0, long ? (spec.windows ?? 0) : 1)
    if (spec.door) {
      const half = 0.075 / (u1 - u0)
      panel(g, left, 0.5 - half, 0.5 + half, 0, Math.min(15, h * 0.62), PALETTE.timberDark)
    }
  }

  if (spec.ridge === 'u') {
    const vm = at.v
    face(
      g,
      [
        iso(u0 - o, v0 - o, eave),
        iso(u1 + o, v0 - o, eave),
        iso(u1 + o, vm, top),
        iso(u0 - o, vm, top),
      ],
      tint(roof, 0.66),
    )
    chimney()
    walls()
    face(g, [iso(u1, v1, h), iso(u1, v0, h), iso(u1, vm, top)], tint(wall, SHADE))
    const slope = [
      iso(u0 - o, v1 + o, eave),
      iso(u1 + o, v1 + o, eave),
      iso(u1 + o, vm, top),
      iso(u0 - o, vm, top),
    ]
    face(g, slope, roof)
    roofRows(g, slope, roof, thatch)
    line(g, iso(u1 + o, v1 + o, eave), iso(u1 + o, vm, top), tint(roof, 0.55), 2)
  } else {
    const um = at.u
    face(
      g,
      [
        iso(u0 - o, v0 - o, eave),
        iso(u0 - o, v1 + o, eave),
        iso(um, v1 + o, top),
        iso(um, v0 - o, top),
      ],
      tint(roof, 0.66),
    )
    chimney()
    walls()
    face(g, [iso(u0, v1, h), iso(u1, v1, h), iso(um, v1, top)], wall)
    const slope = [
      iso(u1 + o, v1 + o, eave),
      iso(u1 + o, v0 - o, eave),
      iso(um, v0 - o, top),
      iso(um, v1 + o, top),
    ]
    face(g, slope, tint(roof, 0.8))
    roofRows(g, slope, tint(roof, 0.8), thatch)
    line(g, iso(u1 + o, v1 + o, eave), iso(um, v1 + o, top), tint(roof, 0.55), 2)
  }
  return spec.chimney ? iso(chimneyAt.u, chimneyAt.v, top + 8) : null
}

/**
 * Draws a pyramid roof on a square tower.
 *
 * @param g - Graphics to draw into.
 * @param ground - Ground of the tower.
 * @param h - Height of the walls.
 * @param rise - Height of the roof.
 * @param color - Color of the roof.
 * @returns The apex of the roof.
 */
function pyramid(g: Graphics, ground: Area, h: number, rise: number, color: number): Point {
  const o = 0.06
  const { u0, u1, v0, v1 } = ground
  const apex = iso((u0 + u1) / 2, (v0 + v1) / 2, h + rise)
  face(g, [iso(u1 + o, v1 + o, h), iso(u1 + o, v0 - o, h), apex], tint(color, 0.72))
  face(g, [iso(u0 - o, v1 + o, h), iso(u1 + o, v1 + o, h), apex], color)
  return apex
}

/**
 * Draws the merlons on top of a wall or a tower, back ones first.
 *
 * @param g - Graphics to draw into.
 * @param ground - Ground of the top.
 * @param h - Height of the top.
 * @param color - Color of the stone.
 */
function crenels(g: Graphics, ground: Area, h: number, color: number) {
  const s = 0.1
  const { u0, u1, v0, v1 } = ground
  const spots: Tile[] = []
  for (let u = u0; u <= u1 - s + 1e-6; u += 0.22) spots.push({ u, v: v0 }, { u, v: v1 - s })
  for (let v = v0; v <= v1 - s + 1e-6; v += 0.22) spots.push({ u: u0, v }, { u: u1 - s, v })
  spots.sort((a, b) => a.u + a.v - (b.u + b.v))
  for (const spot of spots) {
    box(g, { u0: spot.u, u1: spot.u + s, v0: spot.v, v1: spot.v + s }, h + 6, color, h)
  }
}

/**
 * Draws a small pennant on a pole.
 *
 * @param g - Graphics to draw into.
 * @param foot - Foot of the pole.
 * @param height - Height of the pole.
 * @param color - Color of the cloth.
 */
export function pennant(g: Graphics, foot: Point, height: number, color: number = PALETTE.banner) {
  line(g, foot, { x: foot.x, y: foot.y - height }, PALETTE.timberDark, 1.6)
  face(
    g,
    [
      { x: foot.x, y: foot.y - height },
      { x: foot.x + 16, y: foot.y - height + 4 },
      { x: foot.x, y: foot.y - height + 9 },
    ],
    color,
  )
}

/**
 * Draws a square tower, with a pyramid roof or merlons.
 *
 * @param g - Graphics to draw into.
 * @param at - Center of its ground.
 * @param side - Side of its ground, in tiles.
 * @param h - Height of its walls.
 * @param options - Look of the tower.
 * @param options.color - Color of its walls.
 * @param options.roof - Color of its roof, or null for merlons.
 * @param options.planks - True for a wooden tower.
 */
function tower(
  g: Graphics,
  at: Tile,
  side: number,
  h: number,
  options: { color?: number; roof?: number | null; planks?: boolean } = {},
) {
  const color = options.color ?? PALETTE.stone
  const ground = area(at, { u: side, v: side })
  castShadow(g, ground, h)
  box(g, ground, h, color)
  const left: WallPoint = (t, hh) => iso(ground.u0 + side * t, ground.v1, hh)
  const right: WallPoint = (t, hh) => iso(ground.u1, ground.v1 - side * t, hh)
  for (const [wall, shade] of [
    [left, color],
    [right, tint(color, SHADE)],
  ] as const) {
    dress(
      g,
      wall,
      {
        size: { u: side, v: side },
        h,
        r: 0,
        ridge: 'u',
        stone: !options.planks,
        planks: options.planks,
      },
      shade,
      side,
      0,
    )
  }
  panel(g, left, 0.42, 0.58, h * 0.62, h * 0.62 + 10, TONES.window)
  if (options.roof === null) {
    crenels(g, ground, h, color)
  } else {
    const apex = pyramid(g, ground, h, side * 60, options.roof ?? PALETTE.roof)
    pennant(g, apex, 16)
  }
}

/**
 * Draws a pile of logs lying along the `v` axis, their cut ends turned to the viewer.
 *
 * @param g - Graphics to draw into.
 * @param at - Front of the pile.
 * @param rows - Number of rows, the top one being the shortest.
 */
export function logPile(g: Graphics, at: Tile, rows: number) {
  for (let row = 0; row < rows; row++) {
    const count = rows - row + 1
    for (let i = 0; i < count; i++) {
      const u = at.u + (i - (count - 1) / 2) * 0.13
      const h = 4 + row * 7
      const end = iso(u, at.v, h)
      const back = iso(u, at.v - 0.45, h)
      line(g, back, end, PALETTE.trunk, 8)
      g.circle(end.x, end.y, 4)
        .fill(PALETTE.field)
        .stroke({ width: 1.2, color: PALETTE.timberDark })
    }
  }
}

/**
 * Draws a pile of cut stone blocks.
 *
 * @param g - Graphics to draw into.
 * @param at - Center of the pile.
 * @param count - Number of blocks.
 */
export function blockStack(g: Graphics, at: Tile, count: number) {
  const spots: Array<[number, number, number]> = [
    [0, 0, 0],
    [0.24, 0, 0],
    [0, 0.24, 0],
    [0.24, 0.24, 0],
    [0.12, 0.12, 9],
    [0.36, 0.12, 0],
    [0.12, 0.36, 0],
    [0.24, 0.24, 9],
  ]
  const placed = spots.slice(0, count).sort((a, b) => a[2] - b[2] || a[0] + a[1] - (b[0] + b[1]))
  for (const [du, dv, h] of placed) {
    const u = at.u + du - 0.18
    const v = at.v + dv - 0.18
    box(g, { u0: u, u1: u + 0.2, v0: v, v1: v + 0.2 }, h + 9, TONES.cut, h)
  }
}

/**
 * Draws crates, barrels and sacks of goods.
 *
 * @param g - Graphics to draw into.
 * @param at - Center of the goods.
 * @param count - Number of items.
 */
export function goods(g: Graphics, at: Tile, count: number) {
  for (let i = 0; i < count; i++) {
    const u = at.u + (i % 3) * 0.2 - 0.2
    const v = at.v + Math.floor(i / 3) * 0.22
    if (i % 3 === 1) {
      const foot = iso(u + 0.08, v + 0.08)
      g.roundRect(foot.x - 5, foot.y - 13, 10, 13, 3)
        .fill(PALETTE.trunk)
        .stroke(EDGE)
      g.ellipse(foot.x, foot.y - 13, 5, 2.4)
        .fill(PALETTE.timber)
        .stroke(EDGE)
    } else if (i % 3 === 2) {
      const foot = iso(u + 0.08, v + 0.08)
      g.ellipse(foot.x, foot.y - 5, 6, 6)
        .fill(PALETTE.parchment)
        .stroke(EDGE)
    } else {
      box(g, { u0: u, u1: u + 0.17, v0: v, v1: v + 0.17 }, 10, 0xb98a4e)
    }
  }
}

/** Parts of a building that the scene animates. */
export interface BuildingDrawing {
  /** The whole drawing, anchored at the center of the ground of the building. */
  root: Container
  /** Tops of the chimneys, where the smoke comes out. */
  chimneys: Point[]
  /** Part that turns (saw blade), swings (crane hook) or rolls (ore cart), if any. */
  moving?: Graphics
  /** Kind of motion of the moving part. */
  motion?: 'spin' | 'swing' | 'roll'
  /** Ends of the track of a rolling part. */
  track?: [Point, Point]
  /** Height of the drawing above its anchor, to place the label above it. */
  height: number
}

/**
 * Wraps the graphics of a building into its drawing, measuring its height.
 *
 * @param parts - Graphics of the building, from back to front.
 * @param chimneys - Tops of its chimneys.
 * @param extra - Animated part, if any.
 * @returns The drawing.
 */
function finish(
  parts: Graphics[],
  chimneys: Array<Point | null>,
  extra: Partial<BuildingDrawing> = {},
): BuildingDrawing {
  const root = new Container()
  root.addChild(...parts)
  const height = Math.max(40, -root.getLocalBounds().minY)
  return {
    root,
    chimneys: chimneys.filter((c): c is Point => c !== null),
    height,
    ...extra,
  }
}

/**
 * Draws the ground of a building to come: a levelled plot ringed with foundation stones,
 * corner stakes with a rope, and materials waiting for the builders.
 *
 * @param size - Size of the plot, in tiles.
 * @returns The plot, anchored at its center.
 */
export function plot(size: Tile): Graphics {
  const g = new Graphics()
  const { u0, u1, v0, v1 } = area({ u: 0, v: 0 }, size)
  face(g, [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)], tint(PALETTE.dirt, 1.15))
  const t = 0.08
  box(g, { u0, u1, v0, v1: v0 + t }, 4, PALETTE.stone)
  box(g, { u0, u1: u0 + t, v0, v1 }, 4, PALETTE.stone)
  box(g, { u0: u1 - t, u1, v0, v1 }, 4, PALETTE.stone)
  box(g, { u0, u1, v0: v1 - t, v1 }, 4, PALETTE.stone)
  const corners = [iso(u0, v0), iso(u1, v0), iso(u0, v1), iso(u1, v1)]
  for (const c of corners) line(g, c, { x: c.x, y: c.y - 14 }, PALETTE.timber, 2.5)
  const [, back, left, front] = corners
  g.moveTo(left.x, left.y - 11)
    .lineTo(front.x, front.y - 11)
    .lineTo(back.x, back.y - 11)
    .stroke({ width: 1, color: PALETTE.snow })
  blockStack(g, { u: u0 + 0.35, v: v0 + 0.35 }, 3)
  logPile(g, { u: (u0 + u1) / 2 + 0.1, v: (v0 + v1) / 2 + 0.15 }, 1)
  return g
}

/**
 * Draws the senate: a stone hall, then a tower, a wing and a keep as the village grows.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing, with the chimney tops and its height.
 */
function senate(stage: number): BuildingDrawing {
  const g = new Graphics()
  const chimneys: Array<Point | null> = []
  if (stage >= 2) tower(g, { u: -0.72, v: -0.62 }, 0.5, 58 + stage * 4)
  if (stage >= 4) tower(g, { u: 0.25, v: -0.72 }, 0.62, 92, { roof: null })
  if (stage >= 3) {
    chimneys.push(
      house(g, {
        at: { u: 0.74, v: -0.2 },
        size: { u: 0.62, v: 1.1 },
        h: 30,
        r: 20,
        ridge: 'v',
        wall: PALETTE.stone,
        stone: true,
        windows: 1,
        chimney: true,
      }),
    )
  }
  chimneys.push(
    house(g, {
      at: { u: -0.05, v: 0.3 },
      size: { u: 1.7, v: 1 },
      h: 34,
      r: 26,
      ridge: 'u',
      wall: PALETTE.stone,
      stone: true,
      windows: 4,
      door: true,
      chimney: true,
    }),
  )
  const facade: WallPoint = (t, hh) => iso(-0.9 + 1.7 * t, 0.8, hh)
  panel(g, facade, 0.24, 0.3, 14, 32, PALETTE.banner)
  panel(g, facade, 0.7, 0.76, 14, 32, PALETTE.banner)
  box(g, { u0: -0.3, u1: 0.2, v0: 0.8, v1: 1 }, 3, PALETTE.stone)
  return finish([g], chimneys)
}

/**
 * Draws a lean-to shed: four posts under a sloping roof.
 *
 * @param g - Graphics to draw into.
 * @param ground - Ground of the shed.
 * @param h - Height of its roof at the front.
 * @param roof - Color of its roof.
 */
function shed(g: Graphics, ground: Area, h: number, roof: number = PALETTE.thatch) {
  const { u0, u1, v0, v1 } = ground
  castShadow(g, ground, h)
  for (const [u, v] of [
    [u0, v0],
    [u1, v0],
  ]) {
    line(g, iso(u, v), iso(u, v, h + 8), PALETTE.timber, 3)
  }
  const o = 0.06
  const top = [
    iso(u0 - o, v0 - o, h + 8),
    iso(u1 + o, v0 - o, h + 8),
    iso(u1 + o, v1 + o, h),
    iso(u0 - o, v1 + o, h),
  ]
  face(g, top, roof)
  roofRows(g, [top[3], top[2], top[1], top[0]], roof, true)
  for (const [u, v] of [
    [u0, v1],
    [u1, v1],
  ]) {
    line(g, iso(u, v), iso(u, v, h), PALETTE.timber, 3)
  }
}

/**
 * Draws the sawmill: a timbered mill with an open saw shed, and piles of logs that grow
 * with its level.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its spinning saw blade.
 */
function sawmill(stage: number): BuildingDrawing {
  const g = new Graphics()
  const chimneys: Array<Point | null> = []
  if (stage >= 3) {
    chimneys.push(
      house(g, {
        at: { u: -0.55, v: -0.55 },
        size: { u: 0.6, v: 0.55 },
        h: 18,
        r: 15,
        ridge: 'u',
        roof: PALETTE.thatch,
        thatch: true,
        door: true,
        chimney: true,
      }),
    )
  }
  chimneys.push(
    house(g, {
      at: { u: -0.3, v: 0.05 },
      size: { u: 0.85, v: 0.8 },
      h: 22 + stage * 2,
      r: 20,
      ridge: 'v',
      roof: PALETTE.thatch,
      thatch: true,
      timbered: true,
      windows: 1,
      door: true,
      chimney: stage < 3,
    }),
  )
  shed(g, { u0: 0.25, u1: 0.85, v0: -0.4, v1: 0.3 }, 22)
  logPile(g, { u: 0.55, v: 0.65 }, Math.min(3, stage + 1))
  if (stage >= 2) logPile(g, { u: -0.55, v: 0.68 }, stage - 1)
  if (stage === 4) pennant(g, iso(-0.75, 0.45), 42, PALETTE.goldDark)
  const blade = new Graphics()
  blade
    .star(0, 0, 12, 9, 6.5)
    .fill(PALETTE.stone)
    .stroke({ width: 1, color: PALETTE.ink, alpha: 0.6 })
  blade.circle(0, 0, 2).fill(PALETTE.ink)
  const hub = iso(0.55, 0.3, 9)
  blade.position.set(hub.x, hub.y)
  return finish([g, blade], chimneys, { moving: blade, motion: 'spin' })
}

/**
 * Draws the quarry: terraces cut into the rock, a wooden crane lifting a block, a hut and
 * stacks of blocks that grow with its level.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its swinging crane hook.
 */
function quarry(stage: number): BuildingDrawing {
  const g = new Graphics()
  face(g, [iso(-1, -1), iso(1, -1), iso(1, 1), iso(-1, 1)], tint(TONES.cut, 0.92), false)
  const terraces = 1 + Math.min(2, stage)
  for (let i = 0; i < 3; i++) {
    const v0 = -1 + i * 0.42
    const h = (3 - i) * (6 + terraces * 4)
    box(g, { u0: -1, u1: 0.55, v0, v1: v0 + 0.42 }, h, TONES.cut, 0, tint(TONES.cut, 1.08))
    for (let k = 1; k < 6; k++) {
      const u = -1 + k * 0.26
      line(
        g,
        iso(u, v0 + 0.42, h - 2),
        iso(u, v0 + 0.42, Math.max(0, h - 9)),
        tint(TONES.cut, 0.7),
        1,
      )
    }
  }
  const chimneys: Array<Point | null> = []
  if (stage >= 2) {
    chimneys.push(
      house(g, {
        at: { u: 0.78, v: -0.6 },
        size: { u: 0.5, v: 0.5 },
        h: 18,
        r: 14,
        ridge: 'v',
        door: true,
        chimney: true,
      }),
    )
  }
  blockStack(g, { u: 0.35, v: 0.62 }, Math.min(8, 2 + stage * 2))
  if (stage >= 3) blockStack(g, { u: -0.55, v: 0.72 }, stage)
  if (stage === 4) pennant(g, iso(0.95, 0.2), 40, PALETTE.goldDark)
  const mast = iso(0.78, 0.25)
  const tip = iso(-0.15, -0.2, 70)
  line(g, mast, { x: mast.x, y: mast.y - 78 }, PALETTE.timber, 4)
  line(g, { x: mast.x, y: mast.y - 74 }, tip, PALETTE.timber, 3.5)
  line(g, { x: mast.x, y: mast.y - 40 }, tip, PALETTE.timberDark, 1.2)
  const hook = new Graphics()
  hook.moveTo(0, 0).lineTo(0, 34).stroke({ width: 1.2, color: PALETTE.ink })
  box(hook, { u0: -0.1, u1: 0.1, v0: -0.1, v1: 0.1 }, -32, TONES.cut, -40)
  hook.position.set(tip.x, tip.y)
  return finish([g, hook], chimneys, { moving: hook, motion: 'swing' })
}

/**
 * Draws the mine: a timbered gallery entrance in a rock outcrop, rails with an ore cart,
 * a lantern and piles of gold ore that grow with its level.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its rolling cart.
 */
function mine(stage: number): BuildingDrawing {
  const g = new Graphics()
  const chimneys: Array<Point | null> = []
  rock(g, ring({ u: -0.25, v: -0.45 }, 0.95, 0.6, 5, 9), [0, 34, 52], PALETTE.rock)
  const portal: WallPoint = (t, hh) => iso(-0.55 + 0.6 * t, 0.12, hh)
  panel(g, portal, 0.1, 0.9, 0, 26, PALETTE.hole)
  box(g, { u0: -0.6, u1: -0.5, v0: 0.06, v1: 0.18 }, 30, PALETTE.timber)
  box(g, { u0: 0, u1: 0.1, v0: 0.06, v1: 0.18 }, 30, PALETTE.timber)
  box(g, { u0: -0.66, u1: 0.16, v0: 0.06, v1: 0.18 }, 36, PALETTE.timber, 30)
  for (let k = 0; k < 6; k++) {
    const v = 0.22 + k * 0.13
    line(g, iso(-0.4, v), iso(-0.1, v), PALETTE.timber, 2.5)
  }
  for (const u of [-0.33, -0.17]) line(g, iso(u, 0.15), iso(u, 0.95), PALETTE.stoneDark, 1.6)
  const lantern = iso(0.16, 0.2)
  line(g, lantern, { x: lantern.x, y: lantern.y - 34 }, PALETTE.timberDark, 2)
  g.circle(lantern.x + 4, lantern.y - 30, 3.5)
    .fill(PALETTE.gold)
    .stroke(EDGE)
  ore(g, { u: 0.5, v: 0.45 }, 0.3 + stage * 0.05)
  if (stage >= 2) ore(g, { u: -0.85, v: 0.55 }, 0.22 + stage * 0.04)
  if (stage >= 3) {
    chimneys.push(
      house(g, {
        at: { u: 0.72, v: -0.35 },
        size: { u: 0.5, v: 0.55 },
        h: 18,
        r: 14,
        ridge: 'u',
        planks: true,
        wall: TONES.plank,
        door: true,
        chimney: true,
      }),
    )
  }
  if (stage === 4) pennant(g, iso(-0.25, -0.45, 52), 30, PALETTE.goldDark)
  const cart = new Graphics()
  box(cart, { u0: -0.12, u1: 0.12, v0: -0.1, v1: 0.1 }, 12, PALETTE.timber, 3)
  const load = iso(0, 0, 13)
  cart.ellipse(load.x, load.y, 7, 3.5).fill(PALETTE.goldDark).stroke(EDGE)
  const track: [Point, Point] = [iso(-0.25, 0.3), iso(-0.25, 0.85)]
  cart.position.set(track[0].x, track[0].y)
  return finish([g, cart], chimneys, { moving: cart, motion: 'roll', track })
}

/**
 * Draws a pile of gold ore, with a few nuggets catching the light.
 *
 * @param g - Graphics to draw into.
 * @param at - Center of the pile.
 * @param size - Width of the pile, in tiles.
 */
function ore(g: Graphics, at: Tile, size: number) {
  const base = iso(at.u, at.v)
  const w = size * HALF_W * 1.4
  face(
    g,
    [
      { x: base.x - w, y: base.y },
      { x: base.x - w * 0.4, y: base.y - w * 0.55 },
      { x: base.x + w * 0.2, y: base.y - w * 0.62 },
      { x: base.x + w, y: base.y },
      { x: base.x, y: base.y + w * 0.3 },
    ],
    PALETTE.rockSide,
  )
  for (const [dx, dy] of [
    [-0.4, -0.2],
    [0.1, -0.4],
    [0.45, -0.12],
  ]) {
    g.star(base.x + dx * w, base.y + dy * w, 4, 3.5, 1.5).fill(PALETTE.gold)
  }
}

/**
 * Draws the warehouse: a large barn with a double door, and goods piling up in front of
 * it as it grows.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing.
 */
function warehouse(stage: number): BuildingDrawing {
  const g = new Graphics()
  if (stage >= 3) shed(g, { u0: 0.55, u1: 0.85, v0: -0.75, v1: 0.45 }, 16, PALETTE.thatch)
  house(g, {
    at: { u: -0.1, v: -0.1 },
    size: { u: 1.1, v: 1.5 },
    h: 28 + stage * 3,
    r: 26,
    ridge: 'v',
    wall: TONES.plank,
    roof: PALETTE.roof,
    planks: true,
  })
  const gable: WallPoint = (t, hh) => iso(-0.65 + 1.1 * t, 0.65, hh)
  panel(g, gable, 0.3, 0.7, 0, 22, PALETTE.timberDark)
  line(g, gable(0.5, 0), gable(0.5, 22), PALETTE.timber, 1.4)
  goods(g, { u: -0.3, v: 0.82 }, Math.min(6, 2 + stage))
  if (stage === 4) pennant(g, iso(0.6, 0.6), 40, PALETTE.goldDark)
  return finish([g], [])
}

/**
 * Draws the main gate of the town, facing the harbor: two towers framing the passage,
 * wooden for a palisade, stone for a wall. Before the wall is built, only the foundations
 * of the towers wait on either side of the road.
 *
 * @param wall - Kind of wall.
 * @returns The drawing.
 */
function gate(wall: Wall): BuildingDrawing {
  const g = new Graphics()
  if (wall === 'none') {
    const back = plot({ u: 0.5, v: 0.5 })
    back.position.copyFrom(iso(0, -0.62))
    const front = plot({ u: 0.5, v: 0.5 })
    front.position.copyFrom(iso(0, 0.62))
    return finish([back, front], [])
  }
  const wooden = wall === 'palisade'
  const options = wooden
    ? { color: TONES.plank, planks: true, roof: PALETTE.thatch }
    : { color: PALETTE.stone, roof: PALETTE.roof }
  tower(g, { u: 0, v: -0.6 }, 0.42, wooden ? 40 : 48, options)
  const passage: WallPoint = (t, hh) => iso(0.16, 0.38 - 0.76 * t, hh)
  panel(g, passage, 0, 1, 0, 26, PALETTE.hole)
  box(g, { u0: -0.16, u1: 0.16, v0: -0.4, v1: 0.4 }, wooden ? 34 : 40, options.color, 26)
  if (!wooden) crenels(g, { u0: -0.16, u1: 0.16, v0: -0.4, v1: 0.4 }, 40, options.color)
  const door = new Graphics()
  face(
    door,
    [passage(0.05, 0), iso(0.5, 0.36, 0), iso(0.5, 0.36, 24), passage(0.05, 24)],
    PALETTE.trunk,
  )
  tower(g, { u: 0, v: 0.6 }, 0.42, wooden ? 40 : 48, options)
  return finish([g, door], [])
}

/**
 * Draws the shipyard: a slipway going down into the sea with a hull being built, a hut,
 * timber, and a crane as it grows.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its swinging crane hook, if any.
 */
function shipyard(stage: number): BuildingDrawing {
  const g = new Graphics()
  const chimneys: Array<Point | null> = []
  chimneys.push(
    house(g, {
      at: { u: -0.7, v: -0.8 },
      size: { u: 0.6, v: 0.5 },
      h: 18,
      r: 14,
      ridge: 'u',
      door: true,
      chimney: true,
    }),
  )
  logPile(g, { u: 0.75, v: -0.55 }, Math.min(3, stage))
  const deckAt = (v: number) => 4 - ((v + 0.9) / 3.5) * 22
  /**
   * Point of the slipway.
   *
   * @param u - Position across the slipway.
   * @param v - Position along the slipway.
   * @param lift - Height above the planks.
   * @returns The point on screen.
   */
  const on = (u: number, v: number, lift = 0) => iso(u, v, deckAt(v) + lift)
  face(g, [on(-0.45, -0.9), on(0.45, -0.9), on(0.45, 2.6), on(-0.45, 2.6)], PALETTE.timber)
  for (let v = -0.7; v < 2.6; v += 0.25) line(g, on(-0.45, v), on(0.45, v), PALETTE.timberDark, 1)
  const ribs = 3 + stage * 2
  for (let k = 0; k < ribs; k++) {
    const v = -0.55 + (k / (ribs - 1)) * 1.6
    const points = [on(-0.32, v, 22), on(-0.24, v, 7), on(0, v, 2), on(0.24, v, 7), on(0.32, v, 22)]
    g.poly(
      points.flatMap((p) => [p.x, p.y]),
      false,
    ).stroke({ width: 2.2, color: PALETTE.timber })
  }
  line(g, on(0, -0.7, 2), on(0, 1.2, 2), PALETTE.timberDark, 3)
  if (stage >= 3) {
    face(
      g,
      [on(-0.32, -0.55, 22), on(-0.32, 1.05, 22), on(-0.24, 1.05, 7), on(-0.24, -0.55, 7)],
      PALETTE.trunk,
    )
    line(g, on(0, 0.2, 2), on(0, 0.2, 70), PALETTE.timberDark, 2.5)
  }
  if (stage === 4) pennant(g, on(0, 0.2, 70), 6, PALETTE.goldDark)
  let hook: Graphics | undefined
  if (stage >= 2) {
    const mast = iso(0.75, 0.15)
    const tip = iso(0.1, 0.5, 66)
    line(g, mast, { x: mast.x, y: mast.y - 74 }, PALETTE.timber, 4)
    line(g, { x: mast.x, y: mast.y - 70 }, tip, PALETTE.timber, 3.5)
    hook = new Graphics()
    hook.moveTo(0, 0).lineTo(0, 30).stroke({ width: 1.2, color: PALETTE.ink })
    line(hook, { x: -10, y: 32 }, { x: 10, y: 38 }, PALETTE.trunk, 5)
    hook.position.set(tip.x, tip.y)
  }
  return finish(hook ? [g, hook] : [g], chimneys, hook ? { moving: hook, motion: 'swing' } : {})
}

/**
 * Draws a building at its stage, or its plot before it is built.
 *
 * @param building - Building to draw.
 * @param stage - Size stage, from 0 (plot) to 4.
 * @param size - Size of its ground, in tiles.
 * @param wall - Kind of wall, for the gate.
 * @returns The drawing and its animated parts.
 */
export function buildingDrawing(
  building: Building,
  stage: number,
  size: Tile,
  wall: Wall,
): BuildingDrawing {
  if (building === 'senate') return senate(Math.max(1, stage))
  if (building === 'wall') return gate(wall)
  if (stage === 0) return finish([plot({ u: size.u * 0.8, v: size.v * 0.8 })], [])
  if (building === 'sawmill') return sawmill(stage)
  if (building === 'quarry') return quarry(stage)
  if (building === 'mine') return mine(stage)
  if (building === 'warehouse') return warehouse(stage)
  return shipyard(stage)
}

/**
 * Draws a house of the town on its lot, its look chosen by the seed of the lot: walls,
 * roof, size and framing vary, the way no two houses of a real village are the same.
 *
 * @param lot - Lot of the house.
 * @returns The house, anchored at the center of its lot, and the top of its chimney.
 */
export function townHouse(lot: Lot): { root: Graphics; chimney: Point | null } {
  const random = seeded(lot.seed)
  const g = new Graphics()
  const long = 0.78 + random() * 0.12
  const deep = 0.55 + random() * 0.2
  const size = lot.ridge === 'u' ? { u: long, v: deep } : { u: deep, v: long }
  const thatch = !lot.inside && random() < 0.6
  const storeys = lot.inside && random() < 0.4 ? 2 : 1
  const chimney = house(g, {
    size,
    h: 14 + storeys * 9 + random() * 3,
    r: 13 + random() * 6,
    ridge: lot.ridge,
    wall: TONES.plasters[Math.floor(random() * TONES.plasters.length)],
    roof: thatch ? PALETTE.thatch : TONES.roofs[Math.floor(random() * TONES.roofs.length)],
    thatch,
    timbered: random() < 0.45,
    windows: storeys + (random() < 0.5 ? 0 : 1),
    door: true,
    chimney: random() < 0.6,
  })
  return { root: g, chimney }
}

/**
 * Draws a vegetable garden on a lot where no house stands yet: rows of greens edged with
 * a low fence.
 *
 * @param lot - Lot of the garden.
 * @returns The garden, anchored at the center of the lot.
 */
export function garden(lot: Lot): Graphics {
  const g = new Graphics()
  const { u0, u1, v0, v1 } = area({ u: 0, v: 0 }, { u: lot.size.u * 0.8, v: lot.size.v * 0.8 })
  face(g, [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)], TONES.garden, false)
  for (let k = 1; k < 5; k++) {
    const t = k / 5
    const a =
      lot.ridge === 'u' ? iso(u0 + 0.06, v0 + (v1 - v0) * t) : iso(u0 + (u1 - u0) * t, v0 + 0.06)
    const b =
      lot.ridge === 'u' ? iso(u1 - 0.06, v0 + (v1 - v0) * t) : iso(u0 + (u1 - u0) * t, v1 - 0.06)
    line(g, a, b, PALETTE.leafDark, 2.2, 0.8)
  }
  g.poly([iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)].flatMap((p) => [p.x, p.y])).stroke({
    width: 1.4,
    color: PALETTE.timber,
    alpha: 0.8,
  })
  return g
}

/**
 * Draws the well of the town square: a round stone curb under a small roof.
 *
 * @returns The well, anchored at its center.
 */
export function well(): Graphics {
  const g = new Graphics()
  castShadow(g, { u0: -0.2, u1: 0.2, v0: -0.2, v1: 0.2 }, 30)
  const r = 0.2 * HALF_W * 1.4
  g.rect(-r, -12, r * 2, 12)
    .fill(PALETTE.stone)
    .stroke(EDGE)
  g.ellipse(0, 0, r, r / 2)
    .fill(PALETTE.stone)
    .stroke(EDGE)
  g.ellipse(0, -12, r, r / 2)
    .fill(tint(PALETTE.stone, 1.1))
    .stroke(EDGE)
  g.ellipse(0, -12, r * 0.7, r * 0.35).fill(PALETTE.deep)
  for (const x of [-r * 0.8, r * 0.8]) line(g, { x, y: -10 }, { x, y: -34 }, PALETTE.timber, 2.5)
  const roof = [
    { x: -r * 1.2, y: -30 },
    { x: 0, y: -46 },
    { x: r * 1.2, y: -30 },
    { x: 0, y: -24 },
  ]
  face(g, roof, PALETTE.roof)
  line(g, { x: 0, y: -46 }, { x: 0, y: -24 }, PALETTE.roofSide, 1.4)
  return g
}

/**
 * Draws a market stall: a counter under a striped awning.
 *
 * @param color - Color of the stripes.
 * @returns The stall, anchored at its center.
 */
export function stall(color: number): Graphics {
  const g = new Graphics()
  const ground = { u0: -0.24, u1: 0.24, v0: -0.2, v1: 0.2 }
  castShadow(g, ground, 22)
  box(g, ground, 9, PALETTE.timber)
  const goodsAt = [iso(-0.1, 0, 10), iso(0.08, -0.05, 10), iso(0, 0.1, 10)]
  goodsAt.forEach((p, i) => {
    g.circle(p.x, p.y - 2, 2.6).fill([PALETTE.banner, PALETTE.gold, PALETTE.leafLight][i])
  })
  for (const [u, v] of [
    [-0.24, 0.2],
    [0.24, 0.2],
  ]) {
    line(g, iso(u, v), iso(u, v, 22), PALETTE.timberDark, 2)
  }
  const awning = [
    iso(-0.3, -0.26, 28),
    iso(0.3, -0.26, 28),
    iso(0.3, 0.28, 20),
    iso(-0.3, 0.28, 20),
  ]
  face(g, awning, PALETTE.parchment)
  for (let k = 0; k < 4; k++) {
    const t0 = k / 4 + 0.03
    const t1 = t0 + 0.12
    face(
      g,
      [
        lerp(awning[0], awning[1], t0),
        lerp(awning[0], awning[1], t1),
        lerp(awning[3], awning[2], t1),
        lerp(awning[3], awning[2], t0),
      ],
      color,
      false,
    )
  }
  return g
}

/**
 * Draws a piece of the town wall between two points of its line: a row of sharpened
 * stakes for a palisade, a crenellated stretch of masonry for a stone wall.
 *
 * @param wall - Kind of wall.
 * @param from - Start of the piece, relative to its anchor.
 * @param to - End of the piece, relative to its anchor.
 * @returns The piece of wall.
 */
export function wallPiece(wall: Wall, from: Tile, to: Tile): Graphics {
  const g = new Graphics()
  if (wall === 'none') return g
  const alongU = from.v === to.v
  if (wall === 'stone') {
    const t = 0.12
    const ground = alongU
      ? { u0: Math.min(from.u, to.u), u1: Math.max(from.u, to.u), v0: from.v - t, v1: from.v + t }
      : { u0: from.u - t, u1: from.u + t, v0: Math.min(from.v, to.v), v1: Math.max(from.v, to.v) }
    castShadow(g, ground, 24)
    box(g, ground, 24, PALETTE.stone)
    const wallPoint: WallPoint = alongU
      ? (s, hh) => iso(ground.u0 + (ground.u1 - ground.u0) * s, ground.v1, hh)
      : (s, hh) => iso(ground.u1, ground.v1 - (ground.v1 - ground.v0) * s, hh)
    for (let h = 6; h < 24; h += 6) {
      line(g, wallPoint(0, h), wallPoint(1, h), tint(PALETTE.stone, alongU ? 0.75 : 0.58), 1, 0.6)
    }
    crenels(g, ground, 24, PALETTE.stone)
    return g
  }
  const length = Math.hypot(to.u - from.u, to.v - from.v)
  const count = Math.max(2, Math.round(length / 0.1))
  for (let i = 0; i <= count; i++) {
    const s = i / count
    const foot = iso(from.u + (to.u - from.u) * s, from.v + (to.v - from.v) * s)
    const h = 22 + ((i * 7) % 5)
    const color = i % 2 === 0 ? PALETTE.timber : tint(PALETTE.timber, 0.85)
    face(
      g,
      [
        { x: foot.x - 2.6, y: foot.y },
        { x: foot.x - 2.6, y: foot.y - h },
        { x: foot.x, y: foot.y - h - 5 },
        { x: foot.x + 2.6, y: foot.y - h },
        { x: foot.x + 2.6, y: foot.y },
      ],
      color,
    )
  }
  line(g, iso(from.u, from.v, 13), iso(to.u, to.v, 13), PALETTE.timberDark, 2)
  return g
}

/**
 * Draws a tower of the town wall, at a corner or beside a small gate.
 *
 * @param wall - Kind of wall.
 * @param small - True for the post beside a small gate.
 * @returns The tower, anchored at its center.
 */
export function wallTower(wall: Wall, small: boolean): Graphics {
  const g = new Graphics()
  if (wall === 'none') return g
  if (wall === 'stone') {
    tower(g, { u: 0, v: 0 }, small ? 0.34 : 0.48, small ? 32 : 40, {
      roof: small ? null : PALETTE.roof,
    })
  } else {
    tower(g, { u: 0, v: 0 }, small ? 0.24 : 0.36, small ? 30 : 36, {
      color: TONES.plank,
      planks: true,
      roof: PALETTE.thatch,
    })
  }
  return g
}

/**
 * Builds an irregular ring of ground around a center, for rocks and mountains.
 *
 * @param at - Center of the ring.
 * @param ru - Radius along `u`, in tiles.
 * @param rv - Radius along `v`, in tiles.
 * @param seed - Seed of its irregularities.
 * @param count - Number of corners.
 * @returns The corners of the ring, in order.
 */
export function ring(at: Tile, ru: number, rv: number, seed: number, count = 10): Tile[] {
  const random = seeded(seed)
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + random() * 0.3
    const bend = 0.82 + random() * 0.3
    return { u: at.u + Math.cos(angle) * ru * bend, v: at.v + Math.sin(angle) * rv * bend }
  })
}

/**
 * Draws a mass of rock in faceted tiers: each tier rises from a ring and narrows toward
 * the next one, its faces lit or shaded by the way they turn.
 *
 * @param g - Graphics to draw into.
 * @param base - Ring of the foot of the rock.
 * @param heights - Height of each level, the first being the ground.
 * @param color - Color of the rock in full light.
 * @param cap - Color of the top, such as snow or grass.
 * @param narrow - Share of the width kept from one level to the next.
 */
export function rock(
  g: Graphics,
  base: Tile[],
  heights: number[],
  color: number,
  cap: number = tint(color, 1.12),
  narrow = 0.72,
) {
  const center = {
    u: base.reduce((s, p) => s + p.u, 0) / base.length,
    v: base.reduce((s, p) => s + p.v, 0) / base.length,
  }
  const levels = heights.map((_, k) =>
    base.map((p) => ({
      u: center.u + (p.u - center.u) * narrow ** k,
      v: center.v + (p.v - center.v) * narrow ** k,
    })),
  )
  if (heights[0] === 0) {
    castShadow(
      g,
      {
        u0: Math.min(...base.map((p) => p.u)),
        u1: Math.max(...base.map((p) => p.u)),
        v0: Math.min(...base.map((p) => p.v)),
        v1: Math.max(...base.map((p) => p.v)),
      },
      heights[heights.length - 1] * 0.8,
    )
  }
  for (let k = 0; k < heights.length - 1; k++) {
    const low = levels[k]
    const high = levels[k + 1]
    const faces = low
      .map((a, i) => {
        const j = (i + 1) % low.length
        const b = low[j]
        let nu = b.v - a.v
        let nv = -(b.u - a.u)
        const mid = { u: (a.u + b.u) / 2 - center.u, v: (a.v + b.v) / 2 - center.v }
        if (nu * mid.u + nv * mid.v < 0) {
          nu = -nu
          nv = -nv
        }
        const length = Math.hypot(nu, nv) || 1
        return { i, j, nu: nu / length, nv: nv / length, depth: mid.u + mid.v }
      })
      .filter((f) => f.nu + f.nv > -0.2)
      .sort((a, b) => a.depth - b.depth)
    for (const f of faces) {
      const light = 0.62 + 0.38 * Math.max(0, Math.min(1, (f.nv - f.nu + 1.2) / 2.4))
      face(
        g,
        [
          iso(low[f.i].u, low[f.i].v, heights[k]),
          iso(low[f.j].u, low[f.j].v, heights[k]),
          iso(high[f.j].u, high[f.j].v, heights[k + 1]),
          iso(high[f.i].u, high[f.i].v, heights[k + 1]),
        ],
        tint(color, light),
      )
    }
  }
  const top = levels[levels.length - 1]
  face(
    g,
    top.map((p) => iso(p.u, p.v, heights[heights.length - 1])),
    cap,
  )
}

/**
 * Draws the mountain holding the mine: faceted rock rising in tiers to a snowy summit.
 *
 * @returns The drawing, anchored at the foot of the mountain.
 */
export function mountain(): Graphics {
  const g = new Graphics()
  rock(
    g,
    ring({ u: 0, v: 0 }, 2.6, 1.8, 3, 14),
    [0, 30, 56],
    PALETTE.rock,
    tint(PALETTE.rock, 1.06),
    0.8,
  )
  const peaks = [
    { at: { u: -0.7, v: -0.5 }, r: 1.25, top: 132, seed: 5 },
    { at: { u: 0.8, v: -0.7 }, r: 1, top: 108, seed: 9 },
    { at: { u: 0.2, v: 0.5 }, r: 0.8, top: 84, seed: 4 },
  ]
  for (const peak of peaks) {
    const middle = 56 + (peak.top - 56) * 0.55
    rock(
      g,
      ring(peak.at, peak.r, peak.r * 0.8, peak.seed, 9),
      [56, middle, peak.top],
      PALETTE.rock,
      PALETTE.snow,
      0.6,
    )
    if (peak.top > 100) {
      const cap = peak.r * 0.36
      rock(
        g,
        ring(peak.at, cap, cap * 0.8, peak.seed, 9),
        [peak.top, peak.top + 18],
        PALETTE.snow,
        tint(PALETTE.snow, 1.04),
        0.4,
      )
    }
  }
  return g
}

/**
 * Draws the cliff the quarry cuts: a rocky plateau with a grassy top.
 *
 * @returns The drawing, anchored at the foot of the cliff.
 */
export function cliff(): Graphics {
  const g = new Graphics()
  rock(g, ring({ u: 0, v: 0 }, 2.2, 1.6, 12, 11), [0, 38, 62], PALETTE.rock, PALETTE.grass, 0.86)
  return g
}

/**
 * Draws a field: a plot aligned with the grid, its crop in rows, edged with a hedge on
 * its back sides.
 *
 * @param size - Size of the field, in tiles.
 * @param crop - Crop growing in it.
 * @returns The field, anchored at its center.
 */
export function fieldDrawing(size: Tile, crop: Crop): Graphics {
  const g = new Graphics()
  const { u0, u1, v0, v1 } = area({ u: 0, v: 0 }, size)
  const colors: Record<Crop, number> = {
    wheat: PALETTE.field,
    barley: TONES.barley,
    plowed: TONES.plowed,
    meadow: TONES.meadow,
  }
  const color = colors[crop]
  face(g, [iso(u0, v0), iso(u1, v0), iso(u1, v1), iso(u0, v1)], color, false)
  const rows = Math.round((v1 - v0) / 0.14)
  for (let k = 1; k < rows; k++) {
    const v = v0 + ((v1 - v0) * k) / rows
    line(
      g,
      iso(u0 + 0.05, v),
      iso(u1 - 0.05, v),
      tint(color, crop === 'meadow' ? 0.9 : 0.8),
      1.4,
      0.8,
    )
  }
  for (const [a, b] of [
    [iso(u0, v0), iso(u1, v0)],
    [iso(u0, v0), iso(u0, v1)],
  ]) {
    line(g, a, b, TONES.hedge, 5)
    line(g, { x: a.x, y: a.y - 2 }, { x: b.x, y: b.y - 2 }, PALETTE.leaf, 2.5)
  }
  return g
}

/**
 * Draws a tree, seen from the same angle as the buildings: a leafy one lit from the left,
 * or a pine.
 *
 * @param size - Scale of the tree.
 * @param pine - True for a pine.
 * @returns The tree, anchored at the foot of its trunk.
 */
export function isoTree(size: number, pine: boolean): Graphics {
  const g = new Graphics()
  g.ellipse(9, 1, 15, 5).fill({ color: PALETTE.shadow, alpha: 0.22 })
  g.rect(-2, -12, 4, 13).fill(PALETTE.trunk)
  if (pine) {
    for (const [w, top, bottom] of [
      [14, -36, -8],
      [11, -46, -22],
      [8, -55, -34],
    ]) {
      face(
        g,
        [
          { x: -w, y: bottom },
          { x: 0, y: top },
          { x: 0, y: bottom + 3 },
        ],
        PALETTE.leaf,
      )
      face(
        g,
        [
          { x: 0, y: top },
          { x: w, y: bottom },
          { x: 0, y: bottom + 3 },
        ],
        PALETTE.leafDark,
      )
    }
  } else {
    g.circle(4, -22, 11).fill(PALETTE.leafDark).stroke(EDGE)
    g.circle(-5, -21, 10).fill(PALETTE.leaf).stroke(EDGE)
    g.circle(0, -31, 11).fill(PALETTE.leaf).stroke(EDGE)
    g.circle(-4, -33, 6).fill(PALETTE.leafLight)
    g.circle(-8, -24, 4).fill(PALETTE.leafLight)
  }
  g.scale.set(size)
  return g
}

/**
 * Draws a trireme moored at the pier, seen from the same angle as the village, its sail
 * furled on the yard.
 *
 * @returns The ship, anchored at its waterline.
 */
export function mooredShip(): Graphics {
  const g = new Graphics()
  const deck = [
    iso(-1, 0, 9),
    iso(-0.6, 0.26, 10),
    iso(0.7, 0.26, 10),
    iso(1.15, 0, 14),
    iso(0.7, -0.26, 10),
    iso(-0.6, -0.26, 10),
  ]
  const keel = [iso(-0.85, 0, 0), iso(-0.5, 0.12, 0), iso(0.6, 0.12, 0), iso(1, 0, 2)]
  g.ellipse(0, 4, 50, 12).fill({ color: PALETTE.deep, alpha: 0.5 })
  face(g, [deck[0], deck[1], deck[2], deck[3], keel[3], keel[2], keel[1], keel[0]], PALETTE.timber)
  face(g, deck, tint(PALETTE.timber, 1.25))
  line(g, deck[1], deck[2], PALETTE.gold, 1.6)
  for (let k = 0; k < 6; k++) {
    const p = lerp(deck[1], deck[2], (k + 0.5) / 6)
    line(g, p, { x: p.x - 7, y: p.y + 12 }, PALETTE.timberDark, 1.4)
  }
  const mast = iso(0.05, 0, 10)
  line(g, mast, { x: mast.x, y: mast.y - 62 }, PALETTE.timberDark, 2.5)
  const yard = [iso(0.05, 0.36, 56), iso(0.05, -0.36, 56)]
  line(g, yard[0], yard[1], PALETTE.timber, 2.4)
  line(
    g,
    { x: yard[0].x, y: yard[0].y + 2.5 },
    { x: yard[1].x, y: yard[1].y + 2.5 },
    PALETTE.parchment,
    3,
  )
  pennant(g, { x: mast.x, y: mast.y - 62 }, 6)
  return g
}

/**
 * Draws the harbor: a wooden pier on piles reaching out to sea, with a storehouse on the
 * shore and goods waiting on the planks.
 *
 * @returns The drawing, anchored where the pier leaves the shore.
 */
export function harbor(): BuildingDrawing {
  const g = new Graphics()
  const chimneys: Array<Point | null> = []
  chimneys.push(
    house(g, {
      at: { u: -0.55, v: -1.1 },
      size: { u: 0.9, v: 0.6 },
      h: 22,
      r: 16,
      ridge: 'u',
      planks: true,
      wall: TONES.plank,
      door: true,
      chimney: true,
    }),
  )
  for (let u = -0.2; u <= 3.6; u += 0.45) {
    for (const v of [-0.22, 0.22]) {
      const foot = iso(u, v, -18)
      line(g, foot, iso(u, v, 4), PALETTE.timberDark, 3)
    }
  }
  box(g, { u0: -0.4, u1: 3.7, v0: -0.25, v1: 0.25 }, 5, PALETTE.timber, 1)
  for (let u = -0.2; u < 3.7; u += 0.18)
    line(g, iso(u, -0.25, 5), iso(u, 0.25, 5), PALETTE.timberDark, 0.8, 0.6)
  goods(g, { u: 0.2, v: -0.08 }, 4)
  return finish([g], chimneys)
}

/**
 * Draws the scaffolding of a construction under way, around the visible sides of the
 * ground of a building: poles, ledgers and planks.
 *
 * @param size - Size of the ground of the building, in tiles.
 * @param height - Height of the building.
 * @returns The scaffolding, anchored at the center of the building.
 */
export function scaffold(size: Tile, height: number): Graphics {
  const g = new Graphics()
  const m = 0.1
  const { u0, u1, v0, v1 } = area(
    { u: 0, v: 0 },
    { u: size.u * 0.8 + m * 2, v: size.v * 0.8 + m * 2 },
  )
  const top = Math.max(30, Math.min(height * 0.75, 80))
  const poles = [
    [u0, v1],
    [(u0 + u1) / 2, v1],
    [u1, v1],
    [u1, (v0 + v1) / 2],
    [u1, v0],
  ]
  for (const [u, v] of poles) line(g, iso(u, v), iso(u, v, top), PALETTE.timber, 2.6)
  for (let h = 12; h < top; h += 16) {
    line(g, iso(u0, v1, h), iso(u1, v1, h), PALETTE.timber, 2)
    line(g, iso(u1, v1, h), iso(u1, v0, h), PALETTE.timber, 2)
    line(g, iso(u0, v1, h + 2), iso(u1, v1, h + 2), PALETTE.field, 3, 0.9)
  }
  line(g, iso(u0, v1, 12), iso((u0 + u1) / 2, v1, top), PALETTE.timberDark, 1.4)
  return g
}

/**
 * Draws a villager: a small figure with a tunic and, when given, a load on the shoulder.
 *
 * @param tunic - Color of the tunic.
 * @returns The villager, anchored at their feet, and their load to show or hide.
 */
export function villager(tunic: number): { root: Container; load: Graphics } {
  const root = new Container()
  const g = new Graphics()
  g.ellipse(3, 0, 5, 2).fill({ color: PALETTE.shadow, alpha: 0.3 })
  face(
    g,
    [
      { x: -3.5, y: 0 },
      { x: 3.5, y: 0 },
      { x: 2.5, y: -10 },
      { x: -2.5, y: -10 },
    ],
    tunic,
  )
  g.circle(0, -13, 3).fill(0xe7c39a).stroke(EDGE)
  const load = new Graphics()
  load.roundRect(1.5, -17, 7, 5, 2).fill(PALETTE.timber).stroke(EDGE)
  root.addChild(g, load)
  return { root, load }
}

/**
 * Draws a token of a produced resource, rising from its building.
 *
 * @param resource - Produced resource.
 * @returns The token, centered.
 */
export function resourceToken(resource: 'wood' | 'stone' | 'gold'): Graphics {
  const g = new Graphics()
  g.circle(0, 0, 11).fill(PALETTE.parchment).stroke({ width: 1.6, color: PALETTE.ink })
  if (resource === 'wood') {
    g.roundRect(-7, -3, 14, 6, 3).fill(PALETTE.timber)
    g.circle(6, 0, 2.4).fill(PALETTE.field)
  } else if (resource === 'stone') {
    face(
      g,
      [
        { x: -6, y: 4 },
        { x: -4, y: -4 },
        { x: 3, y: -5 },
        { x: 7, y: 1 },
        { x: 3, y: 5 },
      ],
      PALETTE.stone,
    )
  } else {
    g.circle(0, 0, 6).fill(PALETTE.gold).stroke({ width: 1.2, color: PALETTE.goldDark })
  }
  return g
}
