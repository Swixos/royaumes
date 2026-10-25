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

/**
 * Detail of a battle, as the report tells it: the forces met, the tactic triangle, the
 * sums that decided the outcome, and what each side lost.
 */
export interface BattleDetail {
  /** Number of attacking triremes. */
  ships: number
  /** Tactic of the attacking fleet. */
  tactic: Tactic
  /** Posture held by the defender. */
  posture: Tactic
  /** Posture that beats the tactic of the fleet. */
  counter: Tactic
  /** Attack of one trireme. */
  perShip: number
  /** Factor of the tactic triangle: 1.5, 1 or 0.5. */
  multiplier: number
  /** Attack strength of the fleet. */
  attack: number
  /** Defense of the target. */
  defense: number
  /** True for a pirate island, false for a village. */
  pirates: boolean
  /** Level of the wall of the village; null for a pirate island. */
  wall: number | null
  /** Defense added by each level of the wall. */
  perWallLevel: number
  /** Smallest number of triremes that would have won with the same tactic. */
  neededShips: number
  /** Equipment of the fleet, lost with it if it sinks. */
  cost: Amounts
  /** Hold of the fleet: the most it brings back. */
  hold: Amounts
}

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
      /** Detail of the battle; missing when its raid was not read. */
      report?: BattleDetail
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
          ? `Butin : ${loot}`
          : 'La flotte est perdue'
        : fact.won
          ? 'Le port a tenu bon'
          : `Pertes : ${loot}`
      return { title, detail, tone: fact.won ? 'good' : 'bad' }
    }
    case 'posture-chosen':
      return {
        title: 'Défense du port changée',
        detail: `Posture : ${TACTIC_NAMES[fact.posture]}`,
        tone: 'plain',
      }
    case 'expedition-created':
      return { title: 'Expédition ouverte au donjon', detail: '', tone: 'plain' }
    case 'expedition-joined':
      return { title: `Expédition de ${fact.host} rejointe`, detail: '', tone: 'plain' }
    case 'expedition-ended':
      return fact.won
        ? { title: 'Expédition gagnée', detail: `Butin : ${fact.loot} or`, tone: 'good' }
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
        detail: `Donné : ${tellAmounts(gave)} ; reçu : ${tellAmounts(got)}`,
        tone: 'good',
      }
    }
  }
}

/** A line of a battle report: a label, and what it says. */
export interface ReportLine {
  /** Label of the line. */
  label: string
  /** Content of the line. */
  value: string
  /** `good` or `bad` to stress the line, `plain` otherwise. */
  tone: 'good' | 'bad' | 'plain'
}

/**
 * Writes a number the French way: "1,5".
 *
 * @param value - Number to write.
 * @returns The number, with a decimal comma.
 */
const french = (value: number) => String(value).replace('.', ',')

/**
 * Plural of "trirème".
 *
 * @param count - Number of triremes.
 * @returns The count and the word.
 */
const triremes = (count: number) => `${count} trirème${count > 1 ? 's' : ''}`

/**
 * Explains a battle line by line, from the side of the player: the forces, the tactic
 * triangle, the sums of the attack and of the defense, the outcome, the losses and the
 * plunder, then what would have changed the outcome.
 *
 * @param fact - Battle told by the entry.
 * @param report - Detail of the battle.
 * @returns The lines of the report.
 */
export function explainBattle(
  fact: Extract<Fact, { type: 'battle' }>,
  report: BattleDetail,
): ReportLine[] {
  const attacking = fact.role === 'attacker'
  const fleetWon = attacking ? fact.won : !fact.won
  const fleet = `${triremes(report.ships)} en ${TACTIC_NAMES[report.tactic]}`
  const triangle =
    report.multiplier > 1
      ? `${capital(TACTIC_NAMES[report.tactic])} bat ${TACTIC_NAMES[report.posture]} : attaque ×${french(report.multiplier)}`
      : report.multiplier < 1
        ? `${capital(TACTIC_NAMES[report.posture])} bat ${TACTIC_NAMES[report.tactic]} : attaque ×${french(report.multiplier)}`
        : `Aucune tactique ne domine : attaque ×1`
  const base = report.defense - (report.wall ?? 0) * report.perWallLevel
  const defense = report.pirates
    ? `Défense de l'île : ${report.defense}`
    : `${base} de base + rempart niveau ${report.wall} (${(report.wall ?? 0) * report.perWallLevel}) = ${report.defense}`
  const lines: ReportLine[] = [
    { label: attacking ? 'Votre flotte' : 'Flotte ennemie', value: fleet, tone: 'plain' },
    {
      label: attacking ? 'Défense adverse' : 'Votre posture',
      value: `${report.pirates ? 'Pirates, en ' : ''}${report.pirates ? TACTIC_NAMES[report.posture] : capital(TACTIC_NAMES[report.posture])}`,
      tone: 'plain',
    },
    {
      label: 'Tactique',
      value: triangle,
      tone:
        report.multiplier > 1 === attacking && report.multiplier !== 1
          ? 'good'
          : report.multiplier === 1
            ? 'plain'
            : 'bad',
    },
    {
      label: "Force d'attaque",
      value: `${report.ships} × ${report.perShip} × ${french(report.multiplier)} = ${french(report.attack)}`,
      tone: 'plain',
    },
    { label: 'Défense', value: defense, tone: 'plain' },
    {
      label: 'Issue',
      value: fleetWon
        ? `${french(report.attack)} > ${report.defense} : la flotte l'emporte`
        : `${french(report.attack)} ≤ ${report.defense} : la flotte est repoussée`,
      tone: fact.won ? 'good' : 'bad',
    },
    {
      label: 'Pertes',
      value: fleetWon
        ? attacking
          ? 'Aucune trirème perdue'
          : `Ressources pillées : ${tellAmounts(fact.loot)}`
        : attacking
          ? `${triremes(report.ships)} coulée${report.ships > 1 ? 's' : ''}, équipement perdu : ${tellAmounts(report.cost)}`
          : `Flotte ennemie coulée : ${triremes(report.ships)}`,
      tone: fact.won ? (attacking ? 'good' : 'plain') : 'bad',
    },
  ]
  if (fleetWon) {
    lines.push({
      label: 'Butin',
      value: `${tellAmounts(fact.loot)}, pour une cale de ${tellAmounts(report.hold)}`,
      tone: attacking ? 'good' : 'bad',
    })
  }
  if (!fact.won) {
    lines.push({
      label: 'Conseil',
      value: attacking
        ? `Il fallait au moins ${triremes(report.neededShips)} en ${TACTIC_NAMES[report.tactic]}, ou une tactique qui bat ${TACTIC_NAMES[report.posture]}.`
        : `La posture ${TACTIC_NAMES[report.counter]} aurait affaibli cette attaque ; chaque niveau de rempart ajoute ${report.perWallLevel} de défense.`,
      tone: 'plain',
    })
  }
  return lines
}

/**
 * Writes a word with a capital first letter.
 *
 * @param word - Word to write.
 * @returns The word, capitalized.
 */
function capital(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
