/**
 * Entries of the chronicle: what happened to a player, in every part of the game, told
 * in a few words. This file holds no database and no rendering library: the rules that
 * sort and tell the entries are tested on their own.
 *
 * @packageDocumentation
 */

/** Amounts of resources, as copied from the events. */
export type Amounts = Partial<Record<'wood' | 'stone' | 'gold', number>>

/** Fleet tactic, as copied from the events. */
export type Tactic = 'ram' | 'board' | 'blockade'

/** Fact told by an entry, with the data it needs. */
export type Fact =
  | { type: 'village-founded'; name: string }
  | {
      type: 'building-ordered'
      building: string
      toLevel: number
      cost: Amounts
      completesAt: number | null
    }
  | { type: 'raid-launched'; target: string; pirates: boolean; ships: number; tactic: Tactic }
  | { type: 'raid-cancelled'; target: string }
  | { type: 'fleet-recalled'; target: string }
  | { type: 'raid-aborted'; target: string }
  | { type: 'fleet-sighted'; attacker: string; ships: number; arrivesAt: number }
  | { type: 'fleet-turned-back'; attacker: string }
  | {
      type: 'battle'
      role: 'attacker' | 'defender'
      won: boolean
      opponent: string
      loot: Amounts
    }
  | { type: 'posture-chosen'; posture: Tactic }
  | { type: 'expedition-created' }
  | { type: 'expedition-joined'; host: string }
  | { type: 'expedition-ended'; won: boolean; loot: number }
  | { type: 'offer-published'; give: Amounts; want: Amounts }
  | { type: 'offer-withdrawn'; expired: boolean; give: Amounts; want: Amounts }
  | {
      type: 'trade-completed'
      role: 'seller' | 'buyer'
      partner: string
      give: Amounts
      want: Amounts
    }

/** Entry of the chronicle of a player. */
export type ChronicleEntry = Fact & {
  /** Position of the event in the log, which orders the entries and pages them. */
  position: number
  /** Time of the event, in milliseconds. */
  at: number
}

/** Part of the game an entry belongs to, used to filter the chronicle. */
export type Category = 'village' | 'fleet' | 'dungeon' | 'market'

/** Parts of the game, in the order of the filters. */
export const CATEGORIES: readonly Category[] = ['village', 'fleet', 'dungeon', 'market']

/** Types of facts of each part of the game. */
export const FACTS_OF: Record<Category, readonly Fact['type'][]> = {
  village: ['village-founded', 'building-ordered'],
  fleet: [
    'raid-launched',
    'raid-cancelled',
    'fleet-recalled',
    'raid-aborted',
    'fleet-sighted',
    'fleet-turned-back',
    'battle',
    'posture-chosen',
  ],
  dungeon: ['expedition-created', 'expedition-joined', 'expedition-ended'],
  market: ['offer-published', 'offer-withdrawn', 'trade-completed'],
}

/**
 * Finds the part of the game a fact belongs to.
 *
 * @param type - Type of the fact.
 * @returns Its part of the game.
 */
export function categoryOf(type: Fact['type']): Category {
  return CATEGORIES.find((category) => FACTS_OF[category].includes(type)) ?? 'village'
}

/** French name of each building. */
const BUILDING_NAMES: Record<string, string> = {
  senate: 'Sénat',
  sawmill: 'Scierie',
  quarry: 'Carrière',
  mine: 'Mine',
  warehouse: 'Entrepôt',
  wall: 'Rempart',
  shipyard: 'Chantier naval',
}

/** French name of each tactic. */
const TACTIC_NAMES: Record<Tactic, string> = {
  ram: 'éperonnage',
  board: 'abordage',
  blockade: 'blocus',
}

/** French name of each resource. */
const RESOURCE_NAMES = { wood: 'bois', stone: 'pierre', gold: 'or' } as const

/**
 * Tells an amount of resources: "120 bois, 40 or".
 *
 * @param amounts - Amounts to tell.
 * @returns The amounts in words, or "rien" when empty.
 */
export function tellAmounts(amounts: Amounts): string {
  const parts = (['wood', 'stone', 'gold'] as const)
    .filter((resource) => (amounts[resource] ?? 0) > 0)
    .map((resource) => `${amounts[resource]} ${RESOURCE_NAMES[resource]}`)
  return parts.length > 0 ? parts.join(', ') : 'rien'
}

/** An entry told in words: a title, a detail, and its tone. */
export interface Told {
  /** Short sentence telling what happened. */
  title: string
  /** Detail of the fact, or an empty string. */
  detail: string
  /** `good` for a success, `bad` for a loss or a threat, `plain` otherwise. */
  tone: 'good' | 'bad' | 'plain'
}

/**
 * Tells an entry in French.
 *
 * @param fact - Fact to tell.
 * @param now - Current time in milliseconds, to tell a construction under way.
 * @returns The title, the detail and the tone of the entry.
 */
export function tell(fact: Fact, now: number): Told {
  switch (fact.type) {
    case 'village-founded':
      return { title: `Fondation de ${fact.name}`, detail: '', tone: 'good' }
    case 'building-ordered': {
      const name = BUILDING_NAMES[fact.building] ?? fact.building
      const done = fact.completesAt === null || fact.completesAt <= now
      return {
        title: `${name} niveau ${fact.toLevel}`,
        detail: `${done ? 'Construit' : 'En construction'}, pour ${tellAmounts(fact.cost)}`,
        tone: done ? 'good' : 'plain',
      }
    }
    case 'raid-launched':
      return {
        title: `Raid lancé contre ${fact.target}`,
        detail: `${fact.ships} trirème${fact.ships > 1 ? 's' : ''}, ${TACTIC_NAMES[fact.tactic]}`,
        tone: 'plain',
      }
    case 'raid-cancelled':
      return {
        title: `Raid contre ${fact.target} annulé`,
        detail: 'Ressources insuffisantes pour armer la flotte',
        tone: 'bad',
      }
    case 'fleet-recalled':
      return { title: `Flotte rappelée`, detail: `Elle voguait vers ${fact.target}`, tone: 'plain' }
    case 'raid-aborted':
      return {
        title: `Raid contre ${fact.target} abandonné`,
        detail: 'La cible a disparu',
        tone: 'plain',
      }
    case 'fleet-sighted':
      return {
        title: `Flotte de ${fact.attacker} en approche`,
        detail: `${fact.ships} trirème${fact.ships > 1 ? 's' : ''}`,
        tone: 'bad',
      }
    case 'fleet-turned-back':
      return {
        title: `La flotte de ${fact.attacker} a fait demi-tour`,
        detail: '',
        tone: 'good',
      }
    case 'battle': {
      const attacking = fact.role === 'attacker'
      const title = attacking
        ? `${fact.won ? 'Victoire' : 'Défaite'} contre ${fact.opponent}`
        : `${fact.won ? 'Attaque repoussée' : 'Village pillé'} par ${fact.opponent}`
      const loot = tellAmounts(fact.loot)
      const detail = attacking
        ? fact.won
          ? `Butin : ${loot}`
          : 'La flotte est perdue'
        : fact.won
          ? 'Le port a tenu bon'
          : `Pertes : ${loot}`
      return { title, detail, tone: fact.won ? 'good' : 'bad' }
    }
    case 'posture-chosen':
      return {
        title: 'Défense du port changée',
        detail: `Posture : ${TACTIC_NAMES[fact.posture]}`,
        tone: 'plain',
      }
    case 'expedition-created':
      return { title: 'Expédition ouverte au donjon', detail: '', tone: 'plain' }
    case 'expedition-joined':
      return { title: `Expédition de ${fact.host} rejointe`, detail: '', tone: 'plain' }
    case 'expedition-ended':
      return fact.won
        ? { title: 'Expédition gagnée', detail: `Butin : ${fact.loot} or`, tone: 'good' }
        : { title: 'Expédition perdue', detail: 'Les héros sont tombés', tone: 'bad' }
    case 'offer-published':
      return {
        title: 'Offre publiée au marché',
        detail: `${tellAmounts(fact.give)} contre ${tellAmounts(fact.want)}`,
        tone: 'plain',
      }
    case 'offer-withdrawn':
      return {
        title: fact.expired ? 'Offre expirée' : 'Offre retirée',
        detail: `${tellAmounts(fact.give)} contre ${tellAmounts(fact.want)}`,
        tone: 'plain',
      }
    case 'trade-completed': {
      const [gave, got] = fact.role === 'seller' ? [fact.give, fact.want] : [fact.want, fact.give]
      return {
        title: `Échange conclu avec ${fact.partner}`,
        detail: `Donné : ${tellAmounts(gave)} ; reçu : ${tellAmounts(got)}`,
        tone: 'good',
      }
    }
  }
}
