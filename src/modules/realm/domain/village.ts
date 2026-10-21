/**
 * Village domain, following the decider pattern:
 *   decide(state, command, now) -> events or domain error
 *   evolve(state, event)        -> new state
 * Pure TypeScript: it only imports the domain catalog.
 *
 * @packageDocumentation
 */
import {
  BUILDINGS,
  type Building,
  CATALOG,
  COST_EXPONENT,
  type Levels,
  MAX_LEVEL,
  RESOURCES,
  type Resource,
  STARTING_LEVELS,
  STARTING_STOCK,
  type Stock,
} from './catalog'

/** State of a village, rebuilt from its events. */
export interface VillageState {
  /** False until the village is founded. */
  founded: boolean
  /** Village name. */
  name: string
  /** Stock computed at `asOf`, decimals kept. */
  stock: Stock
  /** Level of each building. */
  levels: Levels
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
  levels: { sawmill: 0, quarry: 0, mine: 0 },
  asOf: 0,
  transfers: {},
}

/** Facts recorded for a village. */
export type VillageEvent =
  | { type: 'VillageFounded'; data: { name: string; at: number } }
  | {
      type: 'BuildingUpgraded'
      data: { building: Building; toLevel: number; cost: Partial<Stock>; at: number }
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
  | { type: 'WithdrawResources'; transferId: string; resources: Partial<Stock> }
  | { type: 'DepositResources'; transferId: string; resources: Partial<Stock> }

/** Business reasons for refusing a command. */
export type DomainError =
  | { code: 'ALREADY_FOUNDED' }
  | { code: 'NOT_FOUNDED' }
  | { code: 'MAX_LEVEL_REACHED'; building: Building }
  | { code: 'INSUFFICIENT_RESOURCES'; missing: Partial<Stock> }

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
  for (const building of BUILDINGS) {
    const { produces, perMinute } = CATALOG[building]
    rates[produces] += perMinute * levels[building]
  }
  return rates
}

/**
 * Adds the production accumulated between `state.asOf` and `at` to the stock.
 * The given state is never modified.
 *
 * @param state - Current village state.
 * @param at - Time in milliseconds to compute the stock at.
 * @returns A new state whose stock is computed at `at`, or the same state if
 *   the village is not founded or `at` is not later than `state.asOf`.
 */
export function accrue(state: VillageState, at: number): VillageState {
  if (!state.founded || at <= state.asOf) return state
  const minutes = (at - state.asOf) / 60_000
  const rates = productionPerMinute(state.levels)
  const stock = { ...state.stock }
  for (const resource of RESOURCES) stock[resource] += rates[resource] * minutes
  return { ...state, stock, asOf: at }
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
      const current = accrue(state, event.data.at)
      const stock = { ...current.stock }
      for (const [resource, amount] of Object.entries(event.data.cost)) {
        stock[resource as Resource] -= amount ?? 0
      }
      return {
        ...current,
        stock,
        levels: { ...current.levels, [event.data.building]: event.data.toLevel },
      }
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
  for (const [resource, amount] of Object.entries(CATALOG[building].baseCost)) {
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
 * withdrawal there is simply refused. A refusal is recorded as an event, not returned
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
      const level = state.levels[command.building]
      if (level >= MAX_LEVEL) {
        return { ok: false, error: { code: 'MAX_LEVEL_REACHED', building: command.building } }
      }
      const current = accrue(state, now)
      const cost = upgradeCost(command.building, level)
      const missing = missingFor(current.stock, cost)
      if (Object.keys(missing).length > 0) {
        return { ok: false, error: { code: 'INSUFFICIENT_RESOURCES', missing } }
      }
      return {
        ok: true,
        events: [
          {
            type: 'BuildingUpgraded',
            data: { building: command.building, toLevel: level + 1, cost, at: now },
          },
        ],
      }
    }
    case 'WithdrawResources': {
      if (command.transferId in state.transfers) return { ok: true, events: [] }
      const missing = missingFor(accrue(state, now).stock, command.resources)
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
  /** Production per minute of each resource. */
  ratesPerMinute: Stock
  /** Cost of the next upgrade of each building; `null` at max level. */
  nextCosts: Record<Building, Partial<Stock> | null>
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
  for (const building of BUILDINGS) {
    const level = current.levels[building]
    nextCosts[building] = level >= MAX_LEVEL ? null : upgradeCost(building, level)
  }
  return {
    name: current.name,
    stock: current.stock,
    levels: current.levels,
    ratesPerMinute: productionPerMinute(current.levels),
    nextCosts,
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
  const stock = { ...view.stock }
  for (const resource of RESOURCES) stock[resource] += view.ratesPerMinute[resource] * minutes
  return stock
}
