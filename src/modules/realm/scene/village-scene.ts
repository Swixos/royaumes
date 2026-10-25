/**
 * Village scene rendered with PixiJS: the island, the senate, the buildings at their
 * level, their constructions under way, and the life of the village (smoke, villagers, waves, birds). The scene
 * only shows the state it is given; the screen keeps the game logic and the accessible
 * controls.
 *
 * @packageDocumentation
 */
import { Container, Graphics, Text } from 'pixi.js'
import {
  bird,
  cloud,
  DISPLAY,
  easeOutBack,
  makePlaque,
  PALETTE,
  ship,
  tree,
} from '@/ui/pixi/drawing'
import type { LiveScene } from '@/ui/pixi/scene-host'
import { createStage, driftWaves, scatterWaves } from '@/ui/pixi/stage'
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
  field,
  harbor,
  mountain,
  resourceToken,
  scaffold,
  villager,
  wallDrawing,
} from './draw'
import {
  CLIFF,
  contains,
  HARBOR,
  islandOutline,
  MOUNTAIN,
  PLACES,
  type Point,
  pathLength,
  pointAlong,
  roads,
  seeded,
  stageOf,
  TOWN_HALL,
  totalLevel,
  trees,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  wallOf,
} from './layout'

/** State of the village shown by the scene. */
export interface VillageSceneState {
  /** Name of the village, written on the town hall banner. */
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

/** Scale of the buildings in the world, larger than their drawing so they lead the scene. */
const GROWTH = 1.3

/** Mooring of the trireme, west of the pier. */
const BOAT: Point = { x: 700, y: 835 }

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
  plaque: Container
  levelText: Text
  paint: (color: number) => void
  ring: Graphics
  scaffold: Graphics | null
  timer: Container
  timerText: Text
  pop: number
  smokeClock: number
  tokenClock: number
}

/**
 * Turns a list of points into the flat list of coordinates Pixi expects, scaled around a
 * center.
 *
 * @param points - Points to convert.
 * @param factor - Scale factor around the center.
 * @param center - Center of the scaling.
 * @returns The flat list of coordinates.
 */
function flat(points: Point[], factor = 1, center: Point = { x: 800, y: 470 }) {
  return points.flatMap((p) => [
    center.x + (p.x - center.x) * factor,
    center.y + (p.y - center.y) * factor,
  ])
}

/**
 * Creates the village scene in an element of the page. The world keeps its proportions
 * and scales to the width of the element.
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
  const { app, world, calm, pause, destroy } = await createStage(host, WORLD_WIDTH, WORLD_HEIGHT)
  const random = seeded(11)
  let state = initial
  let selected = initial.selected
  let hovered: Building | null = null
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
  land.poly(flat(coast, 1.0)).fill(PALETTE.sand).stroke({ width: 3, color: PALETTE.sandDark })
  land.poly(flat(coast, 0.93)).fill(PALETTE.grass).stroke({ width: 3, color: PALETTE.grassDark })
  for (let i = 0; i < 140; i++) {
    const x = 220 + random() * 1160
    const y = 230 + random() * 480
    if (!contains({ x, y }, coast)) continue
    land
      .moveTo(x - 4, y)
      .lineTo(x - 2, y - 6)
      .moveTo(x + 2, y)
      .lineTo(x + 4, y - 7)
  }
  land.stroke({ width: 2, color: PALETTE.grassDark })
  ground.addChild(land)

  for (const [x, y, w, h] of [
    [560, 610, 120, 60],
    [1110, 650, 120, 50],
  ]) {
    const plot = field(w, h)
    plot.position.set(x, y)
    ground.addChild(plot)
  }

  const paths = roads()
  const road = new Graphics()
  for (const path of paths) {
    road
      .poly(flat(path), false)
      .stroke({ width: 30, color: PALETTE.roadEdge, join: 'round', cap: 'round' })
  }
  for (const path of paths) {
    road
      .poly(flat(path), false)
      .stroke({ width: 22, color: PALETTE.road, join: 'round', cap: 'round' })
  }
  road
    .ellipse(TOWN_HALL.x, TOWN_HALL.y + 30, 150, 60)
    .fill(PALETTE.road)
    .stroke({ width: 4, color: PALETTE.roadEdge })
  ground.addChild(road)

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

  const peak = mountain()
  place(peak, MOUNTAIN, MOUNTAIN.y - 60)
  const rocks = cliff()
  place(rocks, CLIFF, CLIFF.y - 40)

  const forest = trees().map((spot, i) => {
    const view = tree(spot.size, i % 3 === 0)
    place(view, spot)
    return view
  })

  const port = harbor()
  place(port.root, HARBOR)
  const boat = ship()
  boat.scale.set(0.8)
  place(boat, BOAT)

  const wallBack = new Container()
  const wallFront = new Container()
  place(wallBack, TOWN_HALL, TOWN_HALL.y - 110)
  place(wallFront, TOWN_HALL, TOWN_HALL.y + 140)
  let wall = wallOf(state.levels.wall)
  wallBack.addChild(wallDrawing(wall, 'back'))
  wallFront.addChild(wallDrawing(wall, 'front'))

  const sites = BUILDINGS.map((building): Site => {
    const at = PLACES[building]
    const holder = new Container()
    holder.eventMode = 'static'
    holder.cursor = 'pointer'
    holder.scale.set(GROWTH)
    place(holder, at, building === 'wall' ? TOWN_HALL.y + 150 : at.y)
    const level = state.levels[building]
    const drawing = buildingDrawing(building, stageOf(level))
    holder.addChild(drawing.root)
    const ring = new Graphics()
    ring.ellipse(0, 0, 110 * GROWTH, 38 * GROWTH).stroke({ width: 5, color: PALETTE.gold })
    ring.position.set(at.x + 10, at.y + 6)
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
      style: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 15, fill: PALETTE.parchment },
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
      plaque,
      levelText,
      paint,
      ring,
      scaffold: null,
      timer,
      timerText,
      pop: 1,
      smokeClock: random() * 2,
      tokenClock: random() * 3,
    }
    for (const target of [holder, plaque]) {
      target.on('pointertap', () => handlers.onSelect(building))
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

  const senate = sites.find((site) => site.building === 'senate') as Site
  let banner = new Container()

  /**
   * Writes the name of the village on the gold banner above the senate.
   *
   * @param name - Name of the village.
   */
  function hangBanner(name: string) {
    banner.destroy({ children: true })
    const made = makePlaque(name, false)
    made.paint(PALETTE.gold)
    banner = made.plaque
    banner.position.set(senate.plaque.x, senate.plaque.y - 42)
    labels.addChild(banner)
  }
  hangBanner(state.name)

  /**
   * Puts the plaque of a building above its drawing.
   *
   * @param site - Building shown.
   */
  function placePlaque(site: Site) {
    const y =
      site.building === 'wall'
        ? site.place.y + 36
        : site.place.y - site.drawing.height * GROWTH - 26
    site.plaque.position.set(site.place.x, y)
    site.timer.position.set(site.place.x, y + 30)
  }

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
      site.scaffold = scaffold(150, site.drawing.height)
      site.holder.addChild(site.scaffold)
    } else if (!busy && site.scaffold) {
      site.scaffold.destroy()
      site.scaffold = null
    }
    site.timer.visible = busy
    if (!busy) return
    const first = index === 0 || state.queue[0].completesAt <= now
    const left = Math.max(0, Math.ceil((state.queue[index].completesAt - now) / 1000))
    const text = first
      ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : 'En attente'
    if (site.timerText.text === text) return
    site.timerText.text = text
    const back = site.timer.children[0] as Graphics
    const width = site.timerText.width + 22
    back.clear()
    back
      .roundRect(-width / 2, -12, width, 24, 12)
      .fill(PALETTE.ink)
      .stroke({ width: 2, color: PALETTE.goldDark })
  }

  /**
   * Repaints the plaque and the ground ring of a building after a hover or a selection.
   *
   * @param site - Building shown.
   */
  function paintSite(site: Site) {
    const active = selected === site.building || hovered === site.building
    site.paint(active ? PALETTE.gold : PALETTE.parchment)
    site.ring.visible = selected === site.building
    site.holder.scale.set(hovered === site.building ? GROWTH * 1.04 : GROWTH)
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
    const wanted = Math.min(14, 3 + totalLevel(levels))
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
        speed: 28 + random() * 18,
      })
    }
  }
  populate(state.levels)

  const clouds = Array.from({ length: 5 }, (_, i) => {
    const view = cloud(120 + random() * 90)
    view.alpha = 0.92
    view.position.set(
      random() * WORLD_WIDTH,
      i % 2 === 0 ? 40 + random() * 70 : WORLD_HEIGHT - 50 - random() * 40,
    )
    sky.addChild(view)
    return { view, speed: 6 + random() * 8 }
  })

  const birds = Array.from({ length: 3 }, (_, i) => {
    const view = bird()
    view.position.set(200 + i * 60, 160 + i * 24)
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
    view.circle(0, 0, 7).fill(PALETTE.smoke).stroke({ width: 2, color: PALETTE.ink, alpha: 0.25 })
    view.position.set(at.x, at.y)
    const drift = 6 + random() * 8
    spawn(view, 3.2, (share, dt) => {
      view.y -= 22 * dt
      view.x += drift * dt
      view.scale.set(0.6 + share * 1.6)
      view.alpha = 0.85 * (1 - share)
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
      dust.circle(0, 0, 12).fill(PALETTE.sand).stroke({ width: 2, color: PALETTE.sandDark })
      dust.position.set(site.place.x, site.place.y)
      spawn(dust, 0.9, (share) => {
        dust.x = site.place.x + Math.cos(angle) * 120 * share
        dust.y = site.place.y + Math.sin(angle) * 40 * share
        dust.scale.set(1 + share)
        dust.alpha = 1 - share
      })
    }
    for (let i = 0; i < 8; i++) {
      const spark = new Graphics()
      spark.star(0, 0, 4, 10, 4).fill(PALETTE.gold).stroke({ width: 2, color: PALETTE.ink })
      const vx = (random() - 0.5) * 260
      const vy = -180 - random() * 160
      spark.position.set(site.place.x, site.place.y - (site.drawing.height * GROWTH) / 2)
      spawn(spark, 1.2, (share, dt) => {
        spark.x += vx * dt
        spark.y += (vy + 420 * share) * dt
        spark.rotation += dt * 6
        spark.alpha = 1 - share * share
      })
    }
    const text = new Text({
      text: site.level >= MAX_LEVEL ? 'Niveau max !' : `Niveau ${site.level} !`,
      resolution: 2,
      style: {
        fontFamily: DISPLAY,
        fontWeight: '900',
        fontSize: 34,
        fill: PALETTE.gold,
        stroke: { color: PALETTE.ink, width: 6, join: 'round' },
      },
    })
    text.anchor.set(0.5)
    text.position.set(site.place.x, site.place.y - site.drawing.height * GROWTH - 70)
    spawn(text, 1.8, (share) => {
      text.y = site.place.y - site.drawing.height * GROWTH - 70 - share * 50
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
    const from = {
      x: site.place.x + 50 * GROWTH,
      y: site.place.y - site.drawing.height * GROWTH + 10,
    }
    token.position.set(from.x, from.y)
    spawn(token, 1.6, (share) => {
      token.y = from.y - share * 60
      token.alpha = share > 0.6 ? (1 - share) / 0.4 : 1
      token.scale.set(share < 0.12 ? share / 0.12 : 1)
    })
  }

  /**
   * Rebuilds a building whose stage changed.
   *
   * @param site - Building shown.
   */
  function rebuild(site: Site) {
    site.holder.removeChildren().forEach((child) => {
      child.destroy({ children: true })
    })
    site.drawing = buildingDrawing(site.building, stageOf(site.level))
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
        const s = 0.4 + 0.6 * easeOutBack(site.pop)
        site.drawing.root.scale.set(s)
      }
      site.ring.alpha = 0.6 + 0.4 * Math.sin(time * 4)
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
      view.skew.x = Math.sin(time * 1.2 + i * 0.7) * 0.025
    })
    boat.y = BOAT.y + Math.sin(time * 1.6) * 3
    boat.rotation = Math.sin(time * 1.1) * 0.025

    for (const site of sites) {
      const { moving, motion } = site.drawing
      if (moving && motion === 'spin') moving.rotation += dt * (3 + site.level * 0.6)
      if (moving && motion === 'swing') moving.rotation = Math.sin(time * 1.4) * 0.22
      if (moving && motion === 'roll') {
        const s = (Math.sin(time * 0.7) + 1) / 2
        moving.position.set(-6 + s * 34, 10 + s * 26)
      }
      if (site.level === 0) continue
      site.smokeClock -= dt
      if (site.smokeClock <= 0) {
        site.smokeClock = 0.9
        for (const chimney of site.drawing.chimneys) {
          puff({ x: site.place.x + chimney.x * GROWTH, y: site.place.y + chimney.y * GROWTH })
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
    if (Math.floor(time / 1.1) !== Math.floor((time - dt) / 1.1)) {
      for (const chimney of port.chimneys) {
        puff({ x: HARBOR.x + chimney.x, y: HARBOR.y + chimney.y })
      }
    }

    for (const walker of villagers) {
      walker.progress = (walker.progress + (walker.speed * dt) / walker.length) % 2
      const outward = walker.progress < 1
      const share = outward ? walker.progress : 2 - walker.progress
      const at = pointAlong(walker.path, share)
      walker.root.position.set(at.x, at.y - Math.abs(Math.sin(time * 9 + walker.speed)) * 2)
      walker.root.zIndex = at.y
      walker.root.scale.x =
        walker.path[walker.path.length - 1].x > walker.path[0].x === outward ? 1 : -1
      walker.load.visible = !outward
    }

    for (const { view, speed } of clouds) {
      view.x += speed * dt
      if (view.x > WORLD_WIDTH + 200) view.x = -200
    }
    for (const { view, offset } of birds) {
      view.x += 60 * dt
      view.y += Math.sin(time + offset) * 8 * dt
      if (view.x > WORLD_WIDTH + 40) view.x = -40
      view.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(time * 7 + offset))
    }
  })

  return {
    update(next) {
      const renamed = next.name !== state.name
      state = next
      for (const site of sites) {
        const level = next.levels[site.building]
        if (level === site.level) continue
        const grew = level > site.level
        const restage = stageOf(level) !== stageOf(site.level)
        site.level = level
        site.levelText.text = String(level)
        if (restage) rebuild(site)
        if (grew && !calm) celebrate(site)
      }
      if (renamed) hangBanner(next.name)
      const nextWall = wallOf(next.levels.wall)
      if (nextWall !== wall) {
        wall = nextWall
        for (const [holder, half] of [
          [wallBack, 'back'],
          [wallFront, 'front'],
        ] as const) {
          for (const child of holder.removeChildren()) child.destroy()
          holder.addChild(wallDrawing(nextWall, half))
        }
      }
      populate(next.levels)
      if (next.selected !== selected) {
        selected = next.selected
        for (const site of sites) paintSite(site)
      }
    },
    pause,
    destroy,
  }
}
