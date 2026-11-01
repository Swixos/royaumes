import { describe, expect, it } from 'vitest'
import {
  type ArmyDetail,
  type BattleDetail,
  CATEGORIES,
  categoryOf,
  explainArmyBattle,
  explainBattle,
  FACTS_OF,
  tell,
  tellAmounts,
  tellArmy,
} from './entry'

describe("récit de l'historique", () => {
  it('range chaque fait dans une seule partie du jeu', () => {
    const all = CATEGORIES.flatMap((category) => FACTS_OF[category])
    expect(new Set(all).size).toBe(all.length)
    expect(categoryOf('battle')).toBe('fleet')
    expect(categoryOf('expedition-ended')).toBe('dungeon')
    expect(categoryOf('trade-completed')).toBe('market')
    expect(categoryOf('building-ordered')).toBe('village')
  })

  it('dit des ressources en toutes lettres, sans les quantités nulles', () => {
    expect(tellAmounts({ wood: 120, stone: 0, gold: 40 })).toBe('120 bois, 40 or')
    expect(tellAmounts({})).toBe('rien')
  })

  it("distingue un chantier en cours d'un bâtiment construit", () => {
    const fact = {
      type: 'building-ordered' as const,
      building: 'sawmill',
      toLevel: 3,
      cost: { wood: 50 },
      completesAt: 2_000,
    }
    expect(tell(fact, 1_000)).toEqual({
      title: 'Scierie niveau 3',
      detail: 'En construction, pour 50 bois',
      tone: 'plain',
    })
    expect(tell(fact, 2_000)).toMatchObject({ detail: 'Construit, pour 50 bois', tone: 'good' })
  })

  it("raconte une bataille du point de vue de l'attaquant comme du défenseur", () => {
    expect(
      tell(
        {
          type: 'battle',
          role: 'attacker',
          won: true,
          opponent: 'Roche-Haute',
          loot: { gold: 30 },
        },
        0,
      ),
    ).toEqual({ title: 'Victoire contre Roche-Haute', detail: 'Butin : 30 or', tone: 'good' })
    expect(
      tell(
        { type: 'battle', role: 'defender', won: false, opponent: 'alice', loot: { wood: 12 } },
        0,
      ),
    ).toEqual({ title: 'Village pillé par alice', detail: 'Pertes : 12 bois', tone: 'bad' })
    expect(
      tell({ type: 'battle', role: 'defender', won: true, opponent: 'alice', loot: {} }, 0),
    ).toMatchObject({ title: 'Attaque repoussée par alice', tone: 'good' })
  })

  it("raconte un échange selon qu'on vend ou qu'on achète", () => {
    const trade = { type: 'trade-completed' as const, give: { wood: 10 }, want: { stone: 5 } }
    expect(tell({ ...trade, role: 'seller', partner: 'bob' }, 0).detail).toBe(
      'Donné : 10 bois ; reçu : 5 pierre',
    )
    expect(tell({ ...trade, role: 'buyer', partner: 'alice' }, 0).detail).toBe(
      'Donné : 5 pierre ; reçu : 10 bois',
    )
  })

  it("explique une défaite de l'attaquant : la tactique, les sommes, les pertes et le conseil", () => {
    const report: BattleDetail = {
      ships: 2,
      tactic: 'ram',
      posture: 'board',
      counter: 'board',
      perShip: 10,
      multiplier: 0.5,
      attack: 10,
      defense: 44,
      pirates: false,
      wall: 2,
      perWallLevel: 12,
      neededShips: 9,
      cost: { wood: 30, stone: 10 },
      hold: { wood: 20, stone: 10, gold: 4 },
    }
    const fact = {
      type: 'battle' as const,
      role: 'attacker' as const,
      won: false,
      opponent: 'Roche-Haute',
      loot: {},
    }
    const lines = Object.fromEntries(
      explainBattle(fact, report).map((line) => [line.label, line.value]),
    )
    expect(lines).toEqual({
      'Votre flotte': '2 trirèmes en éperonnage',
      'Défense adverse': 'Abordage',
      Tactique: 'Abordage bat éperonnage : attaque ×0,5',
      "Force d'attaque": '2 × 10 × 0,5 = 10',
      Défense: '20 de base + rempart niveau 2 (24) = 44',
      Issue: '10 ≤ 44 : la flotte est repoussée',
      Pertes: '2 trirèmes coulées, équipement perdu : 30 bois, 10 pierre',
      Conseil: 'Il fallait au moins 9 trirèmes en éperonnage, ou une tactique qui bat abordage.',
    })
  })

  it("explique au défenseur une attaque repoussée contre son île, et ce qu'a perdu l'ennemi", () => {
    const report: BattleDetail = {
      ships: 1,
      tactic: 'blockade',
      posture: 'blockade',
      counter: 'ram',
      perShip: 10,
      multiplier: 1,
      attack: 10,
      defense: 20,
      pirates: false,
      wall: 0,
      perWallLevel: 12,
      neededShips: 3,
      cost: { wood: 15, stone: 5 },
      hold: { wood: 10, stone: 5, gold: 2 },
    }
    const fact = {
      type: 'battle' as const,
      role: 'defender' as const,
      won: true,
      opponent: 'alice',
      loot: {},
    }
    const lines = explainBattle(fact, report)
    expect(lines.find((line) => line.label === 'Issue')).toMatchObject({
      value: '10 ≤ 20 : la flotte est repoussée',
      tone: 'good',
    })
    expect(lines.find((line) => line.label === 'Pertes')?.value).toBe(
      'Flotte ennemie coulée : 1 trirème',
    )
    expect(lines.some((line) => line.label === 'Conseil')).toBe(false)
  })

  it('dit une armée en toutes lettres, accordée en nombre', () => {
    expect(tellArmy({ swordsman: 12, transport: 1, lightShip: 0 })).toBe(
      '12 épéistes, 1 bateau de transport',
    )
    expect(tellArmy({})).toBe('aucune unité')
    const told = tell({ type: 'units-recruited', unit: 'archer', count: 1, cost: { wood: 18 } }, 0)
    expect(told.title).toBe('1 archer en formation')
    expect(categoryOf('units-recruited')).toBe('village')
  })

  it("explique une bataille d'armées : la mer, la terre, le rempart et les pertes", () => {
    const army: ArmyDetail = {
      attacker: { sent: { slinger: 10, transport: 1 }, lost: { slinger: 10, transport: 1 } },
      defender: { present: { swordsman: 20 }, lost: { swordsman: 6 } },
      naval: null,
      land: {
        attack: 230,
        damage: { blunt: 0, sharp: 0, distance: 230 },
        defense: 702,
        wall: 2,
        wallBonus: 0.16,
        won: false,
      },
      victory: false,
      capacity: 0,
    }
    const fact = {
      type: 'battle' as const,
      role: 'attacker' as const,
      won: false,
      opponent: 'Ithaque',
      loot: {},
      army,
    }
    const lines = explainArmyBattle(fact, army)
    const value = (label: string) => lines.find((line) => line.label === label)?.value
    expect(value('Votre armée')).toBe('10 frondeurs, 1 bateau de transport')
    expect(value('Bataille terrestre')).toBe(
      "230 d'attaque (230 à distance) contre 702 de défense, rempart niveau 2 (+16 %)",
    )
    expect(value('Pertes adverses')).toBe('6 épéistes')
    expect(lines.some((line) => line.label === 'Conseil')).toBe(true)
    expect(tell(fact, 0).detail).toBe('Pertes : 10 frondeurs, 1 bateau de transport')
  })
})
