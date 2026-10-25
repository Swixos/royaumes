/**
 * Village domain, following the decider pattern:
 *   decide(state, command, now) -> events or domain error
 *   evolve(state, event)        -> new state
 * Pure TypeScript: it only imports the domain catalog.
 *
 * @packageDocumentation
 */
import {
  BASE_COSTS,
  BUILDINGS,
  type Building,
  buildDuration,
  COST_EXPONENT,
  hiddenAmount,
  type Levels,
  MAX_LEVEL,
  PRODUCERS,
  PRODUCTION,
  QUEUE_SLOTS,
  REQUIREMENTS,
  RESOURCES,
  type Resource,
  STARTING_LEVELS,
  STARTING_STOCK,
  type Stock,
  warehouseCapacity,
} from './catalog'

/** Upgrade ordered and paid, whose building rises a level once it is complete. */
export interface Construction {
  /** Building under construction. */
  building: Building
  /** Level reached once complete. */
  toLevel: number
  /** Time in milliseconds at which the construction is complete. */
  completesAt: number
}

/** State of a village, rebuilt from its events. */
export interface VillageState {
  /** False until the village is founded. */
  founded: boolean
  /** Village name. */
  name: string
  /** Stock computed at `asOf`, decimals kept. */
  stock: Stock
  /** Level of each building, constructions complete at `asOf` included. */
  levels: Levels
  /** Constructions not complete at `asOf`, in order of completion. */
  queue: Construction[]
  /** Time in milliseconds at which the stock was last computed. */
  asOf: number
  /**
   * Resource transfers already processed, by identifier, with their outcome. They make
   * transfer commands idempotent: a known identifier is ignored.
   */
  transfers: Record<string, TransferOutcome>
}

/** Outcome of a resource transfer. */
export type TransferOutcome = 'withdrawn' | 'refused' | 'deposited'

/** State of a village before any event. */
export const initialState: VillageState = {
  founded: false,
  name: '',
  stock: { wood: 0, stone: 0, gold: 0 },
  levels: Object.fromEntries(BUILDINGS.map((building) => [building, 0])) as Levels,
  queue: [],
  asOf: 0,
  transfers: {},
}

/** Facts recorded for a village. */
export type VillageEvent =
  | { type: 'VillageFounded'; data: { name: string; at: number } }
  /**
   * Upgrade ordered and paid at `at`. The building rises a level at `completesAt`; an
   * event recorded before construction times existed has none, and rose at once.
   */
  | {
      type: 'BuildingUpgraded'
      data: {
        building: Building
        toLevel: number
        cost: Partial<Stock>
        at: number
        completesAt?: number
      }
    }
  /**
   * Resource transfers requested by another module. Each one carries the transfer
   * identifier, chosen by the requester, which identifies a duplicate.
   */
  | {
      type: 'ResourcesWithdrawn'
      data: { transferId: string; resources: Partial<Stock>; at: number }
    }
  | {
      type: 'WithdrawalRefused'
      data: { transferId: string; missing: Partial<Stock>; at: number }
    }
  | {
      type: 'ResourcesDeposited'
      data: { transferId: string; resources: Partial<Stock>; at: number }
    }

/** Requests a player can make on their village. */
export type VillageCommand =
  | { type: 'FoundVillage'; name: string }
  | { type: 'UpgradeBuilding'; building: Building }
  | TransferCommand

/** Resource transfer commands, sent by another module rather than by the player. */
export type TransferCommand =
  | {
      type: 'WithdrawResources'
      transferId: string
      resources: Partial<Stock>
      /** True for a plunder: the resources hidden by the warehouse cannot be taken. */
      plunder?: boolean
    }
  | { type: 'DepositResources'; transferId: string; resources: Partial<Stock> }

/** Business reasons for refusing a command. */
export type DomainError =
  | { code: 'ALREADY_FOUNDED' }
  | { code: 'NOT_FOUNDED' }
  | { code: 'MAX_LEVEL_REACHED'; building: Building }
  | { code: 'INSUFFICIENT_RESOURCES'; missing: Partial<Stock> }
  | { code: 'REQUIREMENTS_NOT_MET'; building: Building; missing: Partial<Levels> }
  | { code: 'QUEUE_FULL'; slots: number }

/** Outcome of {@link decide}: the events to record, or the refusal. */
export type Decision = { ok: true; events: VillageEvent[] } | { ok: false; error: DomainError }

/**
 * Computes the production rate of each resource.
 *
 * @param levels - Building levels.
 * @returns Production per minute of each resource.
 */
export function productionPerMinute(levels: Levels): Stock {
  const rates: Stock = { wood: 0, stone: 0, gold: 0 }
  for (const producer of PRODUCERS) {
    const { produces, perMinute } = PRODUCTION[producer]
    rates[produces] += perMinute * levels[producer]
  }
  return rates
}

/**
 * Adds the production of a period to a stock, up to the capacity of the warehouse. A
 * stock already above the capacity, after a delivery, is kept but no longer grows.
 *
 * @param stock - Stock at the start of the period.
 * @param rates - Production per minute of each resource.
 * @param minutes - Length of the period, in minutes.
 * @param capacity - Capacity of the warehouse, per resource.
 * @returns The stock at the end of the period.
 */
export function produce(stock: Stock, rates: Stock, minutes: number, capacity: number): Stock {
  const result = { ...stock }
  for (const resource of RESOURCES) {
    if (result[resource] >= capacity) continue
    result[resource] = Math.min(capacity, result[resource] + rates[resource] * minutes)
  }
  return result
}

/**
 * Adds to the stock the production accumulated until `at`, without completing any
 * construction.
 *
 * @param state - Current village state.
 * @param at - Time in milliseconds to compute the stock at.
 * @returns The state computed at `at`.
 */
function produceUntil(state: VillageState, at: number): VillageState {
  if (at <= state.asOf) return state
  const minutes = (at - state.asOf) / 60_000
  const capacity = warehouseCapacity(state.levels.warehouse)
  return {
    ...state,
    stock: produce(state.stock, productionPerMinute(state.levels), minutes, capacity),
    asOf: at,
  }
}

/**
 * Brings a village to time `at`: each construction complete by then raises its building
 * at its own time of completion, so the production and the capacity change exactly when
 * it is complete. The given state is never modified.
 *
 * @param state - Current village state.
 * @param at - Time in milliseconds to compute the village at.
 * @returns A new state computed at `at`, or the same state if the village is not founded
 *   or `at` is not later than `state.asOf`.
 */
export function accrue(state: VillageState, at: number): VillageState {
  if (!state.founded || at <= state.asOf) return state
  let current = state
  while (current.queue.length > 0 && current.queue[0].completesAt <= at) {
    const [done, ...rest] = current.queue
    current = produceUntil(current, done.completesAt)
    current = {
      ...current,
      levels: { ...current.levels, [done.building]: done.toLevel },
      queue: rest,
    }
  }
  return produceUntil(current, at)
}

/**
 * Level a building will have once its constructions under way are complete.
 *
 * @param state - Current village state.
 * @param building - Building concerned.
 * @returns The planned level.
 */
export function plannedLevel(state: VillageState, building: Building): number {
  return state.queue.reduce(
    (level, item) => (item.building === building ? Math.max(level, item.toLevel) : level),
    state.levels[building],
  )
}

/**
 * Lists the levels a building still needs before its first construction.
 *
 * @param levels - Current building levels.
 * @param building - Building to build.
 * @returns The missing levels, by building; empty if the building can be built.
 */
export function missingRequirements(levels: Levels, building: Building): Partial<Levels> {
  const missing: Partial<Levels> = {}
  for (const [needed, level] of Object.entries(REQUIREMENTS[building])) {
    if (levels[needed as Building] < (level ?? 0)) missing[needed as Building] = level
  }
  return missing
}

/**
 * Applies an event to a state. Founding starts again from the initial state but keeps
 * the transfers already processed: a withdrawal may have been refused to a player who
 * had not founded their village yet. A transfer applies to the stock computed at its
 * time, like a cost; a refusal leaves the stock unchanged and is kept, so it is repeated
 * identically.
 *
 * @param state - Current village state.
 * @param event - Event to apply.
 * @returns The new state; the given state is never modified.
 */
export function evolve(state: VillageState, event: VillageEvent): VillageState {
  switch (event.type) {
    case 'VillageFounded':
      return {
        ...initialState,
        founded: true,
        name: event.data.name,
        stock: { ...STARTING_STOCK },
        levels: { ...STARTING_LEVELS },
        asOf: event.data.at,
        transfers: state.transfers,
      }

    case 'BuildingUpgraded': {
      const { building, toLevel, cost, at } = event.data
      const current = accrue(state, at)
      const stock = addTo(current.stock, cost, -1)
      const completesAt = event.data.completesAt ?? at
      if (completesAt <= at) {
        return { ...current, stock, levels: { ...current.levels, [building]: toLevel } }
      }
      return { ...current, stock, queue: [...current.queue, { building, toLevel, completesAt }] }
    }
    case 'ResourcesWithdrawn': {
      const current = accrue(state, event.data.at)
      return {
        ...current,
        stock: addTo(current.stock, event.data.resources, -1),
        transfers: { ...current.transfers, [event.data.transferId]: 'withdrawn' },
      }
    }

    case 'WithdrawalRefused':
      return { ...state, transfers: { ...state.transfers, [event.data.transferId]: 'refused' } }

    case 'ResourcesDeposited': {
      const current = accrue(state, event.data.at)
      return {
        ...current,
        stock: addTo(current.stock, event.data.resources, 1),
        transfers: { ...current.transfers, [event.data.transferId]: 'deposited' },
      }
    }
  }
}

/**
 * Adds amounts to a stock, or removes them.
 *
 * @param stock - Current stock.
 * @param amounts - Amounts to add or remove.
 * @param sign - 1 to add, -1 to remove.
 * @returns A new stock; the given one is never modified.
 */
function addTo(stock: Stock, amounts: Partial<Stock>, sign: 1 | -1): Stock {
  const result = { ...stock }
  for (const [resource, amount] of Object.entries(amounts)) {
    result[resource as Resource] += sign * (amount ?? 0)
  }
  return result
}

/**
 * Rebuilds a village from its events.
 *
 * @param events - Events of the village, in order.
 * @returns The resulting state.
 */
export function replay(events: VillageEvent[]): VillageState {
  return events.reduce(evolve, initialState)
}

/**
 * Computes the cost of an upgrade.
 *
 * @param building - Building to upgrade.
 * @param level - Current level of the building.
 * @returns The cost to go from `level` to `level + 1`.
 */
export function upgradeCost(building: Building, level: number): Partial<Stock> {
  const factor = (level + 1) ** COST_EXPONENT
  const cost: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(BASE_COSTS[building])) {
    cost[resource as Resource] = Math.round((amount ?? 0) * factor)
  }
  return cost
}

/**
 * Computes what is missing to pay a cost.
 *
 * @param stock - Available stock.
 * @param cost - Cost to pay.
 * @returns Missing amounts, rounded up; empty if the stock is enough.
 */
function missingFor(stock: Stock, cost: Partial<Stock>): Partial<Stock> {
  const missing: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(cost)) {
    const lack = (amount ?? 0) - stock[resource as Resource]
    if (lack > 0) missing[resource as Resource] = Math.ceil(lack)
  }
  return missing
}

/**
 * Decides whether a command is accepted. Transfer commands are idempotent: a transfer
 * already processed produces no new event. The stock is evaluated at the time of the
 * withdrawal, production included; a village not founded has an empty stock, so a
 * withdrawal there is simply refused. A plunder cannot take what the warehouse hides. An
 * upgrade is paid when ordered and completes later: it waits for the constructions
 * already under way, and its building rises a level once its time has passed. A refusal is recorded as an event, not returned
 * as a domain error.
 *
 * @param state - Current village state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record, or the domain error.
 */
export function decide(state: VillageState, command: VillageCommand, now: number): Decision {
  switch (command.type) {
    case 'FoundVillage':
      if (state.founded) return { ok: false, error: { code: 'ALREADY_FOUNDED' } }
      return {
        ok: true,
        events: [{ type: 'VillageFounded', data: { name: command.name, at: now } }],
      }

    case 'UpgradeBuilding': {
      if (!state.founded) return { ok: false, error: { code: 'NOT_FOUNDED' } }
      const { building } = command
      const current = accrue(state, now)
      const level = plannedLevel(current, building)
      if (level >= MAX_LEVEL) {
        return { ok: false, error: { code: 'MAX_LEVEL_REACHED', building } }
      }
      const lacking = missingRequirements(current.levels, building)
      if (level === 0 && Object.keys(lacking).length > 0) {
        return { ok: false, error: { code: 'REQUIREMENTS_NOT_MET', building, missing: lacking } }
      }
      if (current.queue.length >= QUEUE_SLOTS) {
        return { ok: false, error: { code: 'QUEUE_FULL', slots: QUEUE_SLOTS } }
      }
      const cost = upgradeCost(building, level)
      const missing = missingFor(current.stock, cost)
      if (Object.keys(missing).length > 0) {
        return { ok: false, error: { code: 'INSUFFICIENT_RESOURCES', missing } }
      }
      const start = Math.max(now, current.queue.at(-1)?.completesAt ?? now)
      const completesAt = start + buildDuration(building, level, current.levels.senate)
      return {
        ok: true,
        events: [
          {
            type: 'BuildingUpgraded',
            data: { building, toLevel: level + 1, cost, at: now, completesAt },
          },
        ],
      }
    }
    case 'WithdrawResources': {
      if (command.transferId in state.transfers) return { ok: true, events: [] }
      const current = accrue(state, now)
      const hidden = command.plunder ? hiddenAmount(current.levels.warehouse) : 0
      const takeable = addTo(current.stock, { wood: hidden, stone: hidden, gold: hidden }, -1)
      const missing = missingFor(takeable, command.resources)
      const { transferId, resources } = command
      return {
        ok: true,
        events:
          Object.keys(missing).length > 0
            ? [{ type: 'WithdrawalRefused', data: { transferId, missing, at: now } }]
            : [{ type: 'ResourcesWithdrawn', data: { transferId, resources, at: now } }],
      }
    }

    case 'DepositResources': {
      if (command.transferId in state.transfers) return { ok: true, events: [] }
      if (!state.founded) return { ok: false, error: { code: 'NOT_FOUNDED' } }
      return {
        ok: true,
        events: [
          {
            type: 'ResourcesDeposited',
            data: { transferId: command.transferId, resources: command.resources, at: now },
          },
        ],
      }
    }
  }
}

/** Snapshot of a village sent to the interface. */
export interface VillageView {
  /** Village name. */
  name: string
  /** Stock at `asOf`. */
  stock: Stock
  /** Level of each building. */
  levels: Levels
  /** Constructions under way or waiting, in order of completion. */
  queue: Construction[]
  /** Number of constructions the queue can hold. */
  queueSlots: number
  /** Capacity of the warehouse, per resource. */
  capacity: number
  /** Amount of each resource hidden from plunderers. */
  hidden: number
  /** Production per minute of each resource. */
  ratesPerMinute: Stock
  /** Cost of the next upgrade of each building, after the queue; `null` at max level. */
  nextCosts: Record<Building, Partial<Stock> | null>
  /** Duration of the next upgrade of each building, in milliseconds; `null` at max level. */
  nextDurations: Record<Building, number | null>
  /** Levels each building not yet built still needs; empty when it can be built. */
  requirements: Record<Building, Partial<Levels>>
  /** Time in milliseconds at which the view was computed. */
  asOf: number
}

/**
 * Builds the view of a village for the interface.
 *
 * @param state - Current village state.
 * @param now - Current time in milliseconds.
 * @returns The view computed at `now`.
 */
export function toView(state: VillageState, now: number): VillageView {
  const current = accrue(state, now)
  const nextCosts = {} as Record<Building, Partial<Stock> | null>
  const nextDurations = {} as Record<Building, number | null>
  const requirements = {} as Record<Building, Partial<Levels>>
  for (const building of BUILDINGS) {
    const level = plannedLevel(current, building)
    const maxed = level >= MAX_LEVEL
    nextCosts[building] = maxed ? null : upgradeCost(building, level)
    nextDurations[building] = maxed ? null : buildDuration(building, level, current.levels.senate)
    requirements[building] = level === 0 ? missingRequirements(current.levels, building) : {}
  }
  return {
    name: current.name,
    stock: current.stock,
    levels: current.levels,
    queue: current.queue,
    queueSlots: QUEUE_SLOTS,
    capacity: warehouseCapacity(current.levels.warehouse),
    hidden: hiddenAmount(current.levels.warehouse),
    ratesPerMinute: productionPerMinute(current.levels),
    nextCosts,
    nextDurations,
    requirements,
    asOf: now,
  }
}

/**
 * Extrapolates the stock of a view to a later time, so the interface can
 * update the display without calling the server.
 *
 * @param view - Last view received.
 * @param at - Time in milliseconds to extrapolate to.
 * @returns The stock at `at`.
 */
export function stockAt(view: VillageView, at: number): Stock {
  const minutes = Math.max(0, at - view.asOf) / 60_000
  return produce(view.stock, view.ratesPerMinute, minutes, view.capacity)
}
