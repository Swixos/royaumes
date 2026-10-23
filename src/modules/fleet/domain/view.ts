/**
 * View of a raid: what a given player sees of it. The defender never learns the tactic of
 * the fleet before the battle, nor the equipment the attacker paid.
 *
 * @packageDocumentation
 */
import type { Amounts, Battle, Tactic } from './naval'
import type { RaidState, RaidStatus, Target } from './raid'

/** Raid as shown to a player. */
export interface RaidView {
  /** Raid identifier. */
  raidId: string
  /** Side of the viewing player. */
  role: 'attacker' | 'defender'
  /** Name of the attacker. */
  attackerName: string
  /** Target of the raid. */
  target: Target
  /** Number of triremes. */
  ships: number
  /** Tactic of the fleet: known to the attacker, and to the defender after the battle. */
  tactic: Tactic | null
  /** Equipment paid by the attacker; hidden from the defender. */
  cost: Amounts | null
  /** Progress of the raid saga. */
  status: RaidStatus
  /** Launch time in milliseconds. */
  launchedAt: number
  /** Time the fleet sailed; 0 before. */
  sailedAt: number
  /** Arrival time of the fleet; 0 before it sails. */
  arrivesAt: number
  /** Battle outcome, once fought. */
  battle: Battle | null
  /** Plunder brought back, once known. */
  loot: Amounts | null
  /** Equipment the attacker lacked, when the raid was cancelled; attacker only. */
  missing: Amounts | null
}

/**
 * Builds the view of a raid for a player. Only the attacker and the owner of the
 * targeted village see a raid.
 *
 * @param state - Raid state.
 * @param viewerId - Identifier of the viewing player.
 * @returns The view, or null if the raid does not exist or does not concern the player.
 */
export function toView(state: RaidState, viewerId: string): RaidView | null {
  if (!state.exists) return null
  const attacker = state.attackerId === viewerId
  const defender = state.target.kind === 'village' && state.target.playerId === viewerId
  if (!attacker && !defender) return null
  return {
    raidId: state.raidId,
    role: attacker ? 'attacker' : 'defender',
    attackerName: state.attackerName,
    target: state.target,
    ships: state.ships,
    tactic: attacker || state.battle ? state.tactic : null,
    cost: attacker ? state.cost : null,
    status: state.status,
    launchedAt: state.launchedAt,
    sailedAt: state.sailedAt,
    arrivesAt: state.arrivesAt,
    battle: state.battle,
    loot: state.loot,
    missing: attacker ? state.missing : null,
  }
}
