/**
 * Domaine du Village, selon le modèle decider :
 *   decide(état, commande, maintenant) -> événements ou erreur métier
 *   evolve(état, événement)            -> nouvel état
 * Ce fichier est écrit en TypeScript pur : il n'importe que le catalogue du domaine.
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

export interface VillageState {
  /** Faux tant que le village n'a pas été fondé. */
  founded: boolean
  name: string
  /** Stock calculé à l'instant asOf (valeurs décimales conservées). */
  stock: Stock
  levels: Levels
  /** Instant, en millisecondes, auquel le stock a été calculé pour la dernière fois. */
  asOf: number
}

/** État d'un village qui n'a encore connu aucun événement. */
export const initialState: VillageState = {
  founded: false,
  name: '',
  stock: { wood: 0, stone: 0, gold: 0 },
  levels: { sawmill: 0, quarry: 0, mine: 0 },
  asOf: 0,
}

export type VillageEvent =
  | { type: 'VillageFounded'; data: { name: string; at: number } }
  | {
      type: 'BuildingUpgraded'
      data: { building: Building; toLevel: number; cost: Partial<Stock>; at: number }
    }

export type VillageCommand =
  | { type: 'FoundVillage'; name: string }
  | { type: 'UpgradeBuilding'; building: Building }

export type DomainError =
  | { code: 'ALREADY_FOUNDED' }
  | { code: 'NOT_FOUNDED' }
  | { code: 'MAX_LEVEL_REACHED'; building: Building }
  | { code: 'INSUFFICIENT_RESOURCES'; missing: Partial<Stock> }

export type Decision = { ok: true; events: VillageEvent[] } | { ok: false; error: DomainError }

/** Production par minute de chaque ressource, pour des niveaux donnés. */
export function productionPerMinute(levels: Levels): Stock {
  const rates: Stock = { wood: 0, stone: 0, gold: 0 }
  for (const building of BUILDINGS) {
    const { produces, perMinute } = CATALOG[building]
    rates[produces] += perMinute * levels[building]
  }
  return rates
}

/**
 * Ajoute au stock la production accumulée entre state.asOf et l'instant at,
 * puis fait de at le nouvel instant de référence.
 * Un nouvel objet est renvoyé : l'état reçu n'est jamais modifié.
 */
export function accrue(state: VillageState, at: number): VillageState {
  if (!state.founded || at <= state.asOf) return state
  const minutes = (at - state.asOf) / 60_000
  const rates = productionPerMinute(state.levels)
  const stock = { ...state.stock }
  for (const resource of RESOURCES) stock[resource] += rates[resource] * minutes
  return { ...state, stock, asOf: at }
}

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
  }
}

/** Reconstruit l'état d'un village à partir de la suite de ses événements. */
export function replay(events: VillageEvent[]): VillageState {
  return events.reduce(evolve, initialState)
}

/** Coût pour faire passer un bâtiment du niveau level au niveau level + 1. */
export function upgradeCost(building: Building, level: number): Partial<Stock> {
  const factor = (level + 1) ** COST_EXPONENT
  const cost: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(CATALOG[building].baseCost)) {
    cost[resource as Resource] = Math.round((amount ?? 0) * factor)
  }
  return cost
}

/** Quantités manquantes pour payer un coût ; objet vide si le stock suffit. */
function missingFor(stock: Stock, cost: Partial<Stock>): Partial<Stock> {
  const missing: Partial<Stock> = {}
  for (const [resource, amount] of Object.entries(cost)) {
    const lack = (amount ?? 0) - stock[resource as Resource]
    if (lack > 0) missing[resource as Resource] = Math.ceil(lack)
  }
  return missing
}

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
  }
}

export interface VillageView {
  name: string
  stock: Stock
  levels: Levels
  ratesPerMinute: Stock
  /** Coût de la prochaine amélioration de chaque bâtiment ; null au niveau maximal. */
  nextCosts: Record<Building, Partial<Stock> | null>
  /** Instant auquel la vue a été calculée. */
  asOf: number
}

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
 * Stock extrapolé à partir d'une vue, à un instant ultérieur.
 * Utilisé par l'interface pour faire évoluer l'affichage sans interroger le serveur.
 */
export function stockAt(view: VillageView, at: number): Stock {
  const minutes = Math.max(0, at - view.asOf) / 60_000
  const stock = { ...view.stock }
  for (const resource of RESOURCES) stock[resource] += view.ratesPerMinute[resource] * minutes
  return stock
}
