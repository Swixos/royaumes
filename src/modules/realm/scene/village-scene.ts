/**
 * Village scene rendered with PixiJS: the island seen at one isometric angle, the walled
 * town with its square and streets, its houses multiplying as the village grows, the
 * buildings at their level with their constructions under way, the fields and roads of
 * the country around, and the life of the village (smoke, villagers, waves, birds). The
 * scene only shows the state it is given; the screen keeps the game logic and the
 * accessible controls.
 *
 * @packageDocumentation
 */
import { Container, Graphics, Text } from 'pixi.js'
import { bird, cloud, DISPLAY, easeOutBack, makePlaque, PALETTE } from '@/ui/pixi/drawing'
import type { LiveScene } from '@/ui/pixi/scene-host'
import { createStage, driftWaves, scatterWaves } from '@/ui/pixi/stage'
import { scaleRange } from '@/ui/pixi/view'
import {
  BUILDINGS,
  type Building,
  type Construction,
  type Levels,
  MAX_LEVEL,
  PRODUCTION,
  type Producer,
  type Stock,
} from '../contracts'
import {
  type BuildingDrawing,
  buildingDrawing,
  cliff,
  fieldDrawing,
  garden,
  harbor,
  iso,
  isoTree,
  mooredShip,
  mountain,
  resourceToken,
  scaffold,
  stall,
  TONES,
  tint,
  townHouse,
  villager,
  wallPiece,
  wallTower,
  well,
} from './draw'
import {
  lots as allLots,
  CLIFF,
  contains,
  FIELDS,
  FOOTPRINTS,
  HARBOR,
  housesFor,
  islandOutline,
  type Lot,
  MOUNTAIN,
  PLACES,
  type Point,
  pathLength,
  pointAlong,
  project,
  roads,
  SQUARE_SIZE,
  STREET_WIDTH,
  seeded,
  stageOf,
  type Tile,
  TOWN,
  TOWN_SIZE,
  totalLevel,
  trees,
  type Wall,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  wallOf,
} from './layout'

/** State of the village shown by the scene. */
export interface VillageSceneState {
  /** Name of the village, written on the banner above the senate. */
  name: string
  /** Level of each building. */
  levels: Levels
  /** Production of each resource per minute. */
  rates: Stock
  /** Constructions under way or waiting, in order of completion. */
  queue: Construction[]
  /** Building highlighted for the player, or null. */
  selected: Building | null
}

/** Handlers the scene calls back when the player acts on it. */
export interface VillageSceneHandlers {
  /**
   * Called when the player picks a building in the scene.
   *
   * @param building - Picked building.
   */
  onSelect(building: Building): void
}

/** French name of each building, written on its plaque. */
const NAMES: Record<Building, string> = {
  senate: 'Sénat',
  sawmill: 'Scierie',
  quarry: 'Carrière',
  mine: 'Mine',
  warehouse: 'Entrepôt',
  wall: 'Rempart',
  shipyard: 'Chantier naval',
}

/** Zoom, as a multiple of the scale filling the screen, from which every plaque shows. */
const LABEL_ZOOM = 1.45

/** Size of the plaques on screen, whatever the zoom, as a share of their drawn size. */
const LABEL_SIZE = 0.72

/** Mooring of the trireme, alongside the pier. */
const BOAT: Point = { x: HARBOR.x + iso(1.9, 0.95).x, y: HARBOR.y + iso(1.9, 0.95).y }

/** Colors of the villagers' tunics. */
const TUNICS = [0x8c2a1c, 0x1f5f92, 0x4a7428, 0xb9761a, 0x6a4a7e, 0x7a3a1e]

/** Short-lived element of the scene: smoke, dust, token or text. */
interface Particle {
  view: Container
  age: number
  life: number
  /**
   * Moves the element along its life.
   *
   * @param share - Share of its life already spent, from 0 to 1.
   * @param dt - Time spent since the last frame, in seconds.
   */
  step(share: number, dt: number): void
}

/** A building shown in the scene, with its plaque and animated parts. */
interface Site {
  building: Building
  place: Point
  holder: Container
  drawing: BuildingDrawing
  level: number
  look: string
  plaque: Container
  levelText: Text
  paint: (color: number) => void
  ring: Graphics
  scaffold: Graphics | null
  busy: boolean
  timer: Container
  timerText: Text
  pop: number
  smokeClock: number
  tokenClock: number
}

/** A house of the town, rising on its lot. */
interface Home {
  root: Graphics
  chimney: Point | null
  pop: number
  smokeClock: number
}

/**
 * Turns a list of points into the flat list of coordinates Pixi expects, scaled around the
 * center of the island.
 *
 * @param points - Points to convert.
 * @param factor - Scale factor around the center.
 * @returns The flat list of coordinates.
 */
function flat(points: Point[], factor = 1) {
  return points.flatMap((p) => [800 + (p.x - 800) * factor, 470 + (p.y - 470) * factor])
}

/**
 * Flat list of the corners of a rectangle of ground, projected on screen.
 *
 * @param at - Center of the rectangle, in tiles.
 * @param size - Size of the rectangle, in tiles.
 * @returns The flat list of coordinates.
 */
function quad(at: Tile, size: Tile) {
  const { u, v } = at
  const du = size.u / 2
  const dv = size.v / 2
  return [
    project({ u: u - du, v: v - dv }),
    project({ u: u + du, v: v - dv }),
    project({ u: u + du, v: v + dv }),
    project({ u: u - du, v: v + dv }),
  ].flatMap((p) => [p.x, p.y])
}

/**
 * Look of a building: its size stage, or the kind of wall for the gate. The drawing is
 * rebuilt when it changes.
 *
 * @param building - Building shown.
 * @param level - Level of the building.
 * @returns A key naming its look.
 */
function lookOf(building: Building, level: number) {
  return building === 'wall' ? wallOf(level) : String(stageOf(level))
}

/**
 * Creates the village scene in an element of the page. The world keeps its proportions
 * and scales to the size of the element.
 *
 * @param host - Element receiving the canvas; its size is the size of the scene.
 * @param initial - State of the village to show first.
 * @param handlers - Handlers called back when the player acts on the scene.
 * @returns The live scene.
 */
export async function createVillageScene(
  host: HTMLElement,
  initial: VillageSceneState,
  handlers: VillageSceneHandlers,
): Promise<LiveScene<VillageSceneState>> {
  const { app, world, camera, calm, pause, destroy } = await createStage(
    host,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    TOWN,
  )
  const random = seeded(11)
  let state = initial
  let selected = initial.selected
  let hovered: Building | null = null
  let zoomed = false
  let labelScale = LABEL_SIZE
  let time = 0

  const sea = new Container()
  const ground = new Container()
  const objects = new Container()
  objects.sortableChildren = true
  const effects = new Container()
  const sky = new Container()
  const labels = new Container()
  world.addChild(sea, ground, objects, effects, labels, sky)

  const waves = scatterWaves(sea, 46, WORLD_WIDTH, WORLD_HEIGHT, random)

  const coast = islandOutline()
  const land = new Graphics()
  land.poly(flat(coast, 1.09)).fill(PALETTE.shallow)
  land.poly(flat(coast, 1.035)).fill(PALETTE.foam)
  land.poly(flat(coast, 1.0)).fill(PALETTE.sand)
  land.poly(flat(coast, 0.93)).fill(PALETTE.grass).stroke({ width: 2, color: PALETTE.sandDark })
  const meadow = coast.map((p) => ({ x: 800 + (p.x - 800) * 0.9, y: 470 + (p.y - 470) * 0.9 }))
  for (let i = 0; i < 260; i++) {
    const x = 180 + random() * 1240
    const y = 170 + random() * 580
    if (!contains({ x, y }, meadow)) continue
    const r = 14 + random() * 46
    land.ellipse(x, y, r, r / 2).fill({
      color: random() > 0.5 ? PALETTE.grassLight : PALETTE.grassDark,
      alpha: 0.22,
    })
  }
  for (let i = 0; i < 160; i++) {
    const x = 180 + random() * 1240
    const y = 170 + random() * 580
    if (!contains({ x, y }, meadow)) continue
    land
      .moveTo(x - 3, y)
      .lineTo(x - 1.5, y - 4)
      .moveTo(x + 1, y)
      .lineTo(x + 2.5, y - 5)
  }
  land.stroke({ width: 1.2, color: PALETTE.grassDark, alpha: 0.7 })
  for (let i = 0; i < 40; i++) {
    const angle = random() * Math.PI * 2
    const p = { x: 800 + Math.cos(angle) * 640, y: 470 + Math.sin(angle) * 290 }
    const r = 3 + random() * 5
    land.ellipse(p.x, p.y, r, r * 0.6).fill(tint(PALETTE.stone, 0.9 + random() * 0.2))
  }
  ground.addChild(land)

  for (const field of FIELDS) {
    const view = fieldDrawing(field.size, field.crop)
    view.position.copyFrom(project(field.at))
    ground.addChild(view)
  }

  const paths = roads()
  const road = new Graphics()
  for (const path of paths) {
    road
      .poly(flat(path), false)
      .stroke({ width: 22, color: PALETTE.roadEdge, join: 'round', cap: 'round' })
  }
  for (const path of paths) {
    road
      .poly(flat(path), false)
      .stroke({ width: 15, color: PALETTE.road, join: 'round', cap: 'round' })
  }
  ground.addChild(road)

  const town = new Graphics()
  const side = TOWN_SIZE * 2 + 0.3
  town.poly(quad({ u: 0, v: 0 }, { u: side, v: side })).fill(TONES.yard)
  town
    .poly(quad({ u: 0, v: 0 }, { u: side + 0.2, v: side + 0.2 }))
    .stroke({ width: 7, color: TONES.bank, alpha: 0.8, join: 'round' })
  const street = TOWN_SIZE * 2 + 0.6
  const lanes = [
    quad({ u: 0, v: 0 }, { u: street, v: STREET_WIDTH * 2 }),
    quad({ u: 0, v: 0 }, { u: STREET_WIDTH * 2, v: street }),
    quad({ u: 0, v: 0 }, { u: SQUARE_SIZE * 2, v: SQUARE_SIZE * 2 }),
  ]
  for (const lane of lanes) town.poly(lane).fill(TONES.cobble)
  for (let k = -TOWN_SIZE; k <= TOWN_SIZE; k += 0.3) {
    const across = Math.abs(k) <= SQUARE_SIZE ? SQUARE_SIZE : STREET_WIDTH
    for (const [a, b] of [
      [project({ u: k, v: -across }), project({ u: k, v: across })],
      [project({ u: -across, v: k }), project({ u: across, v: k })],
    ]) {
      town.moveTo(a.x, a.y).lineTo(b.x, b.y)
    }
  }
  town.stroke({ width: 1, color: TONES.cobbleLine, alpha: 0.45 })
  town.poly(lanes[2]).stroke({ width: 2, color: TONES.cobbleLine })
  ground.addChild(town)

  const gardens = new Container()
  ground.addChild(gardens)
  const rings = new Container()
  ground.addChild(rings)

  /**
   * Adds an element to the depth-sorted layer, at its ground anchor.
   *
   * @param view - Element to add.
   * @param at - Ground anchor of the element.
   * @param depth - Depth used for sorting; the anchor height by default.
   */
  function place(view: Container, at: Point, depth = at.y) {
    view.position.set(at.x, at.y)
    view.zIndex = depth
    objects.addChild(view)
  }

  place(mountain(), MOUNTAIN)
  place(cliff(), CLIFF)

  const forest = trees().map((spot) => {
    const view = isoTree(spot.size, spot.pine)
    place(view, spot)
    return view
  })

  const port = harbor()
  place(port.root, HARBOR)
  const boat = mooredShip()
  place(boat, BOAT)

  place(well(), project({ u: -0.95, v: -0.95 }))
  for (const [u, v, color] of [
    [0.95, 0.95, TONES.cloths[0]],
    [-0.95, 0.95, TONES.cloths[1]],
    [0.95, -0.95, TONES.cloths[2]],
  ]) {
    place(stall(color), project({ u, v }))
  }

  let wall: Wall = wallOf(state.levels.wall)
  let wallParts: Container[] = []

  /**
   * Builds the town wall: its pieces between the corners and the gates, its corner towers
   * and the posts of its small gates. The main gate is the wall building itself.
   *
   * @param kind - Kind of wall.
   */
  function raiseWall(kind: Wall) {
    for (const part of wallParts) part.destroy()
    wallParts = []
    if (kind === 'none') return
    const s = TOWN_SIZE
    const cuts = [
      [-s, -3],
      [-3, -2],
      [-2, -1],
      [-1, -0.6],
      [0.6, 1],
      [1, 2],
      [2, 3],
      [3, s],
    ]
    const sides: Array<(t: number) => Tile> = [
      (t) => ({ u: s, v: t }),
      (t) => ({ u: t, v: s }),
      (t) => ({ u: -s, v: t }),
      (t) => ({ u: t, v: -s }),
    ]
    sides.forEach((along, index) => {
      for (const [t0, t1] of cuts) {
        const from = along(t0)
        const to = along(t1)
        const mid = { u: (from.u + to.u) / 2, v: (from.v + to.v) / 2 }
        const piece = wallPiece(
          kind,
          { u: from.u - mid.u, v: from.v - mid.v },
          { u: to.u - mid.u, v: to.v - mid.v },
        )
        place(piece, project(mid))
        wallParts.push(piece)
      }
      if (index === 0) return
      for (const t of [-0.6, 0.6]) {
        const post = wallTower(kind, true)
        place(post, project(along(t)), project(along(t)).y + 1)
        wallParts.push(post)
      }
    })
    for (const [u, v] of [
      [-s, -s],
      [s, -s],
      [-s, s],
      [s, s],
    ]) {
      const corner = wallTower(kind, false)
      place(corner, project({ u, v }), project({ u, v }).y + 1)
      wallParts.push(corner)
    }
  }
  raiseWall(wall)

  const homes: Home[] = []
  let banner: Container | null = null

  /**
   * Adds the houses the village has earned, each rising on its lot.
   *
   * @param levels - Level of each building.
   * @param grow - True to make the new houses rise, false to show them at once.
   */
  function settle(levels: Levels, grow: boolean) {
    const lots: Lot[] = housesFor(levels)
    for (const child of gardens.removeChildren()) child.destroy()
    for (const lot of allLots().slice(lots.length)) {
      if (!lot.inside) continue
      const patch = garden(lot)
      patch.position.copyFrom(project(lot.at))
      gardens.addChild(patch)
    }
    while (homes.length > lots.length) homes.pop()?.root.destroy()
    for (const lot of lots.slice(homes.length)) {
      const { root, chimney } = townHouse(lot)
      const at = project(lot.at)
      place(root, at)
      homes.push({
        root,
        chimney: chimney && { x: at.x + chimney.x, y: at.y + chimney.y },
        pop: grow && !calm ? 0 : 1,
        smokeClock: 1 + random() * 4,
      })
    }
  }
  settle(state.levels, false)

  const sites = BUILDINGS.map((building): Site => {
    const at = PLACES[building]
    const holder = new Container()
    holder.eventMode = 'static'
    holder.cursor = 'pointer'
    const level = state.levels[building]
    const drawing = buildingDrawing(building, stageOf(level), FOOTPRINTS[building].size, wall)
    holder.addChild(drawing.root)
    place(holder, at)
    const { size } = FOOTPRINTS[building]
    const ring = new Graphics()
    const outline = [
      iso(-size.u / 2 - 0.2, -size.v / 2 - 0.2),
      iso(size.u / 2 + 0.2, -size.v / 2 - 0.2),
      iso(size.u / 2 + 0.2, size.v / 2 + 0.2),
      iso(-size.u / 2 - 0.2, size.v / 2 + 0.2),
    ]
    ring
      .poly(outline.flatMap((p) => [p.x, p.y]))
      .fill({ color: PALETTE.gold, alpha: 0.18 })
      .stroke({ width: 3, color: PALETTE.gold, join: 'round' })
    ring.position.set(at.x, at.y)
    ring.visible = false
    rings.addChild(ring)

    const { plaque, levelText, paint } = makePlaque(NAMES[building], true)
    levelText.text = String(level)
    plaque.eventMode = 'static'
    plaque.cursor = 'pointer'
    labels.addChild(plaque)
    const timerText = new Text({
      text: '',
      resolution: 2,
      style: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 13, fill: PALETTE.parchment },
    })
    timerText.anchor.set(0.5)
    const timer = new Container()
    timer.addChild(new Graphics(), timerText)
    timer.visible = false
    labels.addChild(timer)
    const site: Site = {
      building,
      place: at,
      holder,
      drawing,
      level,
      look: lookOf(building, level),
      plaque,
      levelText,
      paint,
      ring,
      scaffold: null,
      busy: false,
      timer,
      timerText,
      pop: 1,
      smokeClock: random() * 2,
      tokenClock: random() * 3,
    }
    for (const target of [holder, plaque]) {
      target.on('pointertap', () => {
        if (!camera.dragged()) handlers.onSelect(building)
      })
      target.on('pointerover', () => {
        hovered = building
        paintSite(site)
      })
      target.on('pointerout', () => {
        if (hovered === building) hovered = null
        paintSite(site)
      })
    }
    placePlaque(site)
    return site
  })

  for (const site of sites) paintSite(site)
  const senate = sites.find((site) => site.building === 'senate') as Site

  /**
   * Writes the name of the village on the gold banner above the senate.
   *
   * @param name - Name of the village.
   */
  function hangBanner(name: string) {
    banner?.destroy({ children: true })
    const made = makePlaque(name, false)
    made.paint(PALETTE.gold)
    banner = made.plaque
    labels.addChild(banner)
    placePlaque(senate)
  }
  hangBanner(state.name)

  /**
   * Puts the plaque of a building above its drawing; the senate's goes under its banner.
   *
   * @param site - Building shown.
   */
  function placePlaque(site: Site) {
    const top = site.place.y - site.drawing.height
    const y = site.building === 'senate' ? top + 10 * labelScale : top - 24 * labelScale
    site.plaque.scale.set(labelScale)
    site.timer.scale.set(labelScale)
    site.plaque.position.set(site.place.x, y)
    site.timer.position.set(site.place.x, y + 32 * labelScale)
    if (site.building === 'senate' && banner) {
      banner.scale.set(labelScale)
      banner.position.set(site.place.x, top - 26 * labelScale)
    }
  }

  /**
   * Repaints the plaque and the ground ring of a building after a hover, a selection, a
   * zoom or a construction. The plaque only shows when it tells something: the building
   * is pointed at, picked, being built, or the player zoomed in to read the village.
   *
   * @param site - Building shown.
   */
  function paintSite(site: Site) {
    const active = selected === site.building || hovered === site.building
    site.paint(active ? PALETTE.gold : PALETTE.parchment)
    site.plaque.visible = zoomed || active || site.busy
    site.ring.visible = selected === site.building
    site.holder.scale.set(hovered === site.building ? 1.03 : 1)
  }

  camera.onChange((view) => {
    const { cover } = scaleRange(
      { width: app.screen.width, height: app.screen.height },
      { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    )
    const next = view.scale >= cover * LABEL_ZOOM
    labelScale = LABEL_SIZE / view.scale
    for (const site of sites) placePlaque(site)
    if (next === zoomed) return
    zoomed = next
    for (const site of sites) paintSite(site)
  })

  /**
   * Shows or hides the scaffolding and the countdown of a building, from the queue of
   * constructions: the first one is under way, the next one waits for it.
   *
   * @param site - Building shown.
   * @param now - Current time in milliseconds.
   */
  function showWorks(site: Site, now: number) {
    const index = state.queue.findIndex(
      (item) => item.building === site.building && item.completesAt > now,
    )
    const busy = index >= 0
    if (busy && !site.scaffold) {
      site.scaffold = scaffold(FOOTPRINTS[site.building].size, site.drawing.height)
      site.holder.addChild(site.scaffold)
    } else if (!busy && site.scaffold) {
      site.scaffold.destroy()
      site.scaffold = null
    }
    if (busy !== site.busy) {
      site.busy = busy
      site.timer.visible = busy
      paintSite(site)
    }
    if (!busy) return
    const first = index === 0 || state.queue[0].completesAt <= now
    const left = Math.max(0, Math.ceil((state.queue[index].completesAt - now) / 1000))
    const text = first
      ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : 'En attente'
    if (site.timerText.text === text) return
    site.timerText.text = text
    const back = site.timer.children[0] as Graphics
    const width = site.timerText.width + 18
    back.clear()
    back
      .roundRect(-width / 2, -10, width, 20, 10)
      .fill(PALETTE.ink)
      .stroke({ width: 1.5, color: PALETTE.goldDark })
  }

  const villagers: Array<{
    root: Container
    load: Graphics
    path: Point[]
    length: number
    progress: number
    speed: number
  }> = []

  /**
   * Adjusts the number of villagers to the size of the village.
   *
   * @param levels - Level of each building.
   */
  function populate(levels: Levels) {
    const wanted = Math.min(18, 4 + totalLevel(levels))
    while (villagers.length < wanted) {
      const index = villagers.length
      const path = paths[index % paths.length]
      const { root, load } = villager(TUNICS[index % TUNICS.length])
      objects.addChild(root)
      villagers.push({
        root,
        load,
        path,
        length: pathLength(path),
        progress: random() * 2,
        speed: 14 + random() * 10,
      })
    }
  }
  populate(state.levels)

  const clouds = Array.from({ length: 4 }, (_, i) => {
    const view = cloud(110 + random() * 70)
    view.alpha = 0.88
    view.position.set(
      random() * WORLD_WIDTH,
      i % 2 === 0 ? 50 + random() * 50 : WORLD_HEIGHT - 40 - random() * 40,
    )
    sky.addChild(view)
    return { view, speed: 5 + random() * 6 }
  })

  const birds = Array.from({ length: 3 }, (_, i) => {
    const view = bird()
    view.scale.set(0.6)
    view.position.set(200 + i * 50, 140 + i * 20)
    sky.addChild(view)
    return { view, offset: i * 0.7 }
  })

  const particles: Particle[] = []

  /**
   * Adds a short-lived element to the effects layer.
   *
   * @param view - Element to show.
   * @param life - Duration of its life, in seconds.
   * @param step - Motion of the element along its life.
   */
  function spawn(view: Container, life: number, step: Particle['step']) {
    effects.addChild(view)
    particles.push({ view, age: 0, life, step })
  }

  /**
   * Lets a puff of smoke out of a chimney.
   *
   * @param at - Top of the chimney, in world coordinates.
   */
  function puff(at: Point) {
    const view = new Graphics()
    view.circle(0, 0, 4).fill(PALETTE.smoke)
    view.position.set(at.x, at.y)
    const drift = 5 + random() * 6
    spawn(view, 3, (share, dt) => {
      view.y -= 16 * dt
      view.x += drift * dt
      view.scale.set(0.6 + share * 1.8)
      view.alpha = 0.7 * (1 - share)
    })
  }

  /**
   * Celebrates a building that went up a level: dust at its foot, sparks, and its new
   * level rising above it.
   *
   * @param site - Building that went up.
   */
  function celebrate(site: Site) {
    site.pop = 0
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const dust = new Graphics()
      dust.circle(0, 0, 7).fill({ color: PALETTE.sand, alpha: 0.9 })
      dust.position.set(site.place.x, site.place.y)
      spawn(dust, 0.9, (share) => {
        dust.x = site.place.x + Math.cos(angle) * 70 * share
        dust.y = site.place.y + Math.sin(angle) * 35 * share
        dust.scale.set(1 + share)
        dust.alpha = 1 - share
      })
    }
    for (let i = 0; i < 8; i++) {
      const spark = new Graphics()
      spark.star(0, 0, 4, 7, 3).fill(PALETTE.gold).stroke({ width: 1.2, color: PALETTE.ink })
      const vx = (random() - 0.5) * 200
      const vy = -140 - random() * 120
      spark.position.set(site.place.x, site.place.y - site.drawing.height / 2)
      spawn(spark, 1.2, (share, dt) => {
        spark.x += vx * dt
        spark.y += (vy + 340 * share) * dt
        spark.rotation += dt * 6
        spark.alpha = 1 - share * share
      })
    }
    const text = new Text({
      text: site.level >= MAX_LEVEL ? 'Niveau max !' : `Niveau ${site.level} !`,
      resolution: 2,
      style: {
        fontFamily: DISPLAY,
        fontWeight: '900',
        fontSize: 26,
        fill: PALETTE.gold,
        stroke: { color: PALETTE.ink, width: 5, join: 'round' },
      },
    })
    text.anchor.set(0.5)
    const from = site.place.y - site.drawing.height - 50
    text.position.set(site.place.x, from)
    spawn(text, 1.8, (share) => {
      text.y = from - share * 40
      text.scale.set(share < 0.15 ? share / 0.15 : 1)
      text.alpha = share > 0.7 ? (1 - share) / 0.3 : 1
    })
  }

  /**
   * Shows a token of the resource a building produces, rising above it.
   *
   * @param site - Producing building.
   */
  function produce(site: Site) {
    const token = resourceToken(PRODUCTION[site.building as Producer].produces)
    const from = { x: site.place.x + 30, y: site.place.y - site.drawing.height * 0.7 }
    token.position.set(from.x, from.y)
    spawn(token, 1.6, (share) => {
      token.y = from.y - share * 45
      token.alpha = share > 0.6 ? (1 - share) / 0.4 : 1
      token.scale.set(share < 0.12 ? share / 0.12 : 1)
    })
  }

  /**
   * Rebuilds a building whose look changed.
   *
   * @param site - Building shown.
   */
  function rebuild(site: Site) {
    site.holder.removeChildren().forEach((child) => {
      child.destroy({ children: true })
    })
    site.drawing = buildingDrawing(
      site.building,
      stageOf(site.level),
      FOOTPRINTS[site.building].size,
      wall,
    )
    site.holder.addChild(site.drawing.root)
    site.scaffold = null
    placePlaque(site)
    if (site === senate) hangBanner(state.name)
  }

  app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000)
    time += dt

    const now = Date.now()
    for (const site of sites) {
      showWorks(site, now)
      if (site.pop < 1) {
        site.pop = Math.min(1, site.pop + dt / 0.7)
        site.drawing.root.scale.set(0.4 + 0.6 * easeOutBack(site.pop))
      }
      site.ring.alpha = 0.6 + 0.4 * Math.sin(time * 4)
    }
    for (const home of homes) {
      if (home.pop >= 1) continue
      home.pop = Math.min(1, home.pop + dt / 0.8)
      home.root.scale.set(0.3 + 0.7 * easeOutBack(home.pop))
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i]
      particle.age += dt
      const share = Math.min(1, particle.age / particle.life)
      particle.step(share, dt)
      if (share >= 1) {
        particle.view.destroy({ children: true })
        particles.splice(i, 1)
      }
    }
    if (calm) return

    driftWaves(waves, WORLD_WIDTH, time, dt)
    forest.forEach((view, i) => {
      view.skew.x = Math.sin(time * 1.2 + i * 0.7) * 0.02
    })
    boat.y = BOAT.y + Math.sin(time * 1.6) * 1.5
    boat.rotation = Math.sin(time * 1.1) * 0.012

    for (const site of sites) {
      const { moving, motion, track } = site.drawing
      if (moving && motion === 'spin') moving.rotation += dt * (3 + site.level * 0.6)
      if (moving && motion === 'swing') moving.rotation = Math.sin(time * 1.4) * 0.18
      if (moving && motion === 'roll' && track) {
        const s = (Math.sin(time * 0.7) + 1) / 2
        moving.position.set(
          track[0].x + (track[1].x - track[0].x) * s,
          track[0].y + (track[1].y - track[0].y) * s,
        )
      }
      if (site.level === 0) continue
      site.smokeClock -= dt
      if (site.smokeClock <= 0) {
        site.smokeClock = 1.1
        for (const chimney of site.drawing.chimneys) {
          puff({ x: site.place.x + chimney.x, y: site.place.y + chimney.y })
        }
      }
      if (!(site.building in PRODUCTION)) continue
      const rate = state.rates[PRODUCTION[site.building as Producer].produces]
      site.tokenClock -= dt
      if (site.tokenClock <= 0 && rate > 0) {
        site.tokenClock = Math.max(2.5, 60 / rate)
        produce(site)
      }
    }
    for (const home of homes) {
      if (!home.chimney) continue
      home.smokeClock -= dt
      if (home.smokeClock > 0) continue
      home.smokeClock = 1.6 + random() * 2.5
      puff(home.chimney)
    }
    if (Math.floor(time / 1.3) !== Math.floor((time - dt) / 1.3)) {
      for (const chimney of port.chimneys) {
        puff({ x: HARBOR.x + chimney.x, y: HARBOR.y + chimney.y })
      }
    }

    for (const walker of villagers) {
      walker.progress = (walker.progress + (walker.speed * dt) / walker.length) % 2
      const outward = walker.progress < 1
      const share = outward ? walker.progress : 2 - walker.progress
      const at = pointAlong(walker.path, share)
      walker.root.position.set(at.x, at.y - Math.abs(Math.sin(time * 9 + walker.speed)) * 1.5)
      walker.root.zIndex = at.y
      const ahead = pointAlong(walker.path, Math.min(1, share + 0.01))
      walker.root.scale.x = ahead.x >= at.x === outward ? 1 : -1
      walker.load.visible = !outward
    }

    for (const { view, speed } of clouds) {
      view.x += speed * dt
      if (view.x > WORLD_WIDTH + 200) view.x = -200
    }
    for (const { view, offset } of birds) {
      view.x += 50 * dt
      view.y += Math.sin(time + offset) * 6 * dt
      if (view.x > WORLD_WIDTH + 40) view.x = -40
      view.scale.y = 0.6 * (0.6 + 0.4 * Math.abs(Math.sin(time * 7 + offset)))
    }
  })

  return {
    update(next) {
      const renamed = next.name !== state.name
      state = next
      const nextWall = wallOf(next.levels.wall)
      if (nextWall !== wall) {
        wall = nextWall
        raiseWall(nextWall)
      }
      for (const site of sites) {
        const level = next.levels[site.building]
        if (level === site.level) continue
        const grew = level > site.level
        const look = lookOf(site.building, level)
        site.level = level
        site.levelText.text = String(level)
        if (look !== site.look) {
          site.look = look
          rebuild(site)
        }
        if (grew && !calm) celebrate(site)
      }
      if (renamed) hangBanner(next.name)
      settle(next.levels, true)
      populate(next.levels)
      if (next.selected !== selected) {
        selected = next.selected
        for (const site of sites) paintSite(site)
      }
    },
    pause,
    zoom: camera.zoomBy,
    recenter: camera.reset,
    destroy,
  }
}
