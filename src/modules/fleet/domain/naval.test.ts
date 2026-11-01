import { describe, expect, it } from 'vitest'
import {
  crossingMinutes,
  equipmentCost,
  fight,
  holdOf,
  ISLAND_CLEARANCE,
  islandOf,
  islandTravelMinutes,
  MAX_TRAVEL_MINUTES,
  MIN_TRAVEL_MINUTES,
  mapPositionOf,
  PIRATE_ISLANDS,
  pirateLoot,
  reducedLoot,
  seaDistance,
  tacticMultiplier,
  travelMinutes,
  villageDefense,
} from './naval'
import { captainPosture, counterOf } from './pirates'

describe('Flotte - règles navales', () => {
  it("trirèmes (avant l'ADR 0023) : l'équipement coûte 15 bois et 5 pierre par trirème", () => {
    expect(equipmentCost(1)).toEqual({ wood: 15, stone: 5 })
    expect(equipmentCost(4)).toEqual({ wood: 60, stone: 20 })
  })

  it('règle 5 : la traversée dure de 1 à 7 minutes, la même dans les deux sens', () => {
    const players = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace']
    const seen = new Set<number>()
    for (const a of players) {
      for (const b of players) {
        if (a === b) continue
        const minutes = travelMinutes(a, b)
        expect(minutes).toBeGreaterThanOrEqual(MIN_TRAVEL_MINUTES)
        expect(minutes).toBeLessThanOrEqual(MAX_TRAVEL_MINUTES)
        expect(minutes).toBe(travelMinutes(b, a))
        seen.add(minutes)
      }
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('règle 5 : plus la cible est loin sur la carte, plus la traversée est longue', () => {
    const home = { x: 50, y: 50 }
    expect(crossingMinutes(home, home)).toBe(MIN_TRAVEL_MINUTES)
    expect(crossingMinutes(home, { x: 50, y: 75 })).toBe(2)
    expect(crossingMinutes(home, { x: 60, y: 50 })).toBeCloseTo(1.6)
    expect(crossingMinutes({ x: 0, y: 0 }, { x: 100, y: 100 })).toBe(MAX_TRAVEL_MINUTES)
    for (const player of ['alice', 'bob', 'carol']) {
      const near = [...PIRATE_ISLANDS].sort(
        (a, b) =>
          seaDistance(mapPositionOf(player), a.map) - seaDistance(mapPositionOf(player), b.map),
      )
      const times = near.map((island) => islandTravelMinutes(player, island))
      expect(times).toEqual([...times].sort((a, b) => a - b))
    }
  })

  it('règle 5 : aucun village ne se pose sur une île pirate', () => {
    for (let i = 0; i < 200; i++) {
      const point = mapPositionOf(`joueur-${i}`)
      for (const island of PIRATE_ISLANDS) {
        expect(seaDistance(point, island.map)).toBeGreaterThanOrEqual(ISLAND_CLEARANCE)
      }
    }
    expect(islandOf('atlantide')).toBeUndefined()
  })

  it("trirèmes (avant l'ADR 0023) : l'abordage bat l'éperonnage, l'éperonnage bat le blocus, le blocus bat l'abordage", () => {
    expect(tacticMultiplier('board', 'ram')).toBe(1.5)
    expect(tacticMultiplier('ram', 'blockade')).toBe(1.5)
    expect(tacticMultiplier('blockade', 'board')).toBe(1.5)
    expect(tacticMultiplier('ram', 'board')).toBe(0.5)
    expect(tacticMultiplier('board', 'board')).toBe(1)
    expect(fight(3, 'board', 'ram', 0).attack).toBe(45)
    expect(fight(3, 'ram', 'board', 0).attack).toBe(15)
  })

  it("trirèmes (avant l'ADR 0023) : la défense vaut 20 plus 12 par niveau de rempart, et l'attaque doit la dépasser strictement", () => {
    expect(villageDefense(0)).toBe(20)
    expect(villageDefense(4)).toBe(68)
    expect(fight(4, 'board', 'board', 40).victory).toBe(false)
    expect(fight(5, 'board', 'board', 40).victory).toBe(true)
  })

  it("trirèmes (avant l'ADR 0023) : les cales emportent au plus 10 bois, 5 pierre et 2 or par trirème", () => {
    expect(holdOf(3)).toEqual({ wood: 30, stone: 15, gold: 6 })
    expect(reducedLoot({ wood: 30, stone: 15, gold: 6 }, { stone: 15, gold: 2 })).toEqual({
      wood: 30,
      gold: 4,
    })
    const reef = islandOf('misty-reef')
    if (!reef) throw new Error('île manquante')
    expect(pirateLoot(reef, 2)).toEqual({ wood: 20, gold: 4 })
    expect(pirateLoot(reef, 10)).toEqual({ wood: 40, gold: 10 })
  })

  it('place chaque village toujours au même endroit de la carte', () => {
    expect(mapPositionOf('alice')).toEqual(mapPositionOf('alice'))
    const { x, y } = mapPositionOf('bob')
    expect(x).toBeGreaterThanOrEqual(10)
    expect(x).toBeLessThan(90)
    expect(y).toBeGreaterThanOrEqual(12)
    expect(y).toBeLessThan(86)
  })
})

describe('Flotte - IA des capitaines pirates', () => {
  it("trirèmes (avant l'ADR 0023) : le capitaine joue l'abordage sans historique ou à égalité", () => {
    expect(captainPosture([])).toBe('board')
    expect(captainPosture(['ram', 'blockade'])).toBe('board')
  })

  it("trirèmes (avant l'ADR 0023) : le capitaine contre la tactique que l'attaquant a le plus employée", () => {
    expect(counterOf('ram')).toBe('board')
    expect(counterOf('board')).toBe('blockade')
    expect(counterOf('blockade')).toBe('ram')
    expect(captainPosture(['ram', 'ram', 'board'])).toBe('board')
    expect(captainPosture(['board', 'blockade', 'board'])).toBe('blockade')
    expect(captainPosture(['blockade'])).toBe('ram')
  })

  it("trirèmes (avant l'ADR 0023) : le capitaine donne toujours la même posture pour le même historique", () => {
    const history = ['ram', 'board', 'board', 'blockade', 'board'] as const
    expect(captainPosture(history)).toBe(captainPosture([...history]))
  })
})
