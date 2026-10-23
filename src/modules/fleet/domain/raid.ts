/**
 * Fleet domain: a raid and its fate, following the decider pattern. The state of a raid
 * sums up the progress of the raid saga, from the equipment of the fleet to its return.
 * Pure TypeScript: it imports no other module.
 *
 * @packageDocumentation
 */
import {
  type Amounts,
  type Battle,
  DEFAULT_POSTURE,
  dayOf,
  equipmentCost,
  fight,
  holdOf,
  isEmpty,
  islandOf,
  MAX_RAIDS_AT_SEA,
  MAX_SHIPS,
  MIN_SHIPS,
  pirateLoot,
  reducedLoot,
  type Tactic,
  travelMinutes,
  villageDefense,
} from './naval'
import { captainPosture } from './pirates'

/** Target of a raid: another player's village, or a pirate island. */
export type Target =
  | { kind: 'village'; playerId: string; name: string }
  | { kind: 'pirates'; islandId: string; name: string }

/** States of a raid; the last five are final. */
export type RaidStatus =
  | 'provisioning'
  | 'at-sea'
  | 'plundering'
  | 'returned'
  | 'sunk'
  | 'recalled'
  | 'cancelled'
  | 'aborted'

/** Statuses of a raid whose fleet is still out, counted by rule 3. */
export const OUT_STATUSES: readonly RaidStatus[] = ['provisioning', 'at-sea', 'plundering']

/** State of a raid, rebuilt from its events. */
export interface RaidState {
  /** False until the raid is launched. */
  exists: boolean
  /** Raid identifier. */
  raidId: string
  /** Identifier of the attacker. */
  attackerId: string
  /** Name of the attacker. */
  attackerName: string
  /** Target of the raid. */
  target: Target
  /** Number of triremes. */
  ships: number
  /** Tactic of the fleet. */
  tactic: Tactic
  /** Equipment withdrawn from the attacker's village. */
  cost: Amounts
  /** Crossing time in milliseconds. */
  travelMs: number
  /** Launch time in milliseconds. */
  launchedAt: number
  /** Time the fleet sailed; 0 before. */
  sailedAt: number
  /** Arrival time of the fleet; 0 before it sails. */
  arrivesAt: number
  /** Progress of the raid saga. */
  status: RaidStatus
  /** Battle outcome, once fought. */
  battle: Battle | null
  /** Plunder asked from the defender's village at the current attempt. */
  plunderAsked: Amounts
  /** Number of the current plunder attempt: 1, then 2 after a refusal. */
  plunderAttempt: number
  /** Plunder brought back, once known. */
  loot: Amounts | null
  /** Equipment the attacker lacked, when the raid was cancelled. */
  missing: Amounts | null
}

/** State of a raid before any event. */
export const initialState: RaidState = {
  exists: false,
  raidId: '',
  attackerId: '',
  attackerName: '',
  target: { kind: 'pirates', islandId: '', name: '' },
  ships: 0,
  tactic: DEFAULT_POSTURE,
  cost: {},
  travelMs: 0,
  launchedAt: 0,
  sailedAt: 0,
  arrivesAt: 0,
  status: 'provisioning',
  battle: null,
  plunderAsked: {},
  plunderAttempt: 0,
  loot: null,
  missing: null,
}

/** Facts recorded for a raid. */
export type RaidEvent =
  | {
      type: 'RaidLaunched'
      data: {
        raidId: string
        attackerId: string
        attackerName: string
        target: Target
        ships: number
        tactic: Tactic
        cost: Amounts
        travelMs: number
        at: number
      }
    }
  | { type: 'RaidCancelled'; data: { missing: Amounts; at: number } }
  | { type: 'FleetSailed'; data: { arrivesAt: number; at: number } }
  | { type: 'FleetRecalled'; data: { at: number } }
  | { type: 'RaidAborted'; data: { reason: 'target-gone'; at: number } }
  | {
      type: 'BattleFought'
      data: { attack: number; defense: number; posture: Tactic; victory: boolean; at: number }
    }
  | { type: 'PlunderReduced'; data: { asked: Amounts; attempt: number; at: number } }
  | { type: 'RaidPlundered'; data: { attackerId: string; loot: Amounts; at: number } }

/**
 * What the attacker's other raids tell about a launch, gathered by the application
 * layer: the domain decides on it.
 */
export interface LaunchContext {
  /** Number of the attacker's raids whose fleet is still out (rule 3). */
  raidsOut: number
  /** True if the targeted player founded a village (rule 2). */
  targetHasVillage: boolean
  /** Days on which the attacker already raided the targeted island (rule 12). */
  islandRaidDays: number[]
}

/** Defense met by a fleet at its arrival, read by the application layer. */
export type ArrivalContext =
  /** Village of a player: its posture and its number of building upgrades. */
  | { kind: 'village'; posture: Tactic | null; upgrades: number }
  /** Pirate island: the attacker's past tactics against the pirates. */
  | { kind: 'pirates'; history: Tactic[] }
  /** The targeted village no longer exists. */
  | null

/**
 * Requests on a raid: player commands, then saga commands coming from outbox messages
 * (`RecordTransferResult`, `ResolveArrival`).
 */
export type RaidCommand =
  | {
      type: 'LaunchRaid'
      raidId: string
      attackerId: string
      attackerName: string
      target:
        | { kind: 'village'; playerId: string; name: string }
        | { kind: 'pirates'; islandId: string }
      ships: number
      tactic: Tactic
      context: LaunchContext
    }
  | { type: 'RecallFleet'; playerId: string }
  | { type: 'ResolveArrival'; context: ArrivalContext }
  | {
      type: 'RecordTransferResult'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }

/** Business reasons for refusing a command. */
export type RaidError =
  | { code: 'RAID_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'INVALID_FLEET' }
  | { code: 'OWN_VILLAGE' }
  | { code: 'UNKNOWN_TARGET' }
  | { code: 'TOO_MANY_RAIDS'; limit: number }
  | { code: 'TREASURE_TAKEN' }
  | { code: 'NOT_ATTACKER' }
  | { code: 'NOT_AT_SEA'; status: RaidStatus }
  | { code: 'ALREADY_ARRIVED' }
  | { code: 'NOT_ARRIVED' }

/** Outcome of {@link decide}: the events to record, or the refusal. */
export type Decision = { ok: true; events: RaidEvent[] } | { ok: false; error: RaidError }

/**
 * Builds a refusal.
 *
 * @param error - Business reason.
 * @returns The failed decision.
 */
const fail = (error: RaidError): Decision => ({ ok: false, error })

/**
 * Builds an accepted decision.
 *
 * @param events - Events to record; none for a command without effect.
 * @returns The accepted decision.
 */
const accept = (...events: RaidEvent[]): Decision => ({ ok: true, events })

/**
 * Builds the identifier of a resource transfer. It is set by the raid and the saga step,
 * and serves as idempotency key for the village module.
 *
 * @param raidId - Raid identifier.
 * @param step - Saga step, such as "provision" or "plunder-1".
 * @returns The transfer identifier.
 */
export const transferIdOf = (raidId: string, step: string) => `${raidId}:${step}`

/**
 * Finds the raid a transfer belongs to.
 *
 * @param transferId - Transfer identifier.
 * @returns The raid identifier.
 */
export const raidIdOf = (transferId: string) => transferId.slice(0, transferId.indexOf(':'))

/**
 * Applies an event to a state.
 *
 * @param state - Current raid state.
 * @param event - Event to apply.
 * @returns The new state; the given state is never modified.
 */
export function evolve(state: RaidState, event: RaidEvent): RaidState {
  switch (event.type) {
    case 'RaidLaunched':
      return {
        ...initialState,
        exists: true,
        raidId: event.data.raidId,
        attackerId: event.data.attackerId,
        attackerName: event.data.attackerName,
        target: event.data.target,
        ships: event.data.ships,
        tactic: event.data.tactic,
        cost: event.data.cost,
        travelMs: event.data.travelMs,
        launchedAt: event.data.at,
      }
    case 'RaidCancelled':
      return { ...state, status: 'cancelled', missing: event.data.missing }
    case 'FleetSailed':
      return {
        ...state,
        status: 'at-sea',
        sailedAt: event.data.at,
        arrivesAt: event.data.arrivesAt,
      }
    case 'FleetRecalled':
      return { ...state, status: 'recalled' }
    case 'RaidAborted':
      return { ...state, status: 'aborted' }
    case 'BattleFought': {
      const { attack, defense, posture, victory } = event.data
      return {
        ...state,
        status: victory ? 'plundering' : 'sunk',
        battle: { attack, defense, posture, victory },
        plunderAsked: victory ? holdOf(state.ships) : {},
        plunderAttempt: victory ? 1 : 0,
      }
    }
    case 'PlunderReduced':
      return { ...state, plunderAsked: event.data.asked, plunderAttempt: event.data.attempt }
    case 'RaidPlundered':
      return { ...state, status: 'returned', loot: event.data.loot }
  }
}

/**
 * Rebuilds a raid from its events.
 *
 * @param events - Events of the raid, in order.
 * @returns The current state.
 */
export const replay = (events: RaidEvent[]) => events.reduce(evolve, initialState)

/**
 * Decides on the launch of a raid (rules 1 to 5 and 12).
 *
 * @param command - Launch command.
 * @param now - Current time in milliseconds.
 * @returns The launch event, or the domain error.
 */
function launch(command: Extract<RaidCommand, { type: 'LaunchRaid' }>, now: number): Decision {
  const { raidId, attackerId, attackerName, ships, tactic, context } = command
  if (!Number.isInteger(ships) || ships < MIN_SHIPS || ships > MAX_SHIPS) {
    return fail({ code: 'INVALID_FLEET' })
  }

  let target: Target
  let travelMs: number
  if (command.target.kind === 'village') {
    if (command.target.playerId === attackerId) return fail({ code: 'OWN_VILLAGE' })
    if (!context.targetHasVillage) return fail({ code: 'UNKNOWN_TARGET' })
    target = command.target
    travelMs = travelMinutes(attackerId, command.target.playerId) * 60_000
  } else {
    const island = islandOf(command.target.islandId)
    if (!island) return fail({ code: 'UNKNOWN_TARGET' })
    if (context.islandRaidDays.includes(dayOf(now))) return fail({ code: 'TREASURE_TAKEN' })
    target = { kind: 'pirates', islandId: island.id, name: island.name }
    travelMs = island.travelMinutes * 60_000
  }

  if (context.raidsOut >= MAX_RAIDS_AT_SEA) {
    return fail({ code: 'TOO_MANY_RAIDS', limit: MAX_RAIDS_AT_SEA })
  }

  return accept({
    type: 'RaidLaunched',
    data: {
      raidId,
      attackerId,
      attackerName,
      target,
      ships,
      tactic,
      cost: equipmentCost(ships),
      travelMs,
      at: now,
    },
  })
}

/**
 * Decides on the arrival of a fleet (rules 7, 8, 9 and 11). A village that disappeared
 * during the crossing aborts the raid, and its equipment is refunded. Against a pirate
 * island, the plunder is taken at once; against a village, it is asked from the
 * village module.
 *
 * @param state - Raid at sea.
 * @param context - Defense met at the arrival.
 * @param now - Current time in milliseconds.
 * @returns The events of the arrival.
 */
function arrive(state: RaidState, context: ArrivalContext, now: number): Decision {
  if (context === null) {
    return accept({ type: 'RaidAborted', data: { reason: 'target-gone', at: now } })
  }
  const island = state.target.kind === 'pirates' ? islandOf(state.target.islandId) : undefined

  const posture =
    context.kind === 'pirates'
      ? captainPosture(context.history)
      : (context.posture ?? DEFAULT_POSTURE)
  const defense =
    context.kind === 'pirates' ? (island?.defense ?? 0) : villageDefense(context.upgrades)
  const battle = fight(state.ships, state.tactic, posture, defense)
  const fought: RaidEvent = { type: 'BattleFought', data: { ...battle, at: now } }

  if (battle.victory && island) {
    return accept(fought, {
      type: 'RaidPlundered',
      data: { attackerId: state.attackerId, loot: pirateLoot(island, state.ships), at: now },
    })
  }
  return accept(fought)
}

/**
 * Decides whether a command is accepted. The arrival is refused before its time, so the
 * reminder message is retried later; it has no effect on a fleet no longer at sea.
 *
 * @param state - Current raid state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record, or the domain error.
 */
export function decide(state: RaidState, command: RaidCommand, now: number): Decision {
  if (command.type === 'LaunchRaid') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    return launch(command, now)
  }

  if (!state.exists) return fail({ code: 'RAID_NOT_FOUND' })

  switch (command.type) {
    case 'RecallFleet':
      if (command.playerId !== state.attackerId) return fail({ code: 'NOT_ATTACKER' })
      if (state.status !== 'at-sea') return fail({ code: 'NOT_AT_SEA', status: state.status })
      if (now >= state.arrivesAt) return fail({ code: 'ALREADY_ARRIVED' })
      return accept({ type: 'FleetRecalled', data: { at: now } })

    case 'ResolveArrival':
      if (state.status !== 'at-sea') return accept()
      if (now < state.arrivesAt) return fail({ code: 'NOT_ARRIVED' })
      return arrive(state, command.context, now)

    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)
  }
}

/**
 * Records the reply of the village module to a withdrawal: the equipment of the fleet,
 * or the plunder of the defender's village at the current attempt. Only the reply
 * expected in the current state moves the saga forward; any other reply (duplicate,
 * late reply, deposit) is ignored. A first refused plunder is reduced to what the village
 * holds; a second refusal, or nothing left to take, brings the fleet back empty.
 *
 * @param state - Current raid state.
 * @param result - Reply of the village module.
 * @param now - Current time in milliseconds.
 * @returns The events to record; none for an ignored reply.
 */
function recordTransferResult(
  state: RaidState,
  result: Extract<RaidCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const refused = result.outcome === 'refused'
  const missing = result.missing ?? {}

  if (
    state.status === 'provisioning' &&
    result.transferId === transferIdOf(state.raidId, 'provision')
  ) {
    return refused
      ? accept({ type: 'RaidCancelled', data: { missing, at: now } })
      : accept({ type: 'FleetSailed', data: { arrivesAt: now + state.travelMs, at: now } })
  }

  const plunder = transferIdOf(state.raidId, `plunder-${state.plunderAttempt}`)
  if (state.status === 'plundering' && result.transferId === plunder) {
    const plundered = (loot: Amounts): Decision =>
      accept({ type: 'RaidPlundered', data: { attackerId: state.attackerId, loot, at: now } })
    if (!refused) return plundered(state.plunderAsked)
    const reduced = reducedLoot(state.plunderAsked, missing)
    if (state.plunderAttempt > 1 || isEmpty(reduced)) return plundered({})
    return accept({
      type: 'PlunderReduced',
      data: { asked: reduced, attempt: state.plunderAttempt + 1, at: now },
    })
  }

  return accept()
}
