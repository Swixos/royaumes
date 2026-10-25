/**
 * Layout of the sea map: size of the world, place of the islands, outline of each island
 * and sea lanes of the fleets. This file holds no drawing and no rendering library, so the
 * rules deciding what the map shows are tested without a browser.
 *
 * @packageDocumentation
 */
import { hash, type MapPoint } from '../contracts'

/** A point of the sea map, in world units. */
export interface Point {
  x: number
  y: number
}

/** Width of the sea map, in world units; the canvas scales it to its own size. */
export const MAP_W = 1000

/** Height of the sea map, in world units. */
export const MAP_H = 625

/** Kind of island, which sets its look. */
export type IslandKind = 'home' | 'village' | 'pirates'

/** Island to place on the map. */
export interface PlacedIsland {
  /** Identifier drawing its shape and naming it to the scene. */
  shapeId: string
  /** Kind of island. */
  kind: IslandKind
  /** Position on the map, in percent. */
  point: MapPoint
}

/**
 * Converts a map position, in percent, into world coordinates.
 *
 * @param point - Position in percent.
 * @returns The world coordinates.
 */
export const toWorld = (point: MapPoint): Point => ({
  x: (point.x / 100) * MAP_W,
  y: (point.y / 100) * MAP_H,
})

/**
 * Formats a duration as minutes and seconds.
 *
 * @param ms - Duration in milliseconds.
 * @returns The duration, such as "02:31".
 */
export function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Moves the islands of the players apart, so that no two islands overlap on the map.
 * Pirate islands never move; the others are pushed away from each other, always the same
 * way for the same islands.
 *
 * @param islands - Islands at their given position.
 * @returns The islands at their final position.
 */
export function relax<T extends PlacedIsland>(islands: T[]): T[] {
  const points = islands.map((island) => ({
    ...toWorld(island.point),
    fixed: island.kind === 'pirates',
  }))
  const gap = 120
  for (let round = 0; round < 60; round++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const dx = b.x - a.x || 0.5
        const dy = b.y - a.y || 0.5
        const distance = Math.hypot(dx, dy)
        if (distance >= gap) continue
        const push = (gap - distance) / (a.fixed || b.fixed ? 1 : 2)
        const ux = dx / distance
        const uy = dy / distance
        if (!a.fixed) {
          a.x -= ux * push
          a.y -= uy * push
        }
        if (!b.fixed) {
          b.x += ux * push
          b.y += uy * push
        }
      }
    }
    for (const point of points) {
      point.x = Math.min(MAP_W - 70, Math.max(70, point.x))
      point.y = Math.min(MAP_H - 70, Math.max(60, point.y))
    }
  }
  return islands.map((island, i) => ({
    ...island,
    point: { x: (points[i].x / MAP_W) * 100, y: (points[i].y / MAP_H) * 100 },
  }))
}

/**
 * Outline of an island: a smooth blob whose shape is drawn from the island identifier, so
 * it never changes. The corners of a polygon are rounded by sampling a curve through the
 * middle of its edges.
 *
 * @param id - Identifier of the island or of the village owner.
 * @param radius - Mean radius of the island.
 * @param samples - Number of points per corner.
 * @returns The points of the outline, around (0, 0).
 */
export function islandOutline(id: string, radius: number, samples = 6): Point[] {
  const seed = hash(id)
  const count = 9
  const corners = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    const wobble = 0.72 + (((seed >>> (i * 3)) & 7) / 7) * 0.5
    return { x: Math.cos(angle) * radius * wobble, y: Math.sin(angle) * radius * wobble * 0.8 }
  })
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const outline: Point[] = []
  for (let i = 0; i < count; i++) {
    const start = mid(corners[(i + count - 1) % count], corners[i])
    const end = mid(corners[i], corners[(i + 1) % count])
    for (let k = 0; k < samples; k++) {
      const t = k / samples
      const u = 1 - t
      outline.push({
        x: u * u * start.x + 2 * u * t * corners[i].x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * corners[i].y + t * t * end.y,
      })
    }
  }
  return outline
}

/** Sea lane of a fleet: a curved route between two points. */
export interface Lane {
  /** Departure point. */
  from: Point
  /** Control point of the curve. */
  bend: Point
  /** Arrival point. */
  to: Point
}

/**
 * Builds the curved sea lane of a fleet, bent to one side drawn from the raid identifier.
 *
 * @param raidId - Raid identifier.
 * @param from - Departure point.
 * @param to - Arrival point.
 * @returns The lane.
 */
export function laneOf(raidId: string, from: Point, to: Point): Lane {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const side = hash(raidId) % 2 === 0 ? 1 : -1
  return {
    from,
    to,
    bend: { x: (from.x + to.x) / 2 - dy * 0.22 * side, y: (from.y + to.y) / 2 + dx * 0.22 * side },
  }
}

/**
 * Finds the point and heading of a fleet along its lane.
 *
 * @param lane - Sea lane.
 * @param t - Progress, from 0 to 1.
 * @returns The point and the heading, in radians.
 */
export function along({ from, bend, to }: Lane, t: number) {
  const u = 1 - t
  const x = u * u * from.x + 2 * u * t * bend.x + t * t * to.x
  const y = u * u * from.y + 2 * u * t * bend.y + t * t * to.y
  const tx = 2 * u * (bend.x - from.x) + 2 * t * (to.x - bend.x)
  const ty = 2 * u * (bend.y - from.y) + 2 * t * (to.y - bend.y)
  return { x, y, heading: Math.atan2(ty, tx) }
}

/**
 * Progress of a fleet on its lane, from the time it sailed and the time it arrives.
 *
 * @param sailedAt - Time the fleet sailed, in milliseconds.
 * @param arrivesAt - Time the fleet arrives, in milliseconds.
 * @param now - Current time, in milliseconds.
 * @returns The progress, from 0 (in port) to 1 (arrived).
 */
export function progressOf(sailedAt: number, arrivesAt: number, now: number) {
  const span = arrivesAt - sailedAt
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (now - sailedAt) / span))
}
