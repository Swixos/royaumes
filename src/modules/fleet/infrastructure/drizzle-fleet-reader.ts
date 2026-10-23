import { and, desc, eq, inArray, isNotNull, lte, ne, notInArray, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { FleetReader } from '../application/fleet-reader'
import type { RaidSummary } from '../contracts'
import {
  type Amounts,
  dayOf,
  mapPositionOf,
  PIRATE_ISLANDS,
  type Tactic,
  travelMinutes,
  villageDefense,
} from '../domain/naval'
import { OUT_STATUSES, type RaidStatus } from '../domain/raid'
import { fleetProjection } from './fleet-projection'
import { harbors, raids } from './schema'

/** Maximum number of raids and villages listed. */
const LIST_SIZE = 50

/** Raids that never reached their island, and so do not count for its daily treasure. */
const NEVER_ARRIVED: RaidStatus[] = ['cancelled', 'recalled']

/**
 * Creates the adapter of the `FleetReader` port, backed by the tables of the fleet
 * projection. It catches the projection up before each read, and reads the checkpoint
 * position before the tables, which reflect at least that position.
 *
 * @param db - Database holding the fleet tables.
 * @param projections - Projection runner of the platform.
 * @returns The fleet reader.
 */
export function createDrizzleFleetReader(db: Db, projections: ProjectionRunner): FleetReader {
  /**
   * Catches the projection up.
   *
   * @returns The log position up to which the tables are up to date.
   */
  async function fresh() {
    await projections.catchUp(fleetProjection)
    return projections.positionOf(fleetProjection.name)
  }

  return {
    async targets(viewerId, now) {
      const position = await fresh()
      const rows = await db
        .select()
        .from(harbors)
        .orderBy(harbors.villageName)
        .limit(LIST_SIZE + 1)
      const today = dayOf(now)
      const raided = await db
        .select({ targetId: raids.targetId, launchedAt: raids.launchedAt })
        .from(raids)
        .where(
          and(
            eq(raids.attackerId, viewerId),
            eq(raids.targetKind, 'pirates'),
            notInArray(raids.status, NEVER_ARRIVED),
          ),
        )
      const own = rows.find((row) => row.playerId === viewerId)
      return {
        position,
        home: own
          ? {
              name: own.villageName,
              defense: villageDefense(own.upgrades),
              map: mapPositionOf(viewerId),
            }
          : null,
        villages: rows
          .filter((row) => row.playerId !== viewerId)
          .slice(0, LIST_SIZE)
          .map((row) => ({
            playerId: row.playerId,
            name: row.villageName,
            defense: villageDefense(row.upgrades),
            travelMinutes: travelMinutes(viewerId, row.playerId),
            map: mapPositionOf(row.playerId),
          })),
        islands: PIRATE_ISLANDS.map((island) => ({
          islandId: island.id,
          name: island.name,
          defense: island.defense,
          travelMinutes: island.travelMinutes,
          treasure: island.treasure,
          raidedToday: raided.some(
            (r) => r.targetId === island.id && dayOf(r.launchedAt) === today,
          ),
          map: island.map,
        })),
      }
    },

    async raids(viewerId) {
      const position = await fresh()
      const rows = await db
        .select()
        .from(raids)
        .where(
          or(
            eq(raids.attackerId, viewerId),
            and(
              eq(raids.targetKind, 'village'),
              eq(raids.targetId, viewerId),
              ne(raids.sailedAt, 0),
            ),
          ),
        )
        .orderBy(desc(raids.launchedAt))
        .limit(LIST_SIZE)
      return {
        position,
        raids: rows.map((row): RaidSummary => {
          const attacker = row.attackerId === viewerId
          return {
            raidId: row.raidId,
            role: attacker ? 'attacker' : 'defender',
            attackerName: row.attackerName,
            targetKind: row.targetKind as RaidSummary['targetKind'],
            targetId: row.targetId,
            targetName: row.targetName,
            ships: row.ships,
            tactic: attacker || row.victory !== null ? (row.tactic as Tactic) : null,
            status: row.status as RaidStatus,
            launchedAt: row.launchedAt,
            sailedAt: row.sailedAt,
            arrivesAt: row.arrivesAt,
            victory: row.victory,
            loot: row.loot as Amounts | null,
          }
        }),
      }
    },

    async village(playerId) {
      await fresh()
      const [row] = await db.select().from(harbors).where(eq(harbors.playerId, playerId))
      return row ? { name: row.villageName, upgrades: row.upgrades } : null
    },

    async raidsOut(attackerId) {
      await fresh()
      const rows = await db
        .select({ raidId: raids.raidId })
        .from(raids)
        .where(and(eq(raids.attackerId, attackerId), inArray(raids.status, [...OUT_STATUSES])))
      return rows.length
    },

    async islandRaidDays(attackerId, islandId) {
      await fresh()
      const rows = await db
        .select({ launchedAt: raids.launchedAt })
        .from(raids)
        .where(
          and(
            eq(raids.attackerId, attackerId),
            eq(raids.targetId, islandId),
            notInArray(raids.status, NEVER_ARRIVED),
          ),
        )
      return rows.map((row) => dayOf(row.launchedAt))
    },

    async pirateHistory(attackerId) {
      await fresh()
      const rows = await db
        .select({ tactic: raids.tactic })
        .from(raids)
        .where(
          and(
            eq(raids.attackerId, attackerId),
            eq(raids.targetKind, 'pirates'),
            isNotNull(raids.victory),
          ),
        )
        .orderBy(raids.launchedAt)
      return rows.map((row) => row.tactic as Tactic)
    },

    async dueRaids(viewerId, now) {
      await fresh()
      const rows = await db
        .select({ raidId: raids.raidId })
        .from(raids)
        .where(
          and(
            eq(raids.status, 'at-sea'),
            lte(raids.arrivesAt, now),
            or(eq(raids.attackerId, viewerId), eq(raids.targetId, viewerId)),
          ),
        )
      return rows.map((row) => row.raidId)
    },
  }
}
