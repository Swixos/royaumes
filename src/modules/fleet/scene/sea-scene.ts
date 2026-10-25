/**
 * Sea map rendered with PixiJS: the islands of the players and of the pirates, drawn by
 * kind, and the fleets sailing their lanes in real time, with their wake and their time of
 * arrival. The scene only shows the state it is given: the islands are picked through the
 * buttons laid over the canvas by the screen.
 *
 * @packageDocumentation
 */
import { Container, Graphics, Text } from 'pixi.js'
import {
  bird,
  cloud,
  DISPLAY,
  flag,
  house,
  makePlaque,
  PALETTE,
  shape,
  tree,
} from '@/ui/pixi/drawing'
import type { LiveScene } from '@/ui/pixi/scene-host'
import { createStage, driftWaves, scatterWaves } from '@/ui/pixi/stage'
import { hash } from '../contracts'
import {
  along,
  clock,
  type IslandKind,
  islandOutline,
  type Lane,
  MAP_H,
  MAP_W,
  type Point,
  progressOf,
} from './sea-layout'

/** Island shown on the sea map. */
export interface SeaIsland {
  /** Identifier drawing its shape. */
  id: string
  /** Kind of island, which sets its look. */
  kind: IslandKind
  /** Name written under the island. */
  name: string
  /** Center of the island, in world units. */
  at: Point
  /** True if the player targets it. */
  selected: boolean
}

/** Fleet shown on the sea map. */
export interface SeaFleet {
  /** Raid identifier. */
  id: string
  /** Lane of the fleet, from its port to its target. */
  lane: Lane
  /** True if the fleet threatens the player. */
  enemy: boolean
  /** Number of ships. */
  ships: number
  /** True while the fleet sails; false while it is equipped in port. */
  sailing: boolean
  /** Time the fleet sailed, in milliseconds. */
  sailedAt: number
  /** Time the fleet arrives, in milliseconds. */
  arrivesAt: number
}

/** State of the sea shown by the scene. */
export interface SeaSceneState {
  islands: SeaIsland[]
  fleets: SeaFleet[]
}

/** Colors of the sea map, on top of the shared palette. */
const SEA = {
  grid: 0x3a8fb0,
  enemy: 0xa32a1a,
  lane: 0xf3e3bb,
  pirateRock: 0x4a433d,
  pirateTop: 0x6b6259,
  palm: 0x4f7a2e,
  sailOwn: 0xf3e3bb,
  sailEnemy: 0x2a170a,
  whale: 0x3e5d70,
} as const

/** Mean radius of each kind of island. */
const RADIUS: Record<IslandKind, number> = { home: 40, village: 36, pirates: 44 }

/**
 * Flattens points into the list of coordinates Pixi expects, scaled and moved.
 *
 * @param points - Points around (0, 0).
 * @param factor - Scale factor.
 * @param dy - Vertical shift.
 * @returns The flat list of coordinates.
 */
function flat(points: Point[], factor = 1, dy = 0) {
  return points.flatMap((p) => [p.x * factor, p.y * factor + dy])
}

/**
 * Draws a palm tree, its trunk leaning to one side.
 *
 * @param g - Graphics to draw into.
 * @param x - Foot of the trunk.
 * @param y - Foot of the trunk.
 * @param lean - Lean of the trunk, negative to the left.
 */
function palm(g: Graphics, x: number, y: number, lean: number) {
  g.moveTo(x, y)
    .quadraticCurveTo(x + lean * 0.3, y - 10, x + lean, y - 18)
    .stroke({ width: 3, color: PALETTE.trunk, cap: 'round' })
  for (const angle of [-2.6, -1.9, -1.2, -0.5]) {
    const tipX = x + lean + Math.cos(angle) * 11
    const tipY = y - 18 + Math.sin(angle) * 7 + 4
    g.moveTo(x + lean, y - 18)
      .quadraticCurveTo((x + lean + tipX) / 2, y - 24, tipX, tipY)
      .stroke({ width: 3.5, color: SEA.palm, cap: 'round' })
  }
}

/**
 * Draws the decorations of an island: houses and a keep for the home of the player,
 * houses for the other players, rocks, palm trees and a skull flag for the pirates.
 *
 * @param kind - Kind of island.
 * @param id - Identifier of the island, which places its decorations.
 * @returns The decorations, around the center of the island.
 */
function decorations(kind: IslandKind, id: string): Container {
  const g = new Graphics()
  const seed = hash(id)
  const side = seed % 2 === 0 ? 1 : -1
  if (kind === 'pirates') {
    shape(g, [-22, 6, -12, -14, 2, -18, 14, -6, 18, 8], SEA.pirateRock, 2)
    shape(g, [-12, -14, 2, -18, 14, -6, 2, -6], SEA.pirateTop, 0)
    palm(g, -20 * side, 10, 6 * side)
    palm(g, 22 * side, 6, -5 * side)
    g.rect(8 * side - 6, 12, 12, 8)
      .fill(PALETTE.goldDark)
      .stroke({ width: 2, color: PALETTE.ink })
    g.moveTo(-2, -16).lineTo(-2, -42).stroke({ width: 2.5, color: PALETTE.ink })
    shape(g, [-2, -42, 18, -38, -2, -30], PALETTE.ink, 2)
    g.circle(6, -37, 2.5).fill(PALETTE.snow)
    return g
  }
  const scale = kind === 'home' ? 0.42 : 0.38
  const t1 = tree(0.34, seed % 3 === 0)
  t1.position.set(-24 * side, 4)
  const t2 = tree(0.3, seed % 3 !== 0)
  t2.position.set(26 * side, 10)
  const houses = new Graphics()
  house(houses, { x: -34 * side, w: 30, h: 22, d: 22, r: 16, door: true })
  house(houses, { x: 30 * side, y: 6, w: 28, h: 20, d: 20, r: 14, door: true })
  if (kind === 'home') {
    house(houses, {
      w: 44,
      h: 40,
      d: 30,
      r: 26,
      wall: [PALETTE.stone, PALETTE.stoneSide],
      windows: 2,
      door: true,
    })
    flag(houses, 0, -66, 30, PALETTE.goldDark)
  } else {
    house(houses, { y: -4, w: 34, h: 26, d: 24, r: 18, windows: 1, door: true })
  }
  houses.scale.set(scale)
  houses.position.set(0, 6)
  const root = new Container()
  root.addChild(t1, houses, t2)
  return root
}

/**
 * Draws a trireme seen from the side, oars out, its prow to the right.
 *
 * @param enemy - True for a fleet threatening the player.
 * @returns The ship and its oars, which the scene sweeps.
 */
function trireme(enemy: boolean): { root: Container; oars: Graphics } {
  const root = new Container()
  const oars = new Graphics()
  for (let i = 0; i < 5; i++) {
    oars.moveTo(-14 + i * 7, 2).lineTo(-17 + i * 7, 10)
  }
  oars.stroke({ width: 2, color: PALETTE.timberDark, cap: 'round' })
  const hull = new Graphics()
  const color = enemy ? SEA.enemy : PALETTE.timber
  shape(hull, [-22, -4, 22, -4, 28, -10, 24, 4, -18, 4], color, 2)
  hull.moveTo(0, -4).lineTo(0, -32).stroke({ width: 2.5, color: PALETTE.ink })
  shape(hull, [-12, -30, 11, -30, 10, -12, -11, -12], enemy ? SEA.sailEnemy : SEA.sailOwn, 2)
  hull.rect(-11, -24, 21, 4).fill(enemy ? SEA.enemy : PALETTE.goldDark)
  root.addChild(oars, hull)
  return { root, oars }
}

/** Fleet drawn on the map, with its lane, its ships and its label. */
interface ShownFleet {
  data: SeaFleet
  lane: Graphics
  trail: Graphics
  target: Graphics
  ships: Array<{ root: Container; oars: Graphics; offset: number }>
  convoy: Container
  label: Container
  labelText: Text
  wakeClock: number
}

/**
 * Creates the sea map in an element of the page. The world keeps its proportions and
 * covers the element.
 *
 * @param host - Element receiving the canvas; its size is the size of the scene.
 * @param initial - State of the sea to show first.
 * @returns The live scene.
 */
export async function createSeaScene(
  host: HTMLElement,
  initial: SeaSceneState,
): Promise<LiveScene<SeaSceneState>> {
  const { app, world, calm, pause, destroy } = await createStage(host, MAP_W, MAP_H)
  let state = initial
  let time = 0
  let seed = 3
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  const sea = new Container()
  const shores = new Container()
  const lanes = new Container()
  const isles = new Container()
  const fleets = new Container()
  const effects = new Container()
  const labels = new Container()
  const sky = new Container()
  world.addChild(sea, shores, lanes, isles, effects, fleets, labels, sky)

  const grid = new Graphics()
  for (let x = 125; x < MAP_W; x += 125) grid.rect(x, 0, 1.5, MAP_H)
  for (let y = 125; y < MAP_H; y += 125) grid.rect(0, y, MAP_W, 1.5)
  grid.fill({ color: SEA.grid, alpha: 0.8 })
  sea.addChild(grid)
  const waves = scatterWaves(sea, 40, MAP_W, MAP_H, random)

  const compass = new Graphics()
  compass.circle(0, 0, 34).fill(PALETTE.shallow).stroke({ width: 3, color: PALETTE.ink })
  shape(compass, [0, -30, 7, 0, 0, 30, -7, 0], PALETTE.parchment, 2)
  shape(compass, [0, -30, 7, 0, -7, 0], SEA.enemy, 2)
  shape(compass, [-30, 0, 0, -5, 30, 0, 0, 5], PALETTE.parchment, 1.5)
  const north = new Text({
    text: 'N',
    resolution: 2,
    style: { fontFamily: DISPLAY, fontWeight: '900', fontSize: 18, fill: PALETTE.parchment },
  })
  north.anchor.set(0.5)
  north.position.set(0, -46)
  const rose = new Container()
  rose.addChild(compass, north)
  rose.position.set(70, 560)
  sea.addChild(rose)

  const effectsList: Array<{
    view: Container
    age: number
    life: number
    step: (share: number, dt: number) => void
  }> = []

  /**
   * Adds a short-lived element to the effects layer.
   *
   * @param view - Element to show.
   * @param life - Duration of its life, in seconds.
   * @param step - Motion of the element along its life.
   */
  function spawn(view: Container, life: number, step: (share: number, dt: number) => void) {
    effects.addChild(view)
    effectsList.push({ view, age: 0, life, step })
  }

  let islandKey = ''
  let foams: Array<{ ring: Graphics; phase: number }> = []
  let rings: Array<{ ring: Graphics; island: SeaIsland }> = []

  /**
   * Draws the islands again when the list of islands changed; otherwise only updates the
   * ring of the selected island.
   *
   * @param islands - Islands to show.
   */
  function showIslands(islands: SeaIsland[]) {
    const key = islands
      .map((i) => `${i.kind}:${i.id}:${i.name}:${Math.round(i.at.x)}:${Math.round(i.at.y)}`)
      .join('|')
    if (key !== islandKey) {
      islandKey = key
      for (const layer of [shores, isles, labels]) {
        for (const child of layer.removeChildren()) child.destroy({ children: true })
      }
      foams = []
      rings = []
      for (const island of islands) {
        const radius = RADIUS[island.kind]
        const outline = islandOutline(island.id, radius)
        const shore = new Graphics()
        shore.poly(flat(outline, 1.42, 4)).fill(PALETTE.shallow)
        shore.position.set(island.at.x, island.at.y)
        shores.addChild(shore)
        const foam = new Graphics()
        foam.poly(flat(outline, 1.14, 2)).fill(PALETTE.foam)
        foam.position.set(island.at.x, island.at.y)
        shores.addChild(foam)
        foams.push({ ring: foam, phase: (hash(island.id) % 100) / 16 })

        const land = new Graphics()
        const pirate = island.kind === 'pirates'
        land
          .poly(flat(outline))
          .fill(pirate ? SEA.pirateRock : PALETTE.sand)
          .stroke({
            width: 2.5,
            color: pirate ? PALETTE.ink : PALETTE.sandDark,
          })
        land.poly(flat(outline, 0.74, -4)).fill(pirate ? SEA.pirateTop : PALETTE.grass)
        if (!pirate) land.stroke({ width: 2, color: PALETTE.grassDark })
        const deco = decorations(island.kind, island.id)
        deco.position.set(0, 2)
        const ground = new Container()
        ground.addChild(land, deco)
        ground.position.set(island.at.x, island.at.y)
        isles.addChild(ground)

        const ring = new Graphics()
        ring.position.set(island.at.x, island.at.y)
        isles.addChild(ring)
        rings.push({ ring, island })

        const plaque = makePlaque(island.name, false)
        if (island.kind === 'home') plaque.paint(PALETTE.gold)
        if (island.kind === 'pirates') plaque.paint(PALETTE.parchment)
        plaque.plaque.scale.set(0.62)
        plaque.plaque.position.set(island.at.x, island.at.y + radius + 18)
        labels.addChild(plaque.plaque)
      }
    }
    for (const entry of rings) {
      const island = islands.find((i) => i.kind === entry.island.kind && i.id === entry.island.id)
      if (island) entry.island = island
    }
  }

  const shown = new Map<string, ShownFleet>()

  /**
   * Adds the fleets that set sail and removes those that arrived.
   *
   * @param list - Fleets to show.
   */
  function showFleets(list: SeaFleet[]) {
    const ids = new Set(list.map((fleet) => fleet.id))
    for (const [id, fleet] of shown) {
      if (ids.has(id)) continue
      for (const view of [fleet.lane, fleet.trail, fleet.target, fleet.convoy, fleet.label]) {
        view.destroy({ children: true })
      }
      shown.delete(id)
    }
    for (const data of list) {
      const existing = shown.get(data.id)
      if (existing) {
        existing.data = data
        continue
      }
      const color = data.enemy ? SEA.enemy : SEA.lane
      const lane = new Graphics()
      for (let i = 0; i <= 40; i++) {
        const point = along(data.lane, i / 40)
        lane.circle(point.x, point.y, 2)
      }
      lane.fill({ color, alpha: 0.85 })
      const trail = new Graphics()
      const target = new Graphics()
      target.circle(0, 0, 54).stroke({ width: 3, color })
      target.position.set(data.lane.to.x, data.lane.to.y)
      lanes.addChild(lane, trail, target)

      const convoy = new Container()
      const ships = Array.from({ length: Math.min(3, data.ships) }, (_, i) => {
        const { root, oars } = trireme(data.enemy)
        root.position.set(-i * 34, i % 2 === 0 ? i * 8 : -i * 8)
        root.scale.set(i === 0 ? 1.4 : 1.15)
        convoy.addChild(root)
        return { root, oars, offset: i * 0.8 }
      })
      ships.reverse()
      fleets.addChild(convoy)

      const label = new Container()
      const labelText = new Text({
        text: '',
        resolution: 2,
        style: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 15, fill: PALETTE.parchment },
      })
      labelText.anchor.set(0.5)
      const back = new Graphics()
      back
        .roundRect(-62, -14, 124, 28, 14)
        .fill(data.enemy ? SEA.enemy : PALETTE.ink)
        .stroke({
          width: 2,
          color: PALETTE.goldDark,
        })
      label.addChild(back, labelText)
      fleets.addChild(label)
      shown.set(data.id, {
        data,
        lane,
        trail,
        target,
        ships,
        convoy,
        label,
        labelText,
        wakeClock: 0,
      })
    }
  }

  showIslands(state.islands)
  showFleets(state.fleets)

  const clouds = Array.from({ length: 4 }, () => {
    const view = cloud(70 + random() * 60)
    view.alpha = 0.9
    const shadow = cloud(70 + random() * 30)
    shadow.tint = PALETTE.ink
    shadow.alpha = 0.1
    view.position.set(random() * MAP_W, 40 + random() * (MAP_H - 80))
    sky.addChild(shadow, view)
    return { view, shadow, speed: 5 + random() * 6 }
  })
  const gulls = Array.from({ length: 3 }, (_, i) => {
    const view = bird()
    view.scale.set(0.8)
    view.position.set(random() * MAP_W, 80 + i * 150)
    sky.addChild(view)
    return { view, offset: i * 1.3 }
  })

  const whale = new Graphics()
  whale.ellipse(0, 0, 26, 9).fill(SEA.whale).stroke({ width: 2, color: PALETTE.ink })
  shape(whale, [22, -2, 36, -10, 32, 2, 36, 10], SEA.whale, 2)
  whale.circle(-14, -2, 2).fill(PALETTE.ink)
  whale.visible = false
  effects.addChild(whale)
  let whaleClock = 6

  /**
   * Shows a whale surfacing at a free spot of the sea, blowing its spout.
   */
  function surface() {
    const at = { x: 120 + random() * (MAP_W - 240), y: 80 + random() * (MAP_H - 160) }
    const clear = state.islands.every(
      (island) => Math.hypot(island.at.x - at.x, island.at.y - at.y) > 110,
    )
    if (!clear) return
    whale.position.set(at.x, at.y)
    whale.visible = true
    whale.alpha = 0
    spawn(new Container(), 4, (share) => {
      whale.alpha = share < 0.2 ? share / 0.2 : share > 0.8 ? (1 - share) / 0.2 : 1
      whale.x = at.x - share * 30
      if (share >= 1) whale.visible = false
    })
    for (let i = 0; i < 10; i++) {
      const drop = new Graphics()
      drop
        .circle(0, 0, 3.5)
        .fill(PALETTE.foam)
        .stroke({ width: 1.5, color: PALETTE.ink, alpha: 0.4 })
      const vx = (random() - 0.5) * 50
      const delay = 0.15 + i * 0.03
      drop.position.set(at.x - 12, at.y - 8)
      drop.alpha = 0
      spawn(drop, 1.6, (share) => {
        const t = Math.max(0, share * 1.6 - delay)
        drop.alpha = t > 0 ? Math.max(0, 1 - t / 1.2) : 0
        drop.x = at.x - 12 + vx * t
        drop.y = at.y - 8 - 70 * t + 60 * t * t
      })
    }
  }

  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000)
    time += dt
    const now = Date.now()

    for (let i = effectsList.length - 1; i >= 0; i--) {
      const effect = effectsList[i]
      effect.age += dt
      const share = Math.min(1, effect.age / effect.life)
      effect.step(share, dt)
      if (share >= 1) {
        effect.view.destroy({ children: true })
        effectsList.splice(i, 1)
      }
    }

    for (const { ring, island } of rings) {
      ring.clear()
      if (island.kind === 'home') {
        ring.circle(0, 0, RADIUS.home + 22).stroke({ width: 4, color: PALETTE.gold })
      }
      if (island.selected) {
        const radius = RADIUS[island.kind] + 26
        const spin = calm ? 0 : time * 0.6
        for (let k = 0; k < 12; k++) {
          const start = spin + (k / 12) * Math.PI * 2
          ring.moveTo(Math.cos(start) * radius, Math.sin(start) * radius)
          ring.arc(0, 0, radius, start, start + 0.32)
        }
        ring.stroke({ width: 5, color: PALETTE.parchment, cap: 'round' })
      }
    }

    for (const fleet of shown.values()) {
      const { data } = fleet
      const t = data.sailing ? progressOf(data.sailedAt, data.arrivesAt, now) : 0
      const head = along(data.lane, t)
      fleet.trail.clear()
      if (t > 0) {
        fleet.trail.moveTo(data.lane.from.x, data.lane.from.y)
        for (let i = 1; i <= 30; i++) {
          const point = along(data.lane, (t * i) / 30)
          fleet.trail.lineTo(point.x, point.y)
        }
        fleet.trail.stroke({ width: 4, color: data.enemy ? SEA.enemy : SEA.lane, cap: 'round' })
      }
      fleet.target.scale.set(1 + (calm ? 0 : 0.06 * Math.sin(time * 3)))
      fleet.target.alpha = 0.6 + 0.4 * Math.sin(time * 3)

      const left = Math.cos(head.heading) < 0
      fleet.convoy.position.set(head.x, head.y + (calm ? 0 : Math.sin(time * 2) * 1.5))
      const tilt = left ? head.heading - Math.PI : head.heading
      fleet.convoy.rotation = Math.max(
        -0.35,
        Math.min(0.35, Math.atan2(Math.sin(tilt), Math.cos(tilt))),
      )
      fleet.convoy.scale.x = left ? -1 : 1
      for (const ship of fleet.ships) {
        ship.oars.rotation = calm || !data.sailing ? 0 : Math.sin(time * 5 + ship.offset) * 0.12
      }
      fleet.label.position.set(head.x, head.y - 62)
      const text = data.sailing
        ? `${data.ships} navire${data.ships > 1 ? 's' : ''} · ${clock(data.arrivesAt - now)}`
        : 'Armement'
      if (fleet.labelText.text !== text) fleet.labelText.text = text

      fleet.wakeClock -= dt
      if (!calm && data.sailing && t < 1 && fleet.wakeClock <= 0) {
        fleet.wakeClock = 0.12
        const back = along(data.lane, Math.max(0, t - 0.01))
        const foam = new Graphics()
        foam.circle(0, 0, 4).fill(PALETTE.foam)
        foam.position.set(
          back.x - Math.cos(head.heading) * 26,
          back.y - Math.sin(head.heading) * 26,
        )
        spawn(foam, 1.4, (share) => {
          foam.scale.set(1 + share * 1.8)
          foam.alpha = 0.8 * (1 - share)
        })
      }
    }

    if (calm) return
    driftWaves(waves, MAP_W, time, dt)
    for (const { ring, phase } of foams) ring.scale.set(1 + 0.025 * Math.sin(time * 1.6 + phase))
    for (const { view, shadow, speed } of clouds) {
      view.x += speed * dt
      if (view.x > MAP_W + 120) view.x = -120
      shadow.position.set(view.x + 30, view.y + 60)
    }
    for (const { view, offset } of gulls) {
      view.x += 40 * dt
      view.y += Math.sin(time + offset) * 6 * dt
      if (view.x > MAP_W + 30) view.x = -30
      view.scale.y = 0.5 + 0.3 * Math.abs(Math.sin(time * 6 + offset))
    }
    whaleClock -= dt
    if (whaleClock <= 0) {
      whaleClock = 14 + random() * 10
      surface()
    }
  })

  return {
    update(next) {
      state = next
      showIslands(next.islands)
      showFleets(next.fleets)
    },
    pause,
    destroy,
  }
}
