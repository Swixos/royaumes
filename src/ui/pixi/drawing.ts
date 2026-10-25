/**
 * Drawings shared by the scenes of the game, in its art direction: flat colors, a dark
 * outline, light from the left, no gradient. Every function draws around a ground anchor
 * at (0, 0), the front foot of the element, so a scene only has to place it.
 *
 * @packageDocumentation
 */
import { Container, Graphics, Text } from 'pixi.js'

/** A point of a scene, in world units. */
export interface Point {
  x: number
  y: number
}

/** Colors of the scene. */
export const PALETTE = {
  ink: 0x2a170a,
  sea: 0x2f86a8,
  wave: 0x4f9fbd,
  deep: 0x25708f,
  shallow: 0x56a7c2,
  foam: 0xd8ecef,
  sand: 0xe6d29a,
  sandDark: 0xcfb877,
  grass: 0x7a9a45,
  grassDark: 0x67863a,
  grassLight: 0x8fae55,
  road: 0xd9bf83,
  roadEdge: 0xbf9f60,
  dirt: 0xa77f4b,
  field: 0xd8b04a,
  fieldDark: 0xbf9433,
  plaster: 0xecdcb5,
  plasterSide: 0xcdb88a,
  timber: 0x6b4423,
  timberDark: 0x4a2d18,
  roof: 0xa8452a,
  roofSide: 0x83321d,
  thatch: 0xc99a45,
  thatchSide: 0xa47a30,
  stone: 0xa39d92,
  stoneSide: 0x857e73,
  stoneDark: 0x5b5650,
  rock: 0x8a8174,
  rockSide: 0x6b6357,
  snow: 0xf3e3bb,
  leaf: 0x55803a,
  leafDark: 0x3f6528,
  leafLight: 0x6f9a48,
  trunk: 0x5a381f,
  gold: 0xe8cd84,
  goldDark: 0xc9a24a,
  banner: 0x8c2a1c,
  bannerDark: 0x6a1d12,
  parchment: 0xecdcb5,
  cloud: 0xf6ecd2,
  smoke: 0xe9e1cf,
  shadow: 0x1d3a22,
  hole: 0x1c120a,
} as const

/** Width of the outline of every drawing. */
export const LINE = 3

/**
 * Fills a polygon and outlines it.
 *
 * @param g - Graphics to draw into.
 * @param points - Flat list of coordinates: x0, y0, x1, y1...
 * @param color - Fill color.
 * @param line - Width of the outline; 0 for none.
 */
export function shape(g: Graphics, points: number[], color: number, line = LINE) {
  g.poly(points).fill(color)
  if (line > 0) g.stroke({ width: line, color: PALETTE.ink, join: 'round' })
}

/** Size and colors of a house. */
export interface HouseSpec {
  /** Horizontal shift of the front wall from the anchor. */
  x?: number
  /** Vertical shift of the front wall from the anchor. */
  y?: number
  /** Width of the front wall. */
  w: number
  /** Height of the walls. */
  h: number
  /** Depth of the house, seen on its right side. */
  d: number
  /** Height of the roof above the walls. */
  r: number
  /** Colors of the walls: front and side. */
  wall?: [number, number]
  /** Colors of the roof: front slope and side slope. */
  roof?: [number, number]
  /** Number of windows on the front wall. */
  windows?: number
  /** True to draw a door in the middle of the front wall. */
  door?: boolean
  /** True to draw timber framing on the front wall. */
  timbered?: boolean
}

/**
 * Draws a house seen from the south-west: a front wall with its gable, a side wall going
 * back to the right, and the two slopes of the roof.
 *
 * @param g - Graphics to draw into.
 * @param spec - Size and colors of the house.
 * @returns The top of the chimney, where the smoke comes out.
 */
export function house(g: Graphics, spec: HouseSpec): Point {
  const { x = 0, y = 0, w, h, d, r } = spec
  const [wall, wallSide] = spec.wall ?? [PALETTE.plaster, PALETTE.plasterSide]
  const [roof, roofSide] = spec.roof ?? [PALETTE.roof, PALETTE.roofSide]
  const dx = d * 0.62
  const dy = d * 0.42
  const left = x - w / 2
  const right = x + w / 2
  const top = y - h

  shape(g, [right, y, right + dx, y - dy, right + dx, top - dy, right, top], wallSide)
  shape(g, [left, y, right, y, right, top, left, top], wall)
  if (spec.timbered) {
    g.moveTo(left, top + h * 0.45).lineTo(right, top + h * 0.45)
    g.moveTo(left + w * 0.25, top).lineTo(left + w * 0.25, y)
    g.moveTo(right - w * 0.25, top).lineTo(right - w * 0.25, y)
    g.stroke({ width: 2.5, color: PALETTE.timber })
  }
  const windows = spec.windows ?? 0
  for (let i = 0; i < windows; i++) {
    const wx = left + (w * (i + 1)) / (windows + 1)
    g.rect(wx - 5, top + h * 0.22, 10, 12)
      .fill(PALETTE.hole)
      .stroke({ width: 2, color: PALETTE.timberDark })
  }
  if (spec.door) {
    g.roundRect(x - 8, y - Math.min(26, h * 0.6), 16, Math.min(26, h * 0.6), 6)
      .fill(PALETTE.timberDark)
      .stroke({ width: 2, color: PALETTE.ink })
  }

  shape(g, [x, top - r, x + dx, top - r - dy, right + dx, top - dy, right, top], roofSide)
  shape(g, [left, top, x, top - r, right, top], roof)
  g.moveTo(left + w * 0.2, top - r * 0.2)
    .lineTo(right - w * 0.2, top - r * 0.2)
    .stroke({ width: 2, color: PALETTE.ink, alpha: 0.35 })

  const chimney = { x: x + dx * 0.7, y: top - r - dy * 0.4 }
  g.rect(chimney.x - 6, chimney.y - 16, 12, 20)
    .fill(PALETTE.stoneSide)
    .stroke({ width: 2.5, color: PALETTE.ink })
  return { x: chimney.x, y: chimney.y - 16 }
}

/**
 * Draws a tree: a leafy one, or a pine.
 *
 * @param size - Scale of the tree.
 * @param pine - True for a pine.
 * @returns The tree, anchored at the foot of its trunk.
 */
export function tree(size: number, pine: boolean): Graphics {
  const g = new Graphics()
  g.ellipse(6, 2, 22, 7).fill({ color: PALETTE.shadow, alpha: 0.25 })
  g.rect(-4, -22, 8, 24).fill(PALETTE.trunk).stroke({ width: 2.5, color: PALETTE.ink })
  if (pine) {
    for (const [width, top, bottom] of [
      [26, -72, -40],
      [22, -88, -58],
      [16, -102, -76],
    ]) {
      shape(g, [-width, bottom, 0, top, width, bottom], PALETTE.leafDark, 2.5)
      shape(g, [-width, bottom, 0, top, 0, bottom], PALETTE.leaf, 0)
    }
  } else {
    g.circle(10, -44, 20).fill(PALETTE.leafDark).stroke({ width: 2.5, color: PALETTE.ink })
    g.circle(-10, -42, 20).fill(PALETTE.leaf).stroke({ width: 2.5, color: PALETTE.ink })
    g.circle(2, -62, 21).fill(PALETTE.leaf).stroke({ width: 2.5, color: PALETTE.ink })
    g.circle(-6, -66, 8).fill(PALETTE.leafLight)
  }
  g.scale.set(size)
  return g
}

/**
 * Draws a flag on its pole.
 *
 * @param g - Graphics to draw into.
 * @param x - Foot of the pole.
 * @param y - Foot of the pole.
 * @param height - Height of the pole.
 * @param color - Color of the cloth.
 */
export function flag(
  g: Graphics,
  x: number,
  y: number,
  height: number,
  color: number = PALETTE.banner,
) {
  g.moveTo(x, y)
    .lineTo(x, y - height)
    .stroke({ width: 3, color: PALETTE.ink })
  shape(g, [x, y - height, x + 26, y - height + 6, x, y - height + 14], color, 2.5)
}

/**
 * Draws a trireme seen from the side, sail furled.
 *
 * @returns The ship, anchored at its waterline.
 */
export function ship(): Graphics {
  const g = new Graphics()
  shape(g, [-62, -18, 62, -18, 74, -32, 52, 0, -48, 0, -70, -26], PALETTE.timber)
  g.moveTo(-50, -10).lineTo(50, -10).stroke({ width: 2, color: PALETTE.gold })
  for (let i = 0; i < 7; i++) {
    g.moveTo(-40 + i * 13, -6)
      .lineTo(-46 + i * 13, 10)
      .stroke({ width: 2, color: PALETTE.timberDark })
  }
  g.moveTo(0, -18).lineTo(0, -92).stroke({ width: 4, color: PALETTE.ink })
  shape(g, [-34, -86, 34, -86, 30, -44, -30, -44], PALETTE.parchment)
  g.moveTo(-32, -66).lineTo(32, -66).stroke({ width: 2, color: PALETTE.banner })
  return g
}

/**
 * Draws a cloud: soft puffs over a rounded base, shaded underneath.
 *
 * @param width - Width of the cloud.
 * @returns The cloud.
 */
export function cloud(width: number): Graphics {
  const g = new Graphics()
  const r = width / 6
  g.ellipse(0, r * 0.45, r * 2.7, r * 0.75).fill({ color: PALETTE.smoke, alpha: 0.9 })
  g.circle(-r * 1.6, 0, r)
    .circle(-r * 0.4, -r * 0.6, r * 1.3)
    .circle(r * 0.9, -r * 0.35, r * 1.15)
    .circle(r * 1.9, r * 0.1, r * 0.8)
    .ellipse(0, r * 0.25, r * 2.5, r * 0.7)
  g.fill(PALETTE.cloud)
  return g
}

/**
 * Draws a bird with its wings spread; the scene flaps them by squashing it.
 *
 * @returns The bird.
 */
export function bird(): Graphics {
  const g = new Graphics()
  g.moveTo(-12, -4).quadraticCurveTo(-6, -10, 0, 0).quadraticCurveTo(6, -10, 12, -4)
  g.stroke({ width: 2.5, color: PALETTE.ink, cap: 'round', join: 'round' })
  return g
}

/** Font of the plaques, the display font of the game. */
export const DISPLAY = 'Cinzel, Alegreya, Georgia, serif'

/**
 * Easing that overshoots its target, then settles: used when a building rises.
 *
 * @param t - Progress, from 0 to 1.
 * @returns The eased progress.
 */
export function easeOutBack(t: number) {
  const c = 1.9
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

/**
 * Draws a plaque of the scene: a parchment board with a name and, for a building, its
 * level in a dark medallion.
 *
 * @param label - Text of the plaque.
 * @param withLevel - True to add the level medallion.
 * @returns The plaque, its board to recolor, and the level text.
 */
export function makePlaque(label: string, withLevel: boolean) {
  const plaque = new Container()
  const name = new Text({
    text: label,
    resolution: 2,
    style: {
      fontFamily: DISPLAY,
      fontWeight: '700',
      fontSize: 20,
      fill: PALETTE.ink,
      letterSpacing: 1,
    },
  })
  const levelText = new Text({
    text: '',
    resolution: 2,
    style: { fontFamily: DISPLAY, fontWeight: '900', fontSize: 18, fill: PALETTE.gold },
  })
  const width = name.width + 28 + (withLevel ? 34 : 0)
  const back = new Graphics()
  name.anchor.set(0, 0.5)
  name.position.set(-width / 2 + 14, 0)
  levelText.anchor.set(0.5)
  levelText.position.set(width / 2 - 20, 0)
  plaque.addChild(back, name)
  if (withLevel) plaque.addChild(levelText)
  const paint = (color: number) => {
    back.clear()
    back
      .roundRect(-width / 2, -17, width, 34, 6)
      .fill(color)
      .stroke({ width: 3, color: PALETTE.ink })
    if (withLevel)
      back
        .circle(width / 2 - 20, 0, 15)
        .fill(PALETTE.ink)
        .stroke({ width: 2, color: PALETTE.goldDark })
  }
  paint(PALETTE.parchment)
  return { plaque, levelText, paint }
}
