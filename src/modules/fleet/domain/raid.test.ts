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

const calm: LaunchContext = { raidsOut: 0, targetHasVillage: true, islandRaidDays: [] }

/**
 * Builds the launch of a raid by Alice.
 *
 * @param overrides - Fields replacing the defaults: 3 boarding triremes against Bob.
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
  ships: 3,
  tactic: 'board',
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
 * Plays the arrival of the fleet at a village.
 *
 * @param posture - Posture of the defender.
 * @param upgrades - Building upgrades of the defender.
 * @returns The outcome of the arrival.
 */
const arriveAtVillage = (posture: 'ram' | 'board' | 'blockade' | null, upgrades = 0) =>
  play(atSea, { type: 'ResolveArrival', context: { kind: 'village', posture, upgrades } }, arrival)

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
  it('règle 1 : un raid engage de 1 à 10 trirèmes', () => {
    expect(refusal(initialState, launch({ ships: 0 }))).toBe('INVALID_FLEET')
    expect(refusal(initialState, launch({ ships: 11 }))).toBe('INVALID_FLEET')
    expect(refusal(initialState, launch({ ships: 2.5 }))).toBe('INVALID_FLEET')
    expect(refusal(initialState, launch({ ships: 10 }))).toBeNull()
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

  it('règle 3 : refuse un troisième raid en mer', () => {
    expect(refusal(initialState, launch({ context: { ...calm, raidsOut: 2 } }))).toBe(
      'TOO_MANY_RAIDS',
    )
    expect(refusal(initialState, launch({ context: { ...calm, raidsOut: 1 } }))).toBeNull()
  })

  it("règle 4 : prélève l'équipement avant le départ, et annule le raid s'il n'est pas payé", () => {
    const { state, requests } = play(initialState, launch())
    expect(state).toMatchObject({ status: 'provisioning', cost: { wood: 45, stone: 15 } })
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'r1:provision',
        playerId: 'alice',
        resources: { wood: 45, stone: 15 },
      },
    ])

    const cancelled = play(state, reply('r1:provision', 'refused', { wood: 5 }))
    expect(cancelled.state).toMatchObject({ status: 'cancelled', missing: { wood: 5 } })
    expect(cancelled.requests).toEqual([])
  })

  it('règle 5 : la flotte part pour la durée de la traversée, se signale au défenseur et se rappelle à son arrivée', () => {
    const { state, requests } = play(launched, reply('r1:provision', 'withdrawn'), T0 + 1_000)
    const arrivesAt = T0 + 1_000 + travelMinutes('alice', 'bob') * 60_000
    expect(state).toMatchObject({ status: 'at-sea', arrivesAt })
    expect(requests).toEqual([
      { kind: 'arrive', raidId: 'r1', at: arrivesAt },
      { kind: 'notice', playerId: 'bob', raidId: 'r1', notice: 'sighted' },
    ])
    expect(noticeOf(state, 'sighted', 'bob')).toEqual({
      kind: 'sighted',
      raidId: 'r1',
      attackerId: 'alice',
      attackerName: 'Alice',
      ships: 3,
      arrivesAt,
    })
    expect(noticeOf(state, 'sighted', 'alice')).toBeNull()
    expect(noticeOf(state, 'report', 'bob')).toBeNull()
  })

  it('ignore une réponse en double ou inattendue', () => {
    expect(play(atSea, reply('r1:provision', 'withdrawn')).events).toEqual([])
    expect(play(atSea, reply('r1:plunder-1', 'withdrawn')).events).toEqual([])
  })
})

describe('Flotte - rappel de la flotte (compensation)', () => {
  it("règle 6 : seul l'attaquant rappelle sa flotte avant l'arrivée, et récupère tout son équipement", () => {
    expect(refusal(atSea, { type: 'RecallFleet', playerId: 'bob' })).toBe('NOT_ATTACKER')
    expect(refusal(atSea, { type: 'RecallFleet', playerId: 'alice' }, arrival)).toBe(
      'ALREADY_ARRIVED',
    )
    expect(refusal(launched, { type: 'RecallFleet', playerId: 'alice' })).toBe('NOT_AT_SEA')

    const { state, requests } = play(atSea, { type: 'RecallFleet', playerId: 'alice' })
    expect(state.status).toBe('recalled')
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'r1:refund',
        playerId: 'alice',
        resources: { wood: 45, stone: 15 },
      },
      { kind: 'notice', playerId: 'bob', raidId: 'r1', notice: 'turned-back' },
    ])
  })

  it("rend l'équipement lorsque le village visé a disparu pendant la traversée", () => {
    const { state, requests } = play(atSea, { type: 'ResolveArrival', context: null }, arrival)
    expect(state.status).toBe('aborted')
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'r1:refund',
        playerId: 'alice',
        resources: { wood: 45, stone: 15 },
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

  it('règle 8 : une flotte dont la force ne dépasse pas la défense est perdue, et les deux ports reçoivent le rapport', () => {
    const { state, requests } = arriveAtVillage('blockade', 1)
    expect(state.battle).toEqual({ attack: 15, defense: 25, posture: 'blockade', victory: false })
    expect(state.status).toBe('sunk')
    expect(requests).toEqual([
      { kind: 'notice', playerId: 'alice', raidId: 'r1', notice: 'report' },
      { kind: 'notice', playerId: 'bob', raidId: 'r1', notice: 'report' },
    ])
    expect(noticeOf(state, 'report', 'alice')).toEqual({
      kind: 'report',
      raidId: 'r1',
      role: 'attacker',
      won: false,
      opponentId: 'bob',
      opponentName: 'Port de Bob',
      loot: {},
    })
    expect(noticeOf(state, 'report', 'bob')).toEqual({
      kind: 'report',
      raidId: 'r1',
      role: 'defender',
      won: true,
      opponentId: 'alice',
      opponentName: 'Alice',
      loot: {},
    })
    expect(noticeOf(state, 'report', 'carol')).toBeNull()
  })

  it('règle 10 : un village sans posture choisie défend en blocus', () => {
    expect(arriveAtVillage(null).state.battle?.posture).toBe('blockade')
  })

  it('règle 9 : une flotte victorieuse demande le butin de ses cales au village', () => {
    const { state, requests } = arriveAtVillage('ram')
    expect(state.battle).toMatchObject({ attack: 45, defense: 20, victory: true })
    expect(state.status).toBe('plundering')
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'r1:plunder-1',
        playerId: 'bob',
        resources: { wood: 30, stone: 15, gold: 6 },
      },
    ])

    const done = play(state, reply('r1:plunder-1', 'withdrawn'))
    expect(done.state).toMatchObject({ status: 'returned', loot: { wood: 30, stone: 15, gold: 6 } })
    expect(done.requests[0]).toEqual({
      kind: 'deposit',
      transferId: 'r1:loot',
      playerId: 'alice',
      resources: { wood: 30, stone: 15, gold: 6 },
    })
    expect(done.requests).toHaveLength(3)
  })

  it('règle 9 : réduit le butin une seule fois à ce que possède le village', () => {
    const fought = arriveAtVillage('ram').state
    const reduced = play(fought, reply('r1:plunder-1', 'refused', { stone: 5, gold: 6 }))
    expect(reduced.requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'r1:plunder-2',
        playerId: 'bob',
        resources: { wood: 30, stone: 10 },
      },
    ])
    const empty = play(reduced.state, reply('r1:plunder-2', 'refused', { wood: 1 }))
    expect(empty.state).toMatchObject({ status: 'returned', loot: {} })
    expect(empty.requests.map((r) => r.kind)).toEqual(['notice', 'notice'])
  })

  it('règle 9 : rentre sans butin lorsque le village ne possède rien', () => {
    const fought = arriveAtVillage('ram').state
    const { state } = play(
      fought,
      reply('r1:plunder-1', 'refused', { wood: 30, stone: 15, gold: 6 }),
    )
    expect(state).toMatchObject({ status: 'returned', loot: {} })
  })
})

describe('Flotte - îles pirates', () => {
  const pirates = launch({
    target: { kind: 'pirates', islandId: 'misty-reef' },
    ships: 4,
    tactic: 'ram',
  })
  const sailing = play(play(initialState, pirates).state, reply('r1:provision', 'withdrawn')).state

  it("règle 11 : le capitaine contre la tactique favorite de l'attaquant", () => {
    const { state } = play(
      sailing,
      { type: 'ResolveArrival', context: { kind: 'pirates', history: ['ram', 'ram'] } },
      sailing.arrivesAt,
    )
    expect(state.battle).toEqual({ attack: 20, defense: 25, posture: 'board', victory: false })
  })

  it("pille le trésor de l'île dès la victoire, sans passer par un village", () => {
    const { state, requests } = play(
      sailing,
      { type: 'ResolveArrival', context: { kind: 'pirates', history: ['board'] } },
      sailing.arrivesAt,
    )
    expect(state).toMatchObject({ status: 'returned', loot: { wood: 40, gold: 8 } })
    expect(requests[0]).toMatchObject({
      kind: 'deposit',
      transferId: 'r1:loot',
      resources: { wood: 40, gold: 8 },
    })
    expect(requests).toHaveLength(2)
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

describe("Flotte - vue d'un raid", () => {
  it('cache au défenseur la tactique avant la bataille, et le raid à tout autre joueur', () => {
    expect(toView(atSea, 'alice')).toMatchObject({
      role: 'attacker',
      tactic: 'board',
      cost: { wood: 45 },
    })
    expect(toView(atSea, 'bob')).toMatchObject({ role: 'defender', tactic: null, cost: null })
    expect(toView(atSea, 'carol')).toBeNull()
    expect(toView(arriveAtVillage('ram').state, 'bob')?.tactic).toBe('board')
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
