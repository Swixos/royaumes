/**
 * Battles of armies, as in Grepolis: the fleets fight first at sea, then the land troops
 * carried by the transports fight the garrison. Each land unit deals one kind of damage,
 * and each defender resists the three kinds differently, so the composition of an army
 * matters as much as its size. The winner loses a share of its troops that grows with
 * the strength of the loser; the loser loses everything. Pure TypeScript, with neither
 * randomness nor clock: the values of the units come from the village module, through
 * the rules given to each function.
 *
 * @packageDocumentation
 */

/** Number of each unit, by unit identifier of the village module. */
export type Army = Partial<Record<string, number>>

/** Kinds of damage of the land units. */
export const DAMAGES = ['blunt', 'sharp', 'distance'] as const

/** A kind of damage. */
export type Damage = (typeof DAMAGES)[number]

/** Values of the units, read from the published catalog of the village module. */
export interface ArmyRules {
  /** Land units: attack, kind of damage, defense against each kind, and booty carried. */
  land: Record<
    string,
    { attack: number; damage: Damage; defense: Record<Damage, number>; booty: number }
  >
  /** Ships: attack and defense at sea, land units carried, and speed. */
  naval: Record<string, { attack: number; defense: number; capacity: number; speed: number }>
}

/** Defense of a village without troops: its people take up arms. */
export const BASE_DEFENSE = 10

/** Share of the defense added by each level of the wall. */
export const WALL_BONUS = 0.08

/** Speed of reference: a fleet this fast crosses in the crossing time of the map. */
export const REFERENCE_SPEED = 8

/** Exponent of the losses of the winner: (loser / winner) ^ LOSS_EXPONENT of its troops. */
export const LOSS_EXPONENT = 1.5

/** Share of the booty taken in each resource from a village. */
export const PLUNDER_SHARE = { wood: 0.4, stone: 0.4, gold: 0.2 } as const

/** Naval battle of a raid. */
export interface NavalFight {
  /** Naval attack of the attacking fleet. */
  attack: number
  /** Naval defense of the ships of the target. */
  defense: number
  /** True if the attacking fleet won. */
  won: boolean
}

/** Land battle of a raid. */
export interface LandFight {
  /** Attack of the land troops. */
  attack: number
  /** Attack of the troops for each kind of damage. */
  damage: Record<Damage, number>
  /** Defense of the target, its wall included. */
  defense: number
  /** Level of the wall of the target. */
  wall: number
  /** Share of defense the wall added. */
  wallBonus: number
  /** True if the attacking troops won. */
  won: boolean
}

/** Report of a battle, as both players read it. */
export interface BattleReport {
  /** Units sent by the attacker, and those it lost. */
  attacker: { sent: Army; lost: Army }
  /** Units defending the target, and those it lost. */
  defender: { present: Army; lost: Army }
  /** Naval battle; null if the target had no ship. */
  naval: NavalFight | null
  /** Land battle; null if the fleet was sunk first, or carried no troop. */
  land: LandFight | null
  /** True if the attacker won the land battle, and may plunder. */
  victory: boolean
  /** Resources the surviving troops can carry back. */
  capacity: number
}

/** Reason for refusing an army. */
export type ArmyError = 'EMPTY' | 'UNKNOWN_UNIT' | 'NO_SHIP' | 'NO_ROOM'

/**
 * Units of an army with their number, positive ones only.
 *
 * @param army - Army to read.
 * @returns The units present.
 */
export const entriesOf = (army: Army): Array<[string, number]> =>
  Object.entries(army).filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0)

/**
 * Sums a value over the units of an army.
 *
 * @param army - Army to read.
 * @param value - Value of one unit, 0 for a unit it does not concern.
 * @returns The total.
 */
function sumOf(army: Army, value: (unit: string) => number): number {
  return entriesOf(army).reduce((sum, [unit, count]) => sum + value(unit) * count, 0)
}

/**
 * Land units of an army.
 *
 * @param army - Army to split.
 * @param rules - Values of the units.
 * @returns The land units only.
 */
export const landOf = (army: Army, rules: ArmyRules): Army =>
  Object.fromEntries(entriesOf(army).filter(([unit]) => unit in rules.land))

/**
 * Ships of an army.
 *
 * @param army - Army to split.
 * @param rules - Values of the units.
 * @returns The ships only.
 */
export const shipsOf = (army: Army, rules: ArmyRules): Army =>
  Object.fromEntries(entriesOf(army).filter(([unit]) => unit in rules.naval))

/**
 * Checks an army before it sails: it holds known units, at least one ship, and the land
 * troops fit in the holds of its transports.
 *
 * @param army - Army asked.
 * @param rules - Values of the units.
 * @returns The reason it is refused, or null if it may sail.
 */
export function armyError(army: Army, rules: ArmyRules): ArmyError | null {
  const units = entriesOf(army)
  if (units.length === 0) return 'EMPTY'
  if (
    units.some(
      ([unit, count]) =>
        !Number.isInteger(count) || (!(unit in rules.land) && !(unit in rules.naval)),
    )
  ) {
    return 'UNKNOWN_UNIT'
  }
  if (entriesOf(shipsOf(army, rules)).length === 0) return 'NO_SHIP'
  const troops = sumOf(landOf(army, rules), () => 1)
  const room = sumOf(army, (unit) => rules.naval[unit]?.capacity ?? 0)
  return troops > room ? 'NO_ROOM' : null
}

/**
 * Factor applied to the crossing time of a fleet: its slowest ship sets the pace.
 *
 * @param army - Army sailing.
 * @param rules - Values of the units.
 * @returns The factor, 1 for a fleet at the speed of reference.
 */
export function paceOf(army: Army, rules: ArmyRules): number {
  const speeds = entriesOf(shipsOf(army, rules)).map(([unit]) => rules.naval[unit].speed)
  return speeds.length === 0 ? 1 : REFERENCE_SPEED / Math.min(...speeds)
}

/**
 * Kind of damage an army deals most, which the pirate captains remember.
 *
 * @param army - Army sent.
 * @param rules - Values of the units.
 * @returns The kind of damage carrying most of its attack, or null without land troops.
 */
export function mainDamage(army: Army, rules: ArmyRules): Damage | null {
  const damage = damageOf(landOf(army, rules), rules)
  const best = DAMAGES.reduce((a, b) => (damage[b] > damage[a] ? b : a))
  return damage[best] > 0 ? best : null
}

/**
 * Attack of land troops for each kind of damage.
 *
 * @param army - Land troops.
 * @param rules - Values of the units.
 * @returns The attack, by kind of damage.
 */
function damageOf(army: Army, rules: ArmyRules): Record<Damage, number> {
  const damage: Record<Damage, number> = { blunt: 0, sharp: 0, distance: 0 }
  for (const [unit, count] of entriesOf(army)) {
    const stats = rules.land[unit]
    if (stats) damage[stats.damage] += stats.attack * count
  }
  return damage
}

/**
 * Losses of an army: a share of each unit, rounded, never more than it holds.
 *
 * @param army - Army fighting.
 * @param share - Share lost, from 0 to 1.
 * @returns The units lost.
 */
export function lossesOf(army: Army, share: number): Army {
  const lost: Army = {}
  for (const [unit, count] of entriesOf(army)) {
    const dead = Math.min(count, Math.round(count * Math.min(1, Math.max(0, share))))
    if (dead > 0) lost[unit] = dead
  }
  return lost
}

/**
 * Share of its troops the winner of a fight loses.
 *
 * @param loser - Strength of the loser.
 * @param winner - Strength of the winner.
 * @returns The share, from 0 to 1.
 */
export const winnerLoss = (loser: number, winner: number) =>
  winner <= 0 ? 0 : Math.min(1, (loser / winner) ** LOSS_EXPONENT)

/**
 * Adds armies.
 *
 * @param armies - Armies to add.
 * @returns Their sum, without the units at zero.
 */
export function sumArmies(...armies: Army[]): Army {
  const total: Army = {}
  for (const army of armies) {
    for (const [unit, count] of entriesOf(army)) total[unit] = (total[unit] ?? 0) + count
  }
  return total
}

/**
 * Removes the losses from an army.
 *
 * @param army - Army before the battle.
 * @param lost - Units lost.
 * @returns The survivors.
 */
export function survivorsOf(army: Army, lost: Army): Army {
  const left: Army = {}
  for (const [unit, count] of entriesOf(army)) {
    const alive = count - (lost[unit] ?? 0)
    if (alive > 0) left[unit] = alive
  }
  return left
}

/**
 * Fights a battle. At sea, the attack of the fleet meets the defense of the ships of the
 * target; a fleet beaten at sea sinks with its troops. On land, the defense of each
 * defender is weighted by the kinds of damage of the attacking troops, then raised by the
 * wall. Ties go to the defender.
 *
 * @param attacker - Army sent.
 * @param defender - Units defending the target.
 * @param wall - Level of the wall of the target.
 * @param rules - Values of the units.
 * @param base - Defense of the target without troops.
 * @returns The report of the battle.
 */
export function fightArmies(
  attacker: Army,
  defender: Army,
  wall: number,
  rules: ArmyRules,
  base = BASE_DEFENSE,
): BattleReport {
  const attackerShips = shipsOf(attacker, rules)
  const defenderShips = shipsOf(defender, rules)
  const troops = landOf(attacker, rules)
  const garrison = landOf(defender, rules)
  let attackerLost: Army = {}
  let defenderLost: Army = {}

  let naval: NavalFight | null = null
  if (entriesOf(defenderShips).length > 0) {
    const attack = sumOf(attackerShips, (unit) => rules.naval[unit].attack)
    const defense = sumOf(defenderShips, (unit) => rules.naval[unit].defense)
    const won = attack > defense
    naval = { attack, defense, won }
    if (won) {
      defenderLost = { ...defenderShips }
      const fighting = Object.fromEntries(
        entriesOf(attackerShips).filter(([unit]) => rules.naval[unit].attack > 0),
      )
      attackerLost = lossesOf(fighting, winnerLoss(defense, attack))
    } else {
      attackerLost = { ...attacker }
      defenderLost = lossesOf(defenderShips, winnerLoss(attack, defense))
      return report(attacker, defender, attackerLost, defenderLost, naval, null, false, rules)
    }
  }

  if (entriesOf(troops).length === 0) {
    return report(attacker, defender, attackerLost, defenderLost, naval, null, false, rules)
  }

  const damage = damageOf(troops, rules)
  const attack = DAMAGES.reduce((sum, kind) => sum + damage[kind], 0)
  const weights = DAMAGES.map((kind) => [kind, attack > 0 ? damage[kind] / attack : 1 / 3] as const)
  const resisted = sumOf(garrison, (unit) =>
    weights.reduce((sum, [kind, weight]) => sum + weight * rules.land[unit].defense[kind], 0),
  )
  const wallBonus = WALL_BONUS * wall
  const defense = Math.round((resisted + base) * (1 + wallBonus) * 10) / 10
  const won = attack > defense
  const land: LandFight = { attack, damage, defense, wall, wallBonus, won }
  if (won) {
    defenderLost = sumArmies(defenderLost, garrison)
    attackerLost = sumArmies(attackerLost, lossesOf(troops, winnerLoss(defense, attack)))
  } else {
    attackerLost = sumArmies(attackerLost, troops)
    defenderLost = sumArmies(defenderLost, lossesOf(garrison, winnerLoss(attack, defense)))
  }
  return report(attacker, defender, attackerLost, defenderLost, naval, land, won, rules)
}

/**
 * Builds the report of a battle, with the booty the surviving troops can carry.
 *
 * @param attacker - Army sent.
 * @param defender - Units defending the target.
 * @param attackerLost - Units the attacker lost.
 * @param defenderLost - Units the defender lost.
 * @param naval - Naval battle, if fought.
 * @param land - Land battle, if fought.
 * @param victory - True if the attacker won on land.
 * @param rules - Values of the units.
 * @returns The report.
 */
function report(
  attacker: Army,
  defender: Army,
  attackerLost: Army,
  defenderLost: Army,
  naval: NavalFight | null,
  land: LandFight | null,
  victory: boolean,
  rules: ArmyRules,
): BattleReport {
  const survivors = landOf(survivorsOf(attacker, attackerLost), rules)
  return {
    attacker: { sent: attacker, lost: attackerLost },
    defender: { present: defender, lost: defenderLost },
    naval,
    land,
    victory,
    capacity: victory ? sumOf(survivors, (unit) => rules.land[unit].booty) : 0,
  }
}

/**
 * Splits the booty of the troops over the resources of a pirate treasure: each resource
 * gets an even share of what is left, up to what the treasure holds.
 *
 * @param treasure - Resources available.
 * @param capacity - Resources the troops can carry.
 * @returns The resources taken.
 */
export function lootWithin(
  treasure: Partial<Record<'wood' | 'stone' | 'gold', number>>,
  capacity: number,
): Partial<Record<'wood' | 'stone' | 'gold', number>> {
  const loot: Partial<Record<'wood' | 'stone' | 'gold', number>> = {}
  let left = Math.floor(capacity)
  let pending = (['wood', 'stone', 'gold'] as const).filter((r) => (treasure[r] ?? 0) > 0)
  while (left > 0 && pending.length > 0) {
    const share = Math.max(1, Math.floor(left / pending.length))
    const next: typeof pending = []
    for (const resource of pending) {
      const room = (treasure[resource] ?? 0) - (loot[resource] ?? 0)
      const taken = Math.min(room, share, left)
      if (taken > 0) {
        loot[resource] = (loot[resource] ?? 0) + taken
        left -= taken
      }
      if (room - taken > 0) next.push(resource)
    }
    pending = next
  }
  return loot
}

/**
 * Plunder asked from a village after a victory: the booty of the troops, split over the
 * three resources.
 *
 * @param capacity - Resources the troops can carry.
 * @returns The resources asked.
 */
export function plunderOf(capacity: number): Partial<Record<'wood' | 'stone' | 'gold', number>> {
  const asked: Partial<Record<'wood' | 'stone' | 'gold', number>> = {}
  for (const [resource, share] of Object.entries(PLUNDER_SHARE) as Array<
    ['wood' | 'stone' | 'gold', number]
  >) {
    const amount = Math.floor(capacity * share)
    if (amount > 0) asked[resource] = amount
  }
  return asked
}
