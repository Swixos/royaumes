import { describe, expect, it } from 'vitest'
import {
  armyError,
  fightArmies,
  lootWithin,
  lossesOf,
  mainDamage,
  paceOf,
  plunderOf,
  winnerLoss,
} from './battle'
import { RULES } from './rules.fixture'

describe('Bataille - armée au départ', () => {
  it('demande au moins un navire, et assez de cales pour les troupes', () => {
    expect(armyError({}, RULES)).toBe('EMPTY')
    expect(armyError({ swordsman: 5 }, RULES)).toBe('NO_SHIP')
    expect(armyError({ swordsman: 11, transport: 1 }, RULES)).toBe('NO_ROOM')
    expect(armyError({ dragon: 1, transport: 1 }, RULES)).toBe('UNKNOWN_UNIT')
    expect(armyError({ swordsman: 10, transport: 1 }, RULES)).toBeNull()
    expect(armyError({ lightShip: 2 }, RULES)).toBeNull()
  })

  it('vogue au pas de son navire le plus lent', () => {
    expect(paceOf({ transport: 1, lightShip: 3 }, RULES)).toBe(1)
    expect(paceOf({ bireme: 1 }, RULES)).toBeCloseTo(8 / 15)
  })

  it('retient le type de dégâts qui porte la plus grande part de son attaque', () => {
    expect(mainDamage({ slinger: 2, swordsman: 4, transport: 1 }, RULES)).toBe('distance')
    expect(mainDamage({ hoplite: 3, transport: 1 }, RULES)).toBe('sharp')
    expect(mainDamage({ bireme: 1 }, RULES)).toBeNull()
  })
})

describe('Bataille - pertes', () => {
  it('fait perdre au vainqueur une part qui croît avec la force du vaincu', () => {
    expect(winnerLoss(0, 100)).toBe(0)
    expect(winnerLoss(25, 100)).toBeCloseTo(0.125)
    expect(winnerLoss(100, 100)).toBe(1)
    expect(lossesOf({ swordsman: 10, archer: 3 }, 0.25)).toEqual({ swordsman: 3, archer: 1 })
  })
})

describe('Bataille - sur terre', () => {
  it('pèse la défense de chaque unité selon les dégâts reçus, puis ajoute le rempart', () => {
    const report = fightArmies({ slinger: 10, transport: 1 }, { swordsman: 2 }, 2, RULES)
    expect(report.naval).toBeNull()
    expect(report.land).toMatchObject({
      attack: 230,
      damage: { blunt: 0, sharp: 0, distance: 230 },
      defense: 81.2,
      wall: 2,
      won: true,
    })
    expect(report.victory).toBe(true)
    expect(report.defender.lost).toEqual({ swordsman: 2 })
    expect(report.attacker.lost).toEqual({ slinger: 2 })
    expect(report.capacity).toBe(64)
  })

  it('laisse la victoire au défenseur à égalité, et perd toute la troupe vaincue', () => {
    const report = fightArmies({ swordsman: 2, transport: 1 }, {}, 0, RULES)
    expect(report.land).toMatchObject({ attack: 10, defense: 10, won: false })
    expect(report.victory).toBe(false)
    expect(report.attacker.lost).toEqual({ swordsman: 2 })
    expect(report.capacity).toBe(0)
  })

  it('choisit sa troupe selon la garnison : les archers parent les hoplites', () => {
    const hoplites = fightArmies({ hoplite: 10, transport: 1 }, { archer: 8 }, 0, RULES)
    const slingers = fightArmies({ slinger: 7, transport: 1 }, { archer: 8 }, 0, RULES)
    expect(hoplites.victory).toBe(false)
    expect(slingers.victory).toBe(true)
  })
})

describe('Bataille - en mer', () => {
  it('coule la flotte battue avec ses troupes, sans bataille sur terre', () => {
    const report = fightArmies(
      { swordsman: 5, transport: 1 },
      { bireme: 1, swordsman: 1 },
      0,
      RULES,
    )
    expect(report.naval).toEqual({ attack: 0, defense: 160, won: false })
    expect(report.land).toBeNull()
    expect(report.attacker.lost).toEqual({ swordsman: 5, transport: 1 })
    expect(report.defender.lost).toEqual({})
  })

  it('détruit les birèmes du défenseur, puis débarque les troupes', () => {
    const report = fightArmies(
      { lightShip: 2, transport: 1, slinger: 10 },
      { bireme: 1, swordsman: 1 },
      0,
      RULES,
    )
    expect(report.naval).toEqual({ attack: 400, defense: 160, won: true })
    expect(report.attacker.lost).toEqual({ lightShip: 1, slinger: 1 })
    expect(report.defender.lost).toEqual({ bireme: 1, swordsman: 1 })
    expect(report.victory).toBe(true)
  })

  it('rentre sans combattre sur terre une flotte sans troupes', () => {
    const report = fightArmies({ lightShip: 1 }, { swordsman: 3 }, 0, RULES)
    expect(report.land).toBeNull()
    expect(report.victory).toBe(false)
    expect(report.attacker.lost).toEqual({})
  })
})

describe('Bataille - butin', () => {
  it('partage les cales entre les ressources d’un trésor', () => {
    expect(lootWithin({ wood: 40, gold: 10 }, 64)).toEqual({ wood: 40, gold: 10 })
    expect(lootWithin({ wood: 40, gold: 10 }, 30)).toEqual({ wood: 20, gold: 10 })
    expect(lootWithin({ wood: 40, stone: 40, gold: 40 }, 31)).toEqual({
      wood: 11,
      stone: 10,
      gold: 10,
    })
  })

  it('demande au village le butin des cales, réparti entre les ressources', () => {
    expect(plunderOf(100)).toEqual({ wood: 40, stone: 40, gold: 20 })
    expect(plunderOf(0)).toEqual({})
  })
})
