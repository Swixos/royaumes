import { describe, expect, it } from 'vitest'
import {
  along,
  clock,
  islandOutline,
  laneOf,
  MAP_H,
  MAP_W,
  type PlacedIsland,
  progressOf,
  relax,
  toWorld,
} from './sea-layout'

describe('carte des mers', () => {
  it('écarte les îles des joueurs sans jamais déplacer les îles pirates', () => {
    const islands: PlacedIsland[] = [
      { shapeId: 'a', kind: 'home', point: { x: 50, y: 50 } },
      { shapeId: 'b', kind: 'village', point: { x: 51, y: 50 } },
      { shapeId: 'p', kind: 'pirates', point: { x: 20, y: 30 } },
    ]
    const placed = relax(islands)
    const [a, b, p] = placed.map((island) => toWorld(island.point))
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(119)
    expect(placed[2].point).toEqual({ x: 20, y: 30 })
    expect(p).toEqual({ x: 0.2 * MAP_W, y: 0.3 * MAP_H })
    expect(relax(islands)).toEqual(placed)
  })

  it('dessine toujours la même île pour le même identifiant, autour de son centre', () => {
    const outline = islandOutline('port-1', 40)
    expect(outline).toEqual(islandOutline('port-1', 40))
    expect(outline).toHaveLength(54)
    for (const point of outline) expect(Math.hypot(point.x, point.y)).toBeLessThan(40 * 1.25)
    expect(islandOutline('port-2', 40)).not.toEqual(outline)
  })

  it('fait voguer la flotte sur sa route, de son port à sa cible', () => {
    const lane = laneOf('raid-1', { x: 0, y: 0 }, { x: 100, y: 0 })
    expect(along(lane, 0)).toMatchObject({ x: 0, y: 0 })
    expect(along(lane, 1)).toMatchObject({ x: 100, y: 0 })
    expect(Math.abs(along(lane, 0.5).y)).toBeGreaterThan(0)
    expect(laneOf('raid-1', lane.from, lane.to)).toEqual(lane)
  })

  it("mesure l'avancée de la flotte et le temps restant", () => {
    expect(progressOf(1000, 3000, 500)).toBe(0)
    expect(progressOf(1000, 3000, 2000)).toBe(0.5)
    expect(progressOf(1000, 3000, 9000)).toBe(1)
    expect(progressOf(1000, 1000, 1000)).toBe(1)
    expect(clock(151_000)).toBe('02:31')
    expect(clock(-5)).toBe('00:00')
  })
})
