import { describe, expect, it } from 'vitest'
import { buildDuration, hiddenAmount, STARTING_LEVELS, warehouseCapacity } from './catalog'
import {
  accrue,
  decide,
  evolve,
  initialState,
  replay,
  stockAt,
  toView,
  upgradeCost,
  type VillageCommand,
  type VillageEvent,
  type VillageState,
} from './village'

const T0 = Date.UTC(2026, 0, 1)
const minutes = (n: number) => n * 60_000

/**
 * Applies one event, to fold the events of a decision into a state.
 *
 * @param state - Current state.
 * @param event - Event to apply.
 * @returns The new state.
 */
const evolveOne = (state: VillageState, event: VillageEvent) => evolve(state, event)

const founded: VillageEvent = { type: 'VillageFounded', data: { name: 'Valombre', at: T0 } }

/**
 * Builds the command upgrading a building.
 *
 * @param building - Building to upgrade.
 * @returns The command.
 */
const upgrade = (building: Extract<VillageCommand, { type: 'UpgradeBuilding' }>['building']) =>
  ({ type: 'UpgradeBuilding', building }) as const

/**
 * Unwraps a decision expected to be accepted.
 *
 * @param decision - Decision returned by `decide`.
 * @returns Its events.
 * @throws If the decision was refused.
 */
function eventsOf(decision: ReturnType<typeof decide>): VillageEvent[] {
  if (!decision.ok) throw new Error(`Décision refusée : ${decision.error.code}`)
  return decision.events
}

describe('Village - fondation', () => {
  it('fonde un village avec le stock et les niveaux de départ', () => {
    const events = eventsOf(decide(initialState, { type: 'FoundVillage', name: 'Valombre' }, T0))
    const state = replay(events)

    expect(state.name).toBe('Valombre')
    expect(state.stock).toEqual({ wood: 100, stone: 50, gold: 0 })
    expect(state.levels).toEqual(STARTING_LEVELS)
    expect(state.queue).toEqual([])
  })

  it('refuse de fonder un second village', () => {
    const decision = decide(replay([founded]), { type: 'FoundVillage', name: 'Autre' }, T0)
    expect(decision).toEqual({ ok: false, error: { code: 'ALREADY_FOUNDED' } })
  })
})

describe('Village - production paresseuse', () => {
  it('accumule la production en fonction du temps écoulé', () => {
    const view = toView(replay([founded]), T0 + minutes(5))
    expect(view.stock).toEqual({ wood: 150, stone: 80, gold: 0 })
  })

  it('fait produire un bâtiment à son nouveau niveau dès la fin de sa construction', () => {
    const order = T0 + minutes(5)
    const events = eventsOf(decide(replay([founded]), upgrade('sawmill'), order))
    const done = order + buildDuration('sawmill', 1, 1)
    const after = replay([founded, ...events])

    expect(after.stock).toEqual({ wood: 52, stone: 31, gold: 0 })
    expect(accrue(after, done - 1).levels.sawmill).toBe(1)
    const later = accrue(after, done + minutes(1))
    expect(later.levels.sawmill).toBe(2)
    expect(later.stock.wood).toBeCloseTo(52 + ((done - order) / 60_000) * 10 + 20, 6)
  })

  it("extrapole le stock côté interface à partir d'une vue", () => {
    const view = toView(replay([founded]), T0)
    expect(stockAt(view, T0 + minutes(1))).toEqual({ wood: 110, stone: 56, gold: 0 })
  })
})

describe('Village - amélioration', () => {
  it('applique la règle de coût', () => {
    expect(upgradeCost('sawmill', 1)).toEqual({ wood: 98, stone: 49 })
    expect(upgradeCost('sawmill', 2)).toEqual({ wood: 167, stone: 83 })
  })

  it('paie une amélioration à la commande, et la met en chantier pour sa durée', () => {
    const at = T0 + minutes(10)
    const events = eventsOf(decide(replay([founded]), upgrade('quarry'), at))
    const state = replay([founded, ...events])

    expect(state.levels.quarry).toBe(1)
    expect(state.stock.wood).toBe(52)
    expect(state.queue).toEqual([
      { building: 'quarry', toLevel: 2, completesAt: at + buildDuration('quarry', 1, 1) },
    ])
  })

  it('indique les ressources manquantes', () => {
    const decision = decide(replay([founded]), upgrade('warehouse'), T0)
    expect(decision).toEqual({
      ok: false,
      error: { code: 'INSUFFICIENT_RESOURCES', missing: { wood: 23, stone: 24 } },
    })
  })

  it('refuse une amélioration avant la fondation', () => {
    const decision = decide(initialState, { type: 'UpgradeBuilding', building: 'sawmill' }, T0)
    expect(decision).toEqual({ ok: false, error: { code: 'NOT_FOUNDED' } })
  })

  it('refuse une amélioration au-delà du niveau maximal', () => {
    const atMax: VillageEvent = {
      type: 'BuildingUpgraded',
      data: { building: 'sawmill', toLevel: 10, cost: {}, at: T0 },
    }
    const decision = decide(
      replay([founded, atMax]),
      { type: 'UpgradeBuilding', building: 'sawmill' },
      T0,
    )
    expect(decision).toEqual({
      ok: false,
      error: { code: 'MAX_LEVEL_REACHED', building: 'sawmill' },
    })
  })

  it("ne modifie jamais l'état reçu", () => {
    const state = replay([founded])
    const copy = structuredClone(state)
    decide(state, { type: 'UpgradeBuilding', building: 'sawmill' }, T0 + minutes(60))
    toView(state, T0 + minutes(60))
    expect(state).toEqual(copy)
  })
})

describe('Village - chantiers', () => {
  /**
   * Gives a village plenty of resources and a large warehouse, so only the rule under test
   * can refuse a command.
   *
   * @param levels - Levels to set on top of the starting ones.
   * @returns The village.
   */
  const rich = (levels: Partial<VillageState['levels']> = {}): VillageState => ({
    ...replay([founded]),
    stock: { wood: 5000, stone: 5000, gold: 5000 },
    levels: { ...STARTING_LEVELS, warehouse: 10, ...levels },
  })

  it('refuse un bâtiment dont les prérequis ne sont pas atteints, et les nomme', () => {
    expect(decide(rich(), upgrade('shipyard'), T0)).toEqual({
      ok: false,
      error: {
        code: 'REQUIREMENTS_NOT_MET',
        building: 'shipyard',
        missing: { senate: 2, sawmill: 3 },
      },
    })
    expect(decide(rich({ senate: 2 }), upgrade('mine'), T0).ok).toBe(true)
  })

  it('enchaîne les chantiers : le second commence à la fin du premier', () => {
    const first = eventsOf(decide(rich(), upgrade('sawmill'), T0))
    const second = eventsOf(decide(first.reduce(evolveOne, rich()), upgrade('sawmill'), T0))
    const end = T0 + buildDuration('sawmill', 1, 1)

    expect(second[0].data).toMatchObject({
      toLevel: 3,
      completesAt: end + buildDuration('sawmill', 2, 1),
    })
  })

  it('refuse une commande quand la file de construction est pleine', () => {
    let state = rich()
    for (const building of ['sawmill', 'quarry'] as const) {
      state = eventsOf(decide(state, upgrade(building), T0)).reduce(evolveOne, state)
    }
    expect(decide(state, upgrade('senate'), T0)).toEqual({
      ok: false,
      error: { code: 'QUEUE_FULL', slots: 2 },
    })
  })

  it('accélère les chantiers avec le sénat', () => {
    expect(buildDuration('wall', 3, 10)).toBeLessThan(buildDuration('wall', 3, 1))
    expect(buildDuration('wall', 3, 10)).toBe(buildDuration('wall', 3, 0) / 2)
  })

  it("applique aussitôt une amélioration enregistrée avant l'existence des chantiers", () => {
    const old: VillageEvent = {
      type: 'BuildingUpgraded',
      data: { building: 'sawmill', toLevel: 2, cost: { wood: 98, stone: 49 }, at: T0 },
    }
    expect(replay([founded, old]).levels.sawmill).toBe(2)
  })
})

describe('Village - entrepôt', () => {
  it("arrête la production quand l'entrepôt est plein", () => {
    const capacity = warehouseCapacity(1)
    const view = toView(replay([founded]), T0 + minutes(600))
    expect(view.capacity).toBe(capacity)
    expect(view.stock.wood).toBe(capacity)
    expect(stockAt(view, T0 + minutes(900)).wood).toBe(capacity)
  })

  it('cache une part des ressources aux pillards, mais pas aux autres prélèvements', () => {
    const state = replay([founded])
    const hidden = hiddenAmount(1)
    const take = (plunder: boolean): VillageCommand => ({
      type: 'WithdrawResources',
      transferId: plunder ? 'raid' : 'market',
      resources: { wood: 100 },
      plunder,
    })
    expect(decide(state, take(true), T0)).toMatchObject({
      ok: true,
      events: [{ type: 'WithdrawalRefused', data: { missing: { wood: hidden } } }],
    })
    expect(decide(state, take(false), T0)).toMatchObject({
      ok: true,
      events: [{ type: 'ResourcesWithdrawn' }],
    })
  })
})
