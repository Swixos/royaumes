import { describe, expect, it } from 'vitest'
import { BUILDINGS, type Levels, MAX_LEVEL } from '../contracts'
import {
  contains,
  distanceToPath,
  FIELDS,
  FOOTPRINTS,
  HARBOR,
  housesFor,
  islandOutline,
  lots,
  overlaps,
  PLACES,
  pathLength,
  pointAlong,
  project,
  ROAD_ENDS,
  roads,
  SQUARE_SIZE,
  seeded,
  smooth,
  stageOf,
  TOWN,
  TOWN_SIZE,
  trees,
  unproject,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  wallOf,
} from './layout'

/** Levels of a village just founded. */
const STARTING_LEVELS: Levels = {
  senate: 1,
  sawmill: 1,
  quarry: 1,
  mine: 0,
  warehouse: 1,
  wall: 0,
  shipyard: 0,
}

describe('scène du village', () => {
  it('fait grandir un bâtiment tous les trois niveaux, et couronne le niveau maximum', () => {
    expect([0, 1, 3, 4, 6, 7, 9, MAX_LEVEL].map(stageOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4])
  })

  it('dresse une palissade, puis un rempart de pierre à partir du niveau 5', () => {
    expect([0, 1, 4, 5, 10].map(wallOf)).toEqual(['none', 'palisade', 'palisade', 'stone', 'stone'])
  })

  it("projette la grille au sol sous l'angle 2:1, et retrouve la case sous un point", () => {
    expect(project({ u: 0, v: 0 })).toEqual(TOWN)
    expect(project({ u: 1, v: 0 })).toEqual({ x: TOWN.x + 32, y: TOWN.y + 16 })
    expect(project({ u: 0, v: 1 })).toEqual({ x: TOWN.x - 32, y: TOWN.y + 16 })
    expect(unproject(project({ u: 2.5, v: -3 }))).toEqual({ u: 2.5, v: -3 })
  })

  it("place l'île dans le monde, et chaque bâtiment sur l'île sans qu'ils se chevauchent", () => {
    const coast = islandOutline()
    for (const point of coast) {
      expect(point.x).toBeGreaterThan(0)
      expect(point.x).toBeLessThan(WORLD_WIDTH)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThan(WORLD_HEIGHT)
    }
    for (const place of [HARBOR, ...BUILDINGS.map((b) => PLACES[b])]) {
      expect(contains(place, coast)).toBe(true)
    }
    for (const a of BUILDINGS) {
      for (const b of BUILDINGS) {
        if (a !== b) expect(overlaps(FOOTPRINTS[a], FOOTPRINTS[b])).toBe(false)
      }
    }
    expect(contains({ x: 10, y: 10 }, coast)).toBe(false)
  })

  it("garde le sénat et l'entrepôt dans les murs, et la porte sur le rempart", () => {
    for (const building of ['senate', 'warehouse'] as const) {
      const { at, size } = FOOTPRINTS[building]
      expect(Math.abs(at.u) + size.u / 2).toBeLessThan(TOWN_SIZE)
      expect(Math.abs(at.v) + size.v / 2).toBeLessThan(TOWN_SIZE)
    }
    expect(FOOTPRINTS.wall.at).toEqual({ u: TOWN_SIZE, v: 0 })
  })

  it('bâtit les maisons dans les murs, de la place vers les remparts, puis le long des routes', () => {
    const all = lots()
    const inside = all.filter((lot) => lot.inside)
    expect(inside.length).toBeGreaterThan(10)
    expect(all.slice(0, inside.length).every((lot) => lot.inside)).toBe(true)
    const reach = inside.map((lot) => Math.hypot(lot.at.u, lot.at.v))
    expect(reach).toEqual([...reach].sort((a, b) => a - b))
    const square = { at: { u: 0, v: 0 }, size: { u: SQUARE_SIZE * 2, v: SQUARE_SIZE * 2 } }
    const ways = roads()
    for (const lot of all) {
      expect(overlaps(lot, square)).toBe(false)
      for (const building of BUILDINGS) expect(overlaps(lot, FOOTPRINTS[building])).toBe(false)
      for (const field of FIELDS) expect(overlaps(lot, field)).toBe(false)
      if (!lot.inside) {
        const at = project(lot.at)
        expect(Math.min(...ways.map((way) => distanceToPath(at, way)))).toBeGreaterThan(30)
      }
    }
  })

  it('ajoute une maison par niveau gagné, sans dépasser les lots', () => {
    expect(housesFor(STARTING_LEVELS)).toHaveLength(8)
    expect(housesFor({ ...STARTING_LEVELS, senate: 3 })).toHaveLength(10)
    const full = Object.fromEntries(BUILDINGS.map((b) => [b, MAX_LEVEL])) as Levels
    expect(housesFor(full)).toEqual(lots())
  })

  it('plante les mêmes arbres à chaque visite, hors des routes, de la ville et des champs', () => {
    const forest = trees()
    expect(forest).toEqual(trees())
    expect(forest.length).toBeGreaterThan(80)
    const ways = roads()
    for (const tree of forest) {
      expect(ways.every((road) => distanceToPath(tree, road) >= 22)).toBe(true)
      const tile = unproject(tree)
      expect(Math.max(Math.abs(tile.u), Math.abs(tile.v))).toBeGreaterThan(TOWN_SIZE)
      for (const field of FIELDS) {
        expect(overlaps({ at: tile, size: { u: 0, v: 0 } }, field)).toBe(false)
      }
    }
  })

  it('donne la même suite pour la même graine', () => {
    const a = seeded(42)
    const b = seeded(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('arrondit les chemins en passant par chacun de leurs points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    const curve = smooth(points, 4)
    expect(curve).toHaveLength(9)
    expect(curve[0]).toEqual(points[0])
    expect(curve[4]).toEqual(points[1])
    expect(curve[8]).toEqual(points[2])
  })

  it('mène chaque route de la place à son bâtiment par une porte, et y fait marcher les villageois', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 30, y: 100 },
    ]
    expect(pathLength(path)).toBe(110)
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0 })
    expect(pointAlong(path, 25 / 110)).toEqual({ x: 15, y: 20 })
    expect(pointAlong(path, 2)).toEqual({ x: 30, y: 100 })
    const ways = roads()
    expect(ways).toHaveLength(ROAD_ENDS.length + 1)
    for (const [i, way] of ways.entries()) {
      expect(way[0]).toEqual(TOWN)
      const gate = unproject(way[1])
      expect(Math.max(Math.abs(gate.u), Math.abs(gate.v))).toBeCloseTo(TOWN_SIZE)
      const end = way[way.length - 1]
      const target = i < ROAD_ENDS.length ? PLACES[ROAD_ENDS[i]] : HARBOR
      expect(Math.hypot(end.x - target.x, end.y - target.y)).toBeLessThan(60)
    }
  })
})
