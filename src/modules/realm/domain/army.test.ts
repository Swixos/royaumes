import { describe, expect, it } from 'vitest'
import {
  addArmy,
  armyAt,
  armySize,
  garrisonAt,
  missingUnits,
  populationOf,
  trainedBy,
  trainingEnd,
  trainingMs,
  unitAllowed,
} from './army'
import { STARTING_LEVELS } from './catalog'

describe('Armée - unités', () => {
  it('sort les unités d’un ordre une à une, jusqu’à la taille de l’ordre', () => {
    const order = { unit: 'swordsman' as const, count: 3, startsAt: 1_000, each: 500 }
    expect([999, 1_000, 1_499, 1_500, 2_000, 9_999].map((at) => trainedBy(order, at))).toEqual([
      0, 0, 0, 1, 2, 3,
    ])
    expect(trainingEnd(order)).toBe(2_500)
  })

  it('raccourcit la formation avec le niveau du bâtiment', () => {
    expect(trainingMs('swordsman', 0)).toBe(8_000)
    expect(trainingMs('swordsman', 4)).toBe(6_400)
    expect(trainingMs('swordsman', 20)).toBe(trainingMs('swordsman', 10))
  })

  it('demande la caserne ou le chantier naval au niveau de chaque unité', () => {
    expect(unitAllowed(STARTING_LEVELS, 'swordsman')).toBe(false)
    const levels = { ...STARTING_LEVELS, barracks: 2, shipyard: 1 }
    expect(unitAllowed(levels, 'slinger')).toBe(true)
    expect(unitAllowed(levels, 'archer')).toBe(false)
    expect(unitAllowed(levels, 'transport')).toBe(true)
    expect(unitAllowed(levels, 'bireme')).toBe(false)
  })

  it('additionne, compte et nourrit les armées', () => {
    const army = addArmy({ swordsman: 3, transport: 1 }, { swordsman: 3 }, -1)
    expect(army).toEqual({ transport: 1 })
    expect(armySize({ swordsman: 2, bireme: 1 })).toBe(3)
    expect(populationOf({ swordsman: 2, bireme: 1 })).toBe(6)
    expect(missingUnits({ swordsman: 2 }, { swordsman: 5, archer: 1 })).toEqual({
      swordsman: 3,
      archer: 1,
    })
  })

  it('compte la garnison à toute heure, ordres en cours et départs compris', () => {
    const order = { unit: 'swordsman' as const, count: 4, startsAt: 0, each: 100 }
    expect(armyAt({ archer: 1 }, [order], 250)).toEqual({ archer: 1, swordsman: 2 })
    const moves = [
      { kind: 'train' as const, ...order },
      { kind: 'move' as const, at: 300, units: { swordsman: 3 }, sign: -1 as const },
      { kind: 'move' as const, at: 900, units: { swordsman: 2 }, sign: 1 as const },
    ]
    expect(garrisonAt(moves, 299)).toEqual({ swordsman: 2 })
    expect(garrisonAt(moves, 300)).toEqual({})
    expect(garrisonAt(moves, 400)).toEqual({ swordsman: 1 })
    expect(garrisonAt(moves, 900)).toEqual({ swordsman: 3 })
  })
})
