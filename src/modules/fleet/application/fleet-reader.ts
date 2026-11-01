import type { ArmyMove } from '@/modules/realm/contracts'
import type { RaidsList, TargetsList } from '../contracts'
import type { Damage } from '../domain/battle'
import type { LevelSteps, Tactic } from '../domain/naval'

/** Read port of the fleet read model, owned by the application layer. */
export interface FleetReader {
  /**
   * Lists the targets a player may raid: the nearest villages of the other players, or
   * those whose name holds the searched text, and the pirate islands.
   *
   * @param viewerId - Identifier of the viewing player.
   * @param now - Current time in milliseconds.
   * @param search - Part of a village name to look for, whatever the case.
   * @returns The targets, with the log position up to which they are up to date.
   */
  targets(viewerId: string, now: number, search?: string): Promise<TargetsList>

  /**
   * Lists the raids a player launched or suffered.
   *
   * @param viewerId - Identifier of the viewing player.
   * @returns The raids, with the log position up to which they are up to date.
   */
  raids(viewerId: string): Promise<RaidsList>

  /**
   * Reads a village that may be raided.
   *
   * @param playerId - Owner of the village.
   * @returns Its name, the levels reached by its wall and its shipyard, and the moves of
   *   its units, or null if it is not a target.
   */
  village(
    playerId: string,
  ): Promise<{ name: string; wall: LevelSteps; shipyard: LevelSteps; units: ArmyMove[] } | null>

  /**
   * Counts the raids of a player whose fleet is still out.
   *
   * @param attackerId - Identifier of the attacker.
   * @returns The number of raids being equipped, at sea or plundering.
   */
  raidsOut(attackerId: string): Promise<number>

  /**
   * Lists the days on which a player raided an island, cancelled and recalled raids excepted.
   *
   * @param attackerId - Identifier of the attacker.
   * @param islandId - Island identifier.
   * @returns The UTC day numbers.
   */
  islandRaidDays(attackerId: string, islandId: string): Promise<number[]>

  /**
   * Lists the tactics a player used in their fights against the pirates.
   *
   * @param attackerId - Identifier of the attacker.
   * @returns The tactics, oldest first.
   */
  pirateHistory(attackerId: string): Promise<Tactic[]>

  /**
   * Lists the main kind of damage of the armies a player sent against the pirates, once
   * they fought.
   *
   * @param attackerId - Identifier of the attacker.
   * @returns The kinds of damage, oldest first.
   */
  pirateDamages(attackerId: string): Promise<Damage[]>

  /**
   * Lists the raids concerning a player whose fleet should have arrived.
   *
   * @param viewerId - Identifier of the player, attacker or defender.
   * @param now - Current time in milliseconds.
   * @returns The identifiers of the raids at sea past their arrival time.
   */
  dueRaids(viewerId: string, now: number): Promise<string[]>
}
