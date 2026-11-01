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

describe('Village - troupes', () => {
  /**
   * Builds a village whose barracks and shipyard are built, with resources to spare.
   *
   * @returns The state of the village.
   */
  function garrisonTown(): VillageState {
    const state = replay([founded])
    return {
      ...state,
      levels: { ...state.levels, barracks: 3, shipyard: 2, farm: 3 },
      stock: { wood: 5_000, stone: 5_000, gold: 5_000 },
    }
  }

  it('forme des unités payées à la commande, sorties une à une de la caserne', () => {
    const town = garrisonTown()
    const [ordered] = eventsOf(
      decide(town, { type: 'RecruitUnits', unit: 'swordsman', count: 3 }, T0),
    )
    expect(ordered).toEqual({
      type: 'UnitsRecruited',
      data: {
        unit: 'swordsman',
        count: 3,
        cost: { wood: 60, stone: 24 },
        at: T0,
        startsAt: T0,
        each: 6_800,
      },
    })
    const state = evolve(town, ordered)
    expect(state.stock.wood).toBe(4_940)
    expect(toView(state, T0 + 7_000).army).toEqual({ swordsman: 1 })
    expect(toView(state, T0 + 60_000).army).toEqual({ swordsman: 3 })
    expect(toView(state, T0).population.used).toBe(3)
  })

  it('enchaîne les ordres d’un même bâtiment, et forme les navires à part', () => {
    let state = garrisonTown()
    for (const command of [
      { type: 'RecruitUnits', unit: 'swordsman', count: 2 },
      { type: 'RecruitUnits', unit: 'archer', count: 1 },
      { type: 'RecruitUnits', unit: 'transport', count: 1 },
    ] as const) {
      state = eventsOf(decide(state, command, T0)).reduce(evolveOne, state)
    }
    const [swords, archers, ships] = state.trainings
    expect(archers.startsAt).toBe(trainingEndOf(swords))
    expect(ships.startsAt).toBe(T0)
  })

  it('refuse une unité sans le bâtiment voulu, un ordre trop grand ou une ferme pleine', () => {
    const town = garrisonTown()
    expect(decide(town, { type: 'RecruitUnits', unit: 'hoplite', count: 1 }, T0)).toEqual({
      ok: false,
      error: { code: 'UNIT_LOCKED', unit: 'hoplite', building: 'barracks', level: 5 },
    })
    expect(decide(town, { type: 'RecruitUnits', unit: 'swordsman', count: 0 }, T0)).toEqual({
      ok: false,
      error: { code: 'INVALID_ORDER' },
    })
    expect(decide(town, { type: 'RecruitUnits', unit: 'bireme', count: 41 }, T0)).toEqual({
      ok: false,
      error: { code: 'POPULATION_EXCEEDED', free: 160 },
    })
  })

  it('fait partir des unités en raid, les ramène, et compte celles perdues', () => {
    let state = garrisonTown()
    state = eventsOf(
      decide(state, { type: 'RecruitUnits', unit: 'swordsman', count: 5 }, T0),
    ).reduce(evolveOne, state)
    const later = T0 + minutes(5)
    const refused = eventsOf(
      decide(state, { type: 'WithdrawUnits', transferId: 'r:go', units: { swordsman: 6 } }, later),
    )
    expect(refused).toEqual([
      {
        type: 'WithdrawalRefused',
        data: { transferId: 'r:go', missing: { swordsman: 1 }, at: later },
      },
    ])
    const go = { type: 'WithdrawUnits', transferId: 'r:go', units: { swordsman: 4 } } as const
    state = eventsOf(decide(state, go, later)).reduce(evolveOne, state)
    expect(toView(state, later).army).toEqual({ swordsman: 1 })
    expect(toView(state, later).away).toEqual({ swordsman: 4 })
    expect(eventsOf(decide(state, go, later))).toEqual([])

    const back = {
      type: 'ReturnUnits',
      transferId: 'r:back',
      units: { swordsman: 3 },
      lost: { swordsman: 1 },
    } as const
    state = eventsOf(decide(state, back, later)).reduce(evolveOne, state)
    expect(toView(state, later).army).toEqual({ swordsman: 4 })
    expect(toView(state, later).away).toEqual({})
    expect(toView(state, later).population.used).toBe(4)
  })

  it('perd en défense ce que la garnison possède, sans jamais refuser', () => {
    let state = garrisonTown()
    state = eventsOf(decide(state, { type: 'RecruitUnits', unit: 'archer', count: 2 }, T0)).reduce(
      evolveOne,
      state,
    )
    const later = T0 + minutes(5)
    const [lost] = eventsOf(
      decide(
        state,
        {
          type: 'WithdrawUnits',
          transferId: 'r:dead',
          units: { archer: 5, hoplite: 2 },
          casualties: true,
        },
        later,
      ),
    )
    expect(lost).toEqual({
      type: 'UnitsLost',
      data: { transferId: 'r:dead', units: { archer: 2 }, at: later },
    })
    expect(toView(evolve(state, lost), later).army).toEqual({})
  })
})

/**
 * Time the last unit of an order is trained.
 *
 * @param training - Order.
 * @returns The time in milliseconds.
 */
const trainingEndOf = (training: { startsAt: number; count: number; each: number }) =>
  training.startsAt + training.count * training.each
