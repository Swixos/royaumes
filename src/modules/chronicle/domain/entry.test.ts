import { describe, expect, it } from 'vitest'
import { CATEGORIES, categoryOf, FACTS_OF, tell, tellAmounts } from './entry'

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
    ).toEqual({ title: 'Victoire contre Roche-Haute', detail: 'Butin : 30 or', tone: 'good' })
    expect(
      tell(
        { type: 'battle', role: 'defender', won: false, opponent: 'alice', loot: { wood: 12 } },
        0,
      ),
    ).toEqual({ title: 'Village pillé par alice', detail: 'Pertes : 12 bois', tone: 'bad' })
    expect(
      tell({ type: 'battle', role: 'defender', won: true, opponent: 'alice', loot: {} }, 0),
    ).toMatchObject({ title: 'Attaque repoussée par alice', tone: 'good' })
  })

  it("raconte un échange selon qu'on vend ou qu'on achète", () => {
    const trade = { type: 'trade-completed' as const, give: { wood: 10 }, want: { stone: 5 } }
    expect(tell({ ...trade, role: 'seller', partner: 'bob' }, 0).detail).toBe(
      'Donné : 10 bois ; reçu : 5 pierre',
    )
    expect(tell({ ...trade, role: 'buyer', partner: 'alice' }, 0).detail).toBe(
      'Donné : 5 pierre ; reçu : 10 bois',
    )
  })
})
