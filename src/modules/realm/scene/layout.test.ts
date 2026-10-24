import { describe, expect, it } from 'vitest'
import { BUILDINGS, MAX_LEVEL } from '../contracts'
import {
  contains,
  distanceToPath,
  HARBOR,
  islandOutline,
  PLACES,
  pathLength,
  pointAlong,
  roads,
  seeded,
  stageOf,
  TOWN_HALL,
  townHallStage,
  trees,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  wallOf,
} from './layout'

describe('scène du village', () => {
  it('fait grandir un bâtiment tous les trois niveaux, et couronne le niveau maximum', () => {
    expect([0, 1, 3, 4, 6, 7, 9, MAX_LEVEL].map(stageOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4])
  })

  it("fait grandir l'hôtel de ville et ses remparts avec le village", () => {
    const levels = (n: number) => ({ sawmill: n, quarry: n, mine: n })
    expect(townHallStage(levels(1))).toBe(1)
    expect(townHallStage(levels(2))).toBe(2)
    expect(townHallStage(levels(5))).toBe(3)
    expect(townHallStage(levels(MAX_LEVEL))).toBe(4)
    expect([1, 3, 6].map((n) => wallOf(levels(n)))).toEqual(['none', 'palisade', 'stone'])
  })

  it("place l'île dans le monde, et chaque bâtiment sur l'île", () => {
    const coast = islandOutline()
    for (const point of coast) {
      expect(point.x).toBeGreaterThan(0)
      expect(point.x).toBeLessThan(WORLD_WIDTH)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThan(WORLD_HEIGHT)
    }
    for (const place of [TOWN_HALL, HARBOR, ...BUILDINGS.map((b) => PLACES[b])]) {
      expect(contains(place, coast)).toBe(true)
    }
    expect(contains({ x: 10, y: 10 }, coast)).toBe(false)
  })

  it('plante les mêmes arbres à chaque visite, hors des routes et des bâtiments', () => {
    const forest = trees()
    expect(forest).toEqual(trees())
    expect(forest.length).toBeGreaterThan(40)
    for (const tree of forest) {
      expect(roads().every((road) => distanceToPath(tree, road) > 26)).toBe(true)
      expect(Math.hypot(tree.x - TOWN_HALL.x, tree.y - TOWN_HALL.y)).toBeGreaterThan(230)
    }
  })

  it('donne la même suite pour la même graine', () => {
    const a = seeded(42)
    const b = seeded(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it("mène chaque route de l'hôtel de ville à son bâtiment, et y fait marcher les villageois", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 30, y: 100 },
    ]
    expect(pathLength(path)).toBe(110)
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0 })
    expect(pointAlong(path, 25 / 110)).toEqual({ x: 15, y: 20 })
    expect(pointAlong(path, 2)).toEqual({ x: 30, y: 100 })
    expect(roads()).toHaveLength(BUILDINGS.length + 1)
    expect(roads()[0][0].x).toBe(TOWN_HALL.x)
  })
})
