import { describe, expect, it } from 'vitest'
import { decideHarbor, initialHarbor, replayHarbor } from './harbor'
import { travelMinutes } from './naval'
import {
  decide,
  evolve,
  initialState,
  type LaunchContext,
  type RaidCommand,
  type RaidState,
} from './raid'
import { RULES } from './rules.fixture'
import { noticeOf, requestsFor } from './saga'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

/**
 * Applies an accepted command.
 *
 * @param state - Current raid state.
 * @param command - Command expected to be accepted.
 * @param now - Current time in milliseconds.
 * @returns The new state, the events and the saga requests.
 * @throws Error if the command is refused.
 */
function play(state: RaidState, command: RaidCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

const calm: LaunchContext = {
  raidsOut: 0,
  targetHasVillage: true,
  islandRaidDays: [],
  shipyard: 0,
  rules: RULES,
}

/** Army of the raids of the tests: ten slingers in a transport. */
const ARMY = { slinger: 10, transport: 1 }

/**
 * Builds the launch of a raid by Alice.
 *
 * @param overrides - Fields replacing the defaults: ten slingers against Bob.
 * @returns The command.
 */
const launch = (
  overrides: Partial<Extract<RaidCommand, { type: 'LaunchRaid' }>> = {},
): RaidCommand => ({
  type: 'LaunchRaid',
  raidId: 'r1',
  attackerId: 'alice',
  attackerName: 'Alice',
  target: { kind: 'village', playerId: 'bob', name: 'Port de Bob' },
  army: ARMY,
  context: calm,
  ...overrides,
})

/**
 * Builds a reply of the village module.
 *
 * @param transferId - Transfer identifier.
 * @param outcome - Outcome of the withdrawal.
 * @param missing - Missing amounts, for a refusal.
 * @returns The saga command.
 */
const reply = (
  transferId: string,
  outcome: 'withdrawn' | 'refused',
  missing?: Record<string, number>,
): RaidCommand => ({ type: 'RecordTransferResult', transferId, outcome, missing })

const launched = play(initialState, launch()).state
const atSea = play(launched, reply('r1:provision', 'withdrawn')).state
const arrival = atSea.arrivesAt

/**
 * Plays the arrival of the army at Bob's village.
 *
 * @param garrison - Units defending the village.
 * @param wall - Level of the defender's wall.
 * @returns The outcome of the arrival.
 */
const arriveAtVillage = (garrison: Record<string, number>, wall = 0) =>
  play(
    atSea,
    {
      type: 'ResolveArrival',
      context: { kind: 'village', posture: null, wall, garrison, rules: RULES },
    },
    arrival,
  )

/**
 * Builds a refusal of a command.
 *
 * @param state - Current raid state.
 * @param command - Command expected to be refused.
 * @param now - Current time in milliseconds.
 * @returns The error code.
 */
function refusal(state: RaidState, command: RaidCommand, now = T0) {
  const decision = decide(state, command, now)
  return decision.ok ? null : decision.error.code
}

describe("Flotte - lancement d'un raid", () => {
  it('règle 1 : une armée compte au moins un navire, et ses troupes tiennent dans les cales', () => {
    expect(refusal(initialState, launch({ army: {} }))).toBe('INVALID_FLEET')
    expect(refusal(initialState, launch({ army: { slinger: 3 } }))).toBe('NO_SHIP')
    expect(refusal(initialState, launch({ army: { slinger: 11, transport: 1 } }))).toBe('NO_ROOM')
    expect(refusal(initialState, launch({ army: { slinger: 2.5, transport: 1 } }))).toBe(
      'INVALID_FLEET',
    )
    expect(refusal(initialState, launch())).toBeNull()
  })

  it('règle 2 : refuse un raid contre son propre village, ou contre un joueur sans village', () => {
    const own = launch({ target: { kind: 'village', playerId: 'alice', name: 'Chez moi' } })
    expect(refusal(initialState, own)).toBe('OWN_VILLAGE')
    const nowhere = launch({ context: { ...calm, targetHasVillage: false } })
    expect(refusal(initialState, nowhere)).toBe('UNKNOWN_TARGET')
    expect(
      refusal(initialState, launch({ target: { kind: 'pirates', islandId: 'atlantide' } })),
    ).toBe('UNKNOWN_TARGET')
  })

  it('règle 3 : refuse un troisième raid en mer, sauf avec un grand chantier naval', () => {
    expect(refusal(initialState, launch({ context: { ...calm, raidsOut: 2 } }))).toBe(
      'TOO_MANY_RAIDS',
    )
    expect(
      refusal(initialState, launch({ context: { ...calm, raidsOut: 2, shipyard: 4 } })),
    ).toBeNull()
  })

  it('règle 5 : vogue au pas du navire le plus lent, plus vite avec le chantier naval', () => {
    const minutes = travelMinutes('alice', 'bob') * 60_000
    expect(launched.travelMs).toBe(minutes)
    const fast = play(initialState, launch({ army: { lightShip: 1 } })).state
    expect(fast.travelMs).toBe(Math.round((minutes * 8) / 13))
    const yard = play(initialState, launch({ context: { ...calm, shipyard: 5 } })).state
    expect(yard.travelMs).toBe(minutes * 0.8)
  })

  it("règle 4 : fait partir l'armée du village, et annule le raid si elle n'y est pas", () => {
    const { state, requests } = play(initialState, launch())
    expect(state).toMatchObject({
      status: 'provisioning',
      army: ARMY,
      ships: 1,
      damage: 'distance',
    })
    expect(requests).toEqual([
      { kind: 'withdraw-units', transferId: 'r1:provision', playerId: 'alice', units: ARMY },
    ])
    const cancelled = play(state, reply('r1:provision', 'refused', { slinger: 4 }))
    expect(cancelled.state).toMatchObject({ status: 'cancelled', missing: { slinger: 4 } })
    expect(cancelled.requests).toEqual([])
  })

  it('règle 5 : la flotte part, se signale au défenseur et se rappelle à son arrivée', () => {
    const { state, requests } = play(launched, reply('r1:provision', 'withdrawn'), T0 + 1_000)
    const arrivesAt = T0 + 1_000 + travelMinutes('alice', 'bob') * 60_000
    expect(state).toMatchObject({ status: 'at-sea', arrivesAt })
    expect(requests).toEqual([
      { kind: 'arrive', raidId: 'r1', at: arrivesAt },
      { kind: 'notice', playerId: 'bob', raidId: 'r1', notice: 'sighted' },
    ])
    expect(noticeOf(state, 'sighted', 'bob')).toMatchObject({ attackerName: 'Alice', ships: 1 })
    expect(noticeOf(state, 'sighted', 'alice')).toBeNull()
  })

  it('ignore une réponse en double ou inattendue', () => {
    expect(play(atSea, reply('r1:provision', 'withdrawn')).events).toEqual([])
    expect(play(atSea, reply('r1:plunder-1', 'withdrawn')).events).toEqual([])
  })
})

describe('Flotte - rappel de la flotte', () => {
  it("règle 6 : seul l'attaquant rappelle son armée, qui rentre après le temps déjà passé en mer", () => {
    expect(refusal(atSea, { type: 'RecallFleet', playerId: 'bob' })).toBe('NOT_ATTACKER')
    expect(refusal(atSea, { type: 'RecallFleet', playerId: 'alice' }, arrival)).toBe(
      'ALREADY_ARRIVED',
    )
    const now = atSea.sailedAt + 30_000
    const { state, requests } = play(atSea, { type: 'RecallFleet', playerId: 'alice' }, now)
    expect(state).toMatchObject({ status: 'recalled', returnsAt: now + 30_000 })
    expect(requests).toEqual([
      {
        kind: 'return-units',
        transferId: 'r1:return',
        playerId: 'alice',
        units: ARMY,
        lost: {},
        at: now + 30_000,
      },
      { kind: 'notice', playerId: 'bob', raidId: 'r1', notice: 'turned-back' },
    ])
  })

  it('ramène l’armée lorsque le village visé a disparu pendant la traversée', () => {
    const { state, requests } = play(atSea, { type: 'ResolveArrival', context: null }, arrival)
    expect(state.status).toBe('aborted')
    expect(requests).toEqual([
      {
        kind: 'return-units',
        transferId: 'r1:return',
        playerId: 'alice',
        units: ARMY,
        lost: {},
        at: arrival + atSea.travelMs,
      },
    ])
  })
})

describe('Flotte - bataille et pillage', () => {
  it("refuse l'arrivée avant son heure, et l'ignore une fois la flotte rentrée", () => {
    expect(refusal(atSea, { type: 'ResolveArrival', context: null }, arrival - 1)).toBe(
      'NOT_ARRIVED',
    )
    const recalled = play(atSea, { type: 'RecallFleet', playerId: 'alice' }).state
    expect(play(recalled, { type: 'ResolveArrival', context: null }, arrival).events).toEqual([])
  })

  it('règle 8 : une armée battue meurt, le défenseur compte ses morts, et les deux reçoivent le rapport', () => {
    const { state, requests } = arriveAtVillage({ swordsman: 8 }, 1)
    expect(state.status).toBe('sunk')
    expect(state.report?.land).toMatchObject({ attack: 230, won: false })
    expect(requests).toEqual([
      {
        kind: 'return-units',
        transferId: 'r1:return',
        playerId: 'alice',
        units: { transport: 1 },
        lost: { slinger: 10 },
        at: arrival + atSea.travelMs,
      },
      {
        kind: 'withdraw-units',
        transferId: 'r1:casualties',
        playerId: 'bob',
        units: state.report?.defender.lost,
        casualties: true,
      },
      { kind: 'notice', playerId: 'alice', raidId: 'r1', notice: 'report' },
      { kind: 'notice', playerId: 'bob', raidId: 'r1', notice: 'report' },
    ])
    expect(noticeOf(state, 'report', 'bob')).toMatchObject({
      role: 'defender',
      won: true,
      report: state.report,
    })
  })

  it('règle 9 : une armée victorieuse demande au village le butin de ses survivants', () => {
    const { state, requests } = arriveAtVillage({ swordsman: 2 }, 2)
    expect(state).toMatchObject({
      status: 'plundering',
      plunderAsked: { wood: 25, stone: 25, gold: 12 },
    })
    expect(requests.map((r) => r.kind)).toEqual(['return-units', 'withdraw-units', 'withdraw'])
    expect(requests[2]).toEqual({
      kind: 'withdraw',
      transferId: 'r1:plunder-1',
      playerId: 'bob',
      resources: { wood: 25, stone: 25, gold: 12 },
      plunder: true,
    })
    const done = play(state, reply('r1:plunder-1', 'withdrawn'))
    expect(done.state).toMatchObject({
      status: 'returned',
      loot: { wood: 25, stone: 25, gold: 12 },
    })
    expect(done.requests[0]).toEqual({
      kind: 'deposit',
      transferId: 'r1:loot',
      playerId: 'alice',
      resources: { wood: 25, stone: 25, gold: 12 },
      at: arrival + atSea.travelMs,
    })
  })

  it('règle 9 : réduit le butin une seule fois à ce que possède le village', () => {
    const fought = arriveAtVillage({}).state
    const reduced = play(fought, reply('r1:plunder-1', 'refused', { stone: 5, gold: 16 }))
    expect(reduced.requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'r1:plunder-2',
        playerId: 'bob',
        resources: { wood: 32, stone: 27 },
        plunder: true,
      },
    ])
    const empty = play(reduced.state, reply('r1:plunder-2', 'refused', { wood: 1 }))
    expect(empty.state).toMatchObject({ status: 'returned', loot: {} })
  })
})

describe('Flotte - îles pirates', () => {
  const pirates = launch({ target: { kind: 'pirates', islandId: 'misty-reef' } })
  const sailing = play(play(initialState, pirates).state, reply('r1:provision', 'withdrawn')).state
  /**
   * Plays the arrival at the island.
   *
   * @param damages - Main kind of damage of the previous armies of Alice.
   * @returns The outcome of the arrival.
   */
  const land = (damages: Array<'blunt' | 'sharp' | 'distance'>) =>
    play(
      sailing,
      { type: 'ResolveArrival', context: { kind: 'pirates', history: [], damages, rules: RULES } },
      sailing.arrivesAt,
    )

  it("règle 11 : le capitaine appelle en renfort l'unité qui pare l'arme favorite de l'attaquant", () => {
    expect(land([]).state.report?.defender.present).toEqual({ swordsman: 4, slinger: 2 })
    expect(land(['distance', 'distance']).state.report?.defender.present).toEqual({
      swordsman: 7,
      slinger: 2,
    })
    expect(land(['sharp']).state.report?.defender.present).toEqual({
      swordsman: 4,
      slinger: 2,
      archer: 3,
    })
  })

  it("pille le trésor de l'île dès la victoire, et le rapporte avec l'armée", () => {
    const { state, requests } = land([])
    expect(state).toMatchObject({ status: 'returned', loot: { wood: 38, gold: 10 } })
    expect(requests.map((r) => r.kind)).toEqual(['return-units', 'deposit', 'notice'])
    expect(requests[1]).toMatchObject({ resources: { wood: 38, gold: 10 }, at: state.returnsAt })
  })

  it("règle 12 : le trésor d'une île ne se pille qu'une fois par joueur et par jour", () => {
    const today = Math.floor(T0 / 86_400_000)
    const again = launch({
      target: { kind: 'pirates', islandId: 'misty-reef' },
      context: { ...calm, islandRaidDays: [today] },
    })
    expect(refusal(initialState, again)).toBe('TREASURE_TAKEN')
    expect(refusal(initialState, again, T0 + 86_400_000)).toBeNull()
  })
})

describe('Flotte - raids de trirèmes enregistrés avant les armées', () => {
  it('termine un raid de trirèmes selon ses règles, posture comprise', () => {
    let state = evolve(initialState, {
      type: 'RaidLaunched',
      data: {
        raidId: 'old',
        attackerId: 'alice',
        attackerName: 'Alice',
        target: { kind: 'village', playerId: 'bob', name: 'Port de Bob' },
        ships: 3,
        tactic: 'board',
        cost: { wood: 45, stone: 15 },
        travelMs: 60_000,
        at: T0,
      },
    })
    state = evolve(state, { type: 'FleetSailed', data: { arrivesAt: T0 + 60_000, at: T0 } })
    const { state: fought } = play(
      state,
      {
        type: 'ResolveArrival',
        context: { kind: 'village', posture: 'ram', wall: 0, garrison: {}, rules: RULES },
      },
      T0 + 60_000,
    )
    expect(fought.battle).toEqual({ attack: 45, defense: 20, posture: 'ram', victory: true })
    expect(fought.plunderAsked).toEqual({ wood: 30, stone: 15, gold: 6 })
  })
})

describe("Flotte - vue d'un raid", () => {
  it("cache au défenseur l'armée avant la bataille, et le raid à tout autre joueur", () => {
    expect(toView(atSea, 'alice')).toMatchObject({ role: 'attacker', army: ARMY })
    expect(toView(atSea, 'bob')).toMatchObject({ role: 'defender', army: null })
    expect(toView(atSea, 'carol')).toBeNull()
    expect(toView(arriveAtVillage({}).state, 'bob')?.army).toEqual(ARMY)
  })
})

describe('Flotte - port', () => {
  it('règle 10 : enregistre la posture choisie, sans événement si elle ne change pas', () => {
    const events = decideHarbor(initialHarbor, { type: 'ChoosePosture', posture: 'ram' }, T0)
    expect(events).toEqual([{ type: 'PostureChosen', data: { posture: 'ram', at: T0 } }])
    const harbor = replayHarbor(events)
    expect(harbor.posture).toBe('ram')
    expect(decideHarbor(harbor, { type: 'ChoosePosture', posture: 'ram' }, T0)).toEqual([])
  })

  it("n'enregistre qu'une fois le même avis d'un raid", () => {
    const notice = { kind: 'turned-back', raidId: 'r1' } as const
    const events = decideHarbor(initialHarbor, { type: 'RecordNotice', notice }, T0)
    expect(events).toHaveLength(1)
    expect(decideHarbor(replayHarbor(events), { type: 'RecordNotice', notice }, T0)).toEqual([])
  })
})
