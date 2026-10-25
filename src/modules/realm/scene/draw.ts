/**
 * Drawings of the village scene, in the art direction of the game: flat colors, a dark
 * outline, light from the left, no gradient. Every function draws around a ground anchor
 * at (0, 0), the front foot of the element, so the scene only has to place it.
 *
 * @packageDocumentation
 */
import { Container, Graphics } from 'pixi.js'
import { flag, house, LINE, PALETTE, shape } from '@/ui/pixi/drawing'
import type { Building } from '../contracts'
import type { Point, Wall } from './layout'

/**
 * Draws the flat shadow a building casts on the ground.
 *
 * @param g - Graphics to draw into.
 * @param width - Width of the shadow.
 */
function groundShadow(g: Graphics, width: number) {
  g.ellipse(width * 0.12, 4, width * 0.62, width * 0.16).fill({
    color: PALETTE.shadow,
    alpha: 0.28,
  })
}

/**
 * Draws a pile of logs, seen from their cut ends.
 *
 * @param g - Graphics to draw into.
 * @param x - Horizontal position of the pile.
 * @param y - Ground level of the pile.
 * @param rows - Number of rows, the top row being the shortest.
 */
export function logPile(g: Graphics, x: number, y: number, rows: number) {
  for (let row = 0; row < rows; row++) {
    const count = rows - row + 1
    for (let i = 0; i < count; i++) {
      const cx = x + (i - (count - 1) / 2) * 15
      const cy = y - 7 - row * 12
      g.circle(cx, cy, 7.5).fill(PALETTE.field).stroke({ width: 2.5, color: PALETTE.timberDark })
      g.circle(cx, cy, 3).stroke({ width: 1.5, color: PALETTE.fieldDark })
    }
  }
}

/**
 * Draws a stack of cut stone blocks.
 *
 * @param g - Graphics to draw into.
 * @param x - Horizontal position of the stack.
 * @param y - Ground level of the stack.
 * @param count - Number of blocks.
 */
export function blockStack(g: Graphics, x: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const row = i < 3 ? 0 : i < 5 ? 1 : 2
    const inRow = i < 3 ? i : i < 5 ? i - 3 : 0
    const bx = x + (inRow - 1) * 22 + row * 11
    const by = y - row * 15
    shape(g, [bx - 10, by, bx + 10, by, bx + 10, by - 15, bx - 10, by - 15], PALETTE.stone, 2.5)
    shape(
      g,
      [bx + 10, by, bx + 16, by - 5, bx + 16, by - 20, bx + 10, by - 15],
      PALETTE.stoneSide,
      2.5,
    )
    shape(
      g,
      [bx - 10, by - 15, bx + 10, by - 15, bx + 16, by - 20, bx - 4, by - 20],
      PALETTE.snow,
      2.5,
    )
  }
}

/**
 * Draws a pile of gold ore, with a few nuggets catching the light.
 *
 * @param g - Graphics to draw into.
 * @param x - Horizontal position of the pile.
 * @param y - Ground level of the pile.
 * @param size - Width of the pile.
 */
export function orePile(g: Graphics, x: number, y: number, size: number) {
  shape(
    g,
    [
      x - size / 2,
      y,
      x - size / 4,
      y - size * 0.35,
      x + size / 6,
      y - size * 0.42,
      x + size / 2,
      y,
    ],
    PALETTE.rockSide,
  )
  for (const [ox, oy] of [
    [-0.2, -0.12],
    [0.05, -0.25],
    [0.22, -0.1],
  ]) {
    g.star(x + ox * size, y + oy * size, 4, 5, 2.5)
      .fill(PALETTE.gold)
      .stroke({ width: 1.5, color: PALETTE.ink })
  }
}

/**
 * Draws an empty building plot: staked ground, a rope and a sign waiting for the builders.
 *
 * @returns The plot, anchored at its front.
 */
function plot(): Container {
  const g = new Graphics()
  shape(g, [-58, 0, 42, 0, 72, -26, -28, -26], PALETTE.dirt, 2.5)
  for (const [x, y] of [
    [-58, 0],
    [42, 0],
    [72, -26],
    [-28, -26],
  ]) {
    g.rect(x - 2.5, y - 18, 5, 18)
      .fill(PALETTE.timber)
      .stroke({ width: 2, color: PALETTE.ink })
  }
  g.moveTo(-58, -14).lineTo(42, -14).lineTo(72, -40).stroke({ width: 1.5, color: PALETTE.snow })
  g.rect(-4, -48, 6, 40).fill(PALETTE.timber).stroke({ width: 2, color: PALETTE.ink })
  g.rect(-22, -66, 42, 26).fill(PALETTE.parchment).stroke({ width: 2.5, color: PALETTE.ink })
  g.moveTo(-10, -48).lineTo(8, -60).stroke({ width: 4, color: PALETTE.timberDark, cap: 'round' })
  g.rect(2, -64, 12, 7).fill(PALETTE.stoneDark).stroke({ width: 1.5, color: PALETTE.ink })
  const container = new Container()
  container.addChild(g)
  return container
}

/** Parts of a building that the scene animates. */
export interface BuildingDrawing {
  /** The whole drawing, anchored at the front foot of the building. */
  root: Container
  /** Tops of the chimneys, where the smoke comes out. */
  chimneys: Point[]
  /** Part that turns (saw blade) or swings (crane), if any. */
  moving?: Graphics
  /** Kind of motion of the moving part. */
  motion?: 'spin' | 'swing' | 'roll'
  /** Height of the drawing, to place the label above it. */
  height: number
}

/**
 * Draws the sawmill: a timbered mill with its circular saw, and piles of logs that grow
 * with its level.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its animated parts.
 */
function sawmill(stage: number): BuildingDrawing {
  const root = new Container()
  const g = new Graphics()
  groundShadow(g, 120 + stage * 20)
  const w = 70 + stage * 12
  const chimneys = [
    house(g, {
      w,
      h: 40 + stage * 8,
      d: 46 + stage * 6,
      r: 30 + stage * 4,
      roof: [PALETTE.thatch, PALETTE.thatchSide],
      windows: stage >= 2 ? 2 : 1,
      door: true,
      timbered: true,
    }),
  ]
  if (stage >= 3) {
    chimneys.push(
      house(g, {
        x: -w / 2 - 30,
        w: 44,
        h: 34,
        d: 30,
        r: 22,
        roof: [PALETTE.thatch, PALETTE.thatchSide],
        door: true,
      }),
    )
  }
  logPile(g, w / 2 + 52, 6, Math.min(3, stage))
  if (stage >= 2) logPile(g, -w / 2 - (stage >= 3 ? 74 : 26), 10, stage - 1)
  if (stage === 4) flag(g, -w / 2 + 8, -40 - stage * 8, 60, PALETTE.goldDark)

  const bench = new Graphics()
  bench
    .rect(w / 2 + 2, -18, 30, 8)
    .fill(PALETTE.timber)
    .stroke({ width: 2, color: PALETTE.ink })
  root.addChild(g, bench)

  const blade = new Graphics()
  blade.star(0, 0, 12, 17, 13).fill(PALETTE.stone).stroke({ width: 2, color: PALETTE.ink })
  blade.circle(0, 0, 4).fill(PALETTE.ink)
  blade.position.set(w / 2 + 17, -24)
  root.addChild(blade)
  return { root, chimneys, moving: blade, motion: 'spin', height: 80 + stage * 12 }
}

/**
 * Draws the quarry: a cut face in the cliff, a wooden crane lifting a block, a hut and
 * stacks of blocks that grow with its level.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its animated parts.
 */
function quarry(stage: number): BuildingDrawing {
  const root = new Container()
  const g = new Graphics()
  groundShadow(g, 140)
  shape(g, [-80, 0, -60, -40, 10, -46, 40, -18, 60, 0], PALETTE.sandDark, 2.5)
  for (let i = 0; i < stage; i++) {
    g.moveTo(-58 + i * 10, -34 + i * 8)
      .lineTo(18 + i * 6, -40 + i * 8)
      .stroke({ width: 2, color: PALETTE.rockSide })
  }
  const chimneys = [
    house(g, {
      x: -70,
      y: 18,
      w: 46 + stage * 6,
      h: 32 + stage * 4,
      d: 30,
      r: 24,
      roof: [PALETTE.roof, PALETTE.roofSide],
      door: true,
    }),
  ]
  blockStack(g, 30, 22, 2 + stage)
  if (stage >= 3) blockStack(g, 100, 30, stage)
  if (stage === 4) flag(g, -90, -40, 60, PALETTE.goldDark)

  g.moveTo(-10, 0).lineTo(-2, -110).lineTo(6, 0).stroke({ width: 5, color: PALETTE.timber })
  g.moveTo(-2, -110).lineTo(70, -96).stroke({ width: 5, color: PALETTE.timber })
  g.moveTo(-10, 0).lineTo(-2, -110).lineTo(6, 0).stroke({ width: 1.5, color: PALETTE.ink })
  root.addChild(g)

  const hook = new Graphics()
  hook.moveTo(0, 0).lineTo(0, 46).stroke({ width: 2, color: PALETTE.ink })
  shape(hook, [-11, 46, 11, 46, 11, 62, -11, 62], PALETTE.stone, 2.5)
  hook.position.set(66, -96)
  root.addChild(hook)
  return { root, chimneys, moving: hook, motion: 'swing', height: 120 }
}

/**
 * Draws the mine: a timbered entrance in the mountain, a lantern, rails with an ore cart
 * and piles of gold that grow with its level.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing and its animated parts.
 */
function mine(stage: number): BuildingDrawing {
  const root = new Container()
  const g = new Graphics()
  groundShadow(g, 130)
  shape(g, [-56, 0, -50, -70, 0, -96, 50, -70, 56, 0], PALETTE.rockSide, 3)
  g.roundRect(-30, -66, 60, 66, 26).fill(PALETTE.hole).stroke({ width: 3, color: PALETTE.ink })
  g.rect(-36, -72, 10, 72).fill(PALETTE.timber).stroke({ width: 2.5, color: PALETTE.ink })
  g.rect(26, -72, 10, 72).fill(PALETTE.timber).stroke({ width: 2.5, color: PALETTE.ink })
  g.rect(-42, -80, 84, 12).fill(PALETTE.timber).stroke({ width: 2.5, color: PALETTE.ink })
  g.moveTo(-20, 0)
    .lineTo(-40, 40)
    .moveTo(20, 0)
    .lineTo(60, 40)
    .stroke({ width: 3, color: PALETTE.stoneDark })
  for (let i = 0; i < 4; i++) {
    const t = i / 4
    g.moveTo(-22 - 18 * t, 6 + 32 * t)
      .lineTo(22 + 36 * t, 6 + 32 * t)
      .stroke({ width: 3, color: PALETTE.timber })
  }
  g.moveTo(44, -72).lineTo(44, -86).stroke({ width: 2, color: PALETTE.ink })
  g.circle(44, -62, 7).fill(PALETTE.gold).stroke({ width: 2, color: PALETTE.ink })
  orePile(g, 90, 28, 40 + stage * 10)
  if (stage >= 2) orePile(g, -80, 30, 30 + stage * 8)
  const chimneys: Point[] = []
  if (stage >= 3) {
    chimneys.push(house(g, { x: -110, y: 10, w: 52, h: 34, d: 30, r: 22, door: true, windows: 1 }))
  }
  if (stage === 4) flag(g, 0, -96, 50, PALETTE.goldDark)
  root.addChild(g)

  const cart = new Graphics()
  shape(cart, [-18, -20, 18, -20, 13, 0, -13, 0], PALETTE.timber, 2.5)
  cart.ellipse(0, -21, 16, 6).fill(PALETTE.goldDark).stroke({ width: 2, color: PALETTE.ink })
  cart.circle(-9, 2, 5).fill(PALETTE.stoneDark).stroke({ width: 2, color: PALETTE.ink })
  cart.circle(9, 2, 5).fill(PALETTE.stoneDark).stroke({ width: 2, color: PALETTE.ink })
  cart.position.set(10, 28)
  root.addChild(cart)
  return { root, chimneys, moving: cart, motion: 'roll', height: 110 }
}

/**
 * Draws a production building at its stage, or its empty plot before it is built.
 *
 * @param building - Building to draw.
 * @param stage - Size stage, from 0 (plot) to 4.
 * @returns The drawing and its animated parts.
 */
export function buildingDrawing(building: Building, stage: number): BuildingDrawing {
  if (stage === 0) return { root: plot(), chimneys: [], height: 70 }
  if (building === 'sawmill') return sawmill(stage)
  if (building === 'quarry') return quarry(stage)
  return mine(stage)
}

/**
 * Draws the town hall: a stone hall, then a keep and towers as the village grows.
 *
 * @param stage - Size stage, from 1 to 4.
 * @returns The drawing, with the chimney tops and its height.
 */
export function townHall(stage: number): BuildingDrawing {
  const root = new Container()
  const g = new Graphics()
  groundShadow(g, 220)
  const chimneys: Point[] = []
  if (stage >= 3) tower(g, -112, -6, 30, 120, 22)
  if (stage >= 2) tower(g, 104, -10, 34, 100 + stage * 10, 26)
  chimneys.push(
    house(g, {
      w: 150,
      h: 70,
      d: 70,
      r: 46,
      wall: [PALETTE.stone, PALETTE.stoneSide],
      roof: [PALETTE.roof, PALETTE.roofSide],
      windows: 4,
      door: true,
    }),
  )
  g.rect(-14, -70, 28, 28).fill(PALETTE.gold).stroke({ width: 2.5, color: PALETTE.ink })
  g.circle(0, -56, 7).fill(PALETTE.banner)
  if (stage >= 4) tower(g, 0, -150, 34, 60, 0, true)
  for (const x of [-60, 60]) {
    g.rect(x - 2, -22, 4, 22).fill(PALETTE.timberDark)
  }
  root.addChild(g)
  return { root, chimneys, height: stage === 1 ? 150 : stage === 4 ? 235 : 205 }
}

/**
 * Draws a round tower with its crenels and its pointed roof.
 *
 * @param g - Graphics to draw into.
 * @param x - Center of the tower.
 * @param y - Ground level of the tower.
 * @param radius - Half the width of the tower.
 * @param height - Height of the walls.
 * @param roof - Height of the roof; 0 for a flat top with crenels only.
 * @param keep - True to draw it without its foot, on top of another building.
 */
function tower(
  g: Graphics,
  x: number,
  y: number,
  radius: number,
  height: number,
  roof: number,
  keep = false,
) {
  const top = y - height
  shape(g, [x - radius, y, x - radius, top, x + radius, top, x + radius, y], PALETTE.stone)
  g.rect(x + radius * 0.25, top, radius * 0.75, height).fill(PALETTE.stoneSide)
  g.rect(x - radius, top, radius * 2, height).stroke({ width: LINE, color: PALETTE.ink })
  if (!keep)
    g.ellipse(x, y, radius, radius * 0.3).stroke({ width: 2, color: PALETTE.ink, alpha: 0.4 })
  for (let i = 0; i < 4; i++) {
    const cx = x - radius + 4 + i * ((radius * 2 - 8) / 3)
    g.rect(cx - 5, top - 12, 10, 12)
      .fill(PALETTE.stone)
      .stroke({ width: 2, color: PALETTE.ink })
  }
  g.rect(x - 5, top + 20, 10, 16).fill(PALETTE.hole)
  if (roof > 0) {
    shape(
      g,
      [x - radius - 6, top - 6, x, top - 6 - roof * 2.4, x + radius + 6, top - 6],
      PALETTE.roof,
    )
    shape(
      g,
      [x, top - 6 - roof * 2.4, x + radius + 6, top - 6, x + radius * 0.4, top - 6],
      PALETTE.roofSide,
      2,
    )
    flag(g, x, top - 6 - roof * 2.4, 26)
  }
}

/**
 * Draws the defense surrounding the town hall, in two halves: the scene puts the back
 * half behind the hall and the front half before it.
 *
 * @param wall - Kind of wall.
 * @param half - Half to draw: the back or the front.
 * @returns The drawing, centered on the town hall.
 */
export function wallDrawing(wall: Wall, half: 'back' | 'front'): Graphics {
  const g = new Graphics()
  if (wall === 'none') return g
  const rx = 215
  const ry = 105
  const posts = 54
  for (let i = 0; i < posts; i++) {
    const angle = Math.PI + (i / posts) * Math.PI * 2
    const sin = Math.sin(angle)
    const isFront = sin > 0
    if ((half === 'front') !== isFront) continue
    const cos = Math.cos(angle)
    if (isFront && Math.abs(cos) < 0.18) continue
    const x = cos * rx
    const y = sin * ry
    if (wall === 'palisade') {
      shape(g, [x - 6, y, x - 6, y - 30, x, y - 38, x + 6, y - 30, x + 6, y], PALETTE.timber, 2)
    } else {
      shape(g, [x - 9, y, x - 9, y - 30, x + 9, y - 30, x + 9, y], PALETTE.stone, 2)
      if (i % 2 === 0)
        g.rect(x - 9, y - 40, 9, 10)
          .fill(PALETTE.stone)
          .stroke({ width: 2, color: PALETTE.ink })
    }
  }
  if (half === 'front' && wall === 'stone') {
    for (const side of [-1, 1]) {
      const x = side * rx * 0.18
      g.rect(x - 14, ry - 2 - 52, 28, 54)
        .fill(PALETTE.stoneSide)
        .stroke({ width: LINE, color: PALETTE.ink })
      shape(g, [x - 18, ry - 54, x, ry - 80, x + 18, ry - 54], PALETTE.roof)
    }
  }
  return g
}

/**
 * Draws the harbor: a wooden pier on piles and a storehouse on the shore.
 *
 * @returns The drawing, anchored where the pier leaves the shore.
 */
export function harbor(): BuildingDrawing {
  const root = new Container()
  const g = new Graphics()
  const chimneys = [
    house(g, {
      x: -90,
      y: -10,
      w: 64,
      h: 40,
      d: 40,
      r: 28,
      roof: [PALETTE.roof, PALETTE.roofSide],
      door: true,
    }),
  ]
  for (let i = 0; i < 5; i++) {
    g.rect(-8 + i * 26, 22 + i * 12, 6, 26)
      .fill(PALETTE.timberDark)
      .stroke({ width: 2, color: PALETTE.ink })
    g.rect(36 + i * 26, 6 + i * 12, 6, 26)
      .fill(PALETTE.timberDark)
      .stroke({ width: 2, color: PALETTE.ink })
  }
  shape(g, [-20, 10, 30, -8, 170, 56, 120, 74], PALETTE.timber)
  for (let i = 1; i < 7; i++) {
    const t = i / 7
    g.moveTo(-20 + 140 * t, 10 + 64 * t).lineTo(30 + 140 * t, -8 + 64 * t)
  }
  g.stroke({ width: 1.5, color: PALETTE.timberDark })
  for (const [x, y] of [
    [-34, 26],
    [-60, 22],
  ]) {
    g.rect(x - 10, y - 18, 20, 18)
      .fill(PALETTE.timber)
      .stroke({ width: 2, color: PALETTE.ink })
  }
  root.addChild(g)
  return { root, chimneys, height: 90 }
}

/**
 * Draws the mountain holding the mine: three rocky peaks, the highest one capped with
 * snow.
 *
 * @returns The drawing, anchored at the foot of the mountain.
 */
export function mountain(): Graphics {
  const g = new Graphics()
  g.ellipse(20, 0, 230, 40).fill({ color: PALETTE.shadow, alpha: 0.2 })
  for (const [x, w, h, color, side] of [
    [-110, 150, 170, PALETTE.rock, PALETTE.rockSide],
    [110, 160, 190, PALETTE.rock, PALETTE.rockSide],
    [0, 200, 270, PALETTE.rock, PALETTE.rockSide],
  ]) {
    shape(g, [x - w, 0, x, -h, x + w, 0], color)
    shape(g, [x, -h, x + w, 0, x + w * 0.25, 0], side, 2)
    g.moveTo(x - w * 0.4, -h * 0.35)
      .lineTo(x - w * 0.15, -h * 0.5)
      .stroke({ width: 2, color: PALETTE.ink, alpha: 0.4 })
  }
  shape(g, [-44, -210, 0, -270, 44, -210, 20, -196, 0, -214, -20, -198], PALETTE.snow, 2.5)
  return g
}

/**
 * Draws the cliff the quarry cuts: layered rock with flat ledges.
 *
 * @returns The drawing, anchored at the foot of the cliff.
 */
export function cliff(): Graphics {
  const g = new Graphics()
  g.ellipse(0, 0, 190, 30).fill({ color: PALETTE.shadow, alpha: 0.2 })
  shape(g, [-180, 0, -150, -90, -70, -120, 30, -112, 120, -130, 170, -60, 190, 0], PALETTE.rock)
  shape(g, [120, -130, 170, -60, 190, 0, 140, 0, 130, -70], PALETTE.rockSide, 2)
  for (const [x1, y1, x2, y2] of [
    [-150, -60, 100, -70],
    [-120, -30, 150, -36],
    [-100, -95, 40, -90],
  ]) {
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2, color: PALETTE.ink, alpha: 0.45 })
  }
  shape(
    g,
    [-150, -90, -70, -120, 30, -112, 120, -130, 100, -138, 20, -124, -70, -132, -140, -100],
    PALETTE.grass,
    2,
  )
  return g
}

/**
 * Draws a wheat field: a plot of land with its furrows.
 *
 * @param width - Width of the field.
 * @param height - Depth of the field.
 * @returns The drawing, anchored at its front left corner.
 */
export function field(width: number, height: number): Graphics {
  const g = new Graphics()
  const skew = height * 0.6
  shape(g, [0, 0, width, 0, width + skew, -height, skew, -height], PALETTE.field, 2.5)
  for (let i = 1; i < 6; i++) {
    const t = i / 6
    g.moveTo(skew * t, -height * t).lineTo(width + skew * t, -height * t)
  }
  g.stroke({ width: 2, color: PALETTE.fieldDark })
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
  g.ellipse(0, 0, 8, 3).fill({ color: PALETTE.shadow, alpha: 0.3 })
  shape(g, [-6, 0, 6, 0, 4, -16, -4, -16], tunic, 2)
  g.circle(0, -21, 5).fill(0xe7c39a).stroke({ width: 2, color: PALETTE.ink })
  const load = new Graphics()
  load.roundRect(3, -27, 12, 9, 3).fill(PALETTE.timber).stroke({ width: 2, color: PALETTE.ink })
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
  g.circle(0, 0, 15).fill(PALETTE.parchment).stroke({ width: 2.5, color: PALETTE.ink })
  if (resource === 'wood') {
    g.roundRect(-9, -4, 18, 8, 4).fill(PALETTE.timber).stroke({ width: 1.5, color: PALETTE.ink })
    g.circle(8, 0, 3).fill(PALETTE.field)
  } else if (resource === 'stone') {
    shape(g, [-8, 5, -6, -5, 4, -7, 9, 1, 4, 7], PALETTE.stone, 1.5)
  } else {
    g.circle(0, 0, 8).fill(PALETTE.gold).stroke({ width: 1.5, color: PALETTE.ink })
    g.circle(0, 0, 4).stroke({ width: 1.5, color: PALETTE.goldDark })
  }
  return g
}
