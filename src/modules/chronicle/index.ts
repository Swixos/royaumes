/**
 * Server public entry of the chronicle module. Along with `contracts.ts` and `ui.tsx`,
 * it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createChronicleApi } from './api'
import { createDrizzleChronicleReader } from './infrastructure/drizzle-chronicle-reader'
import { createChroniclePersonalData } from './personal-data'

/** Dependencies of the chronicle module. */
export interface ChronicleModuleDeps {
  /** Database, in which the module keeps its read model. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
}

/**
 * Module factory: wires the read adapter and the API. The chronicle gathers what
 * happened to a player in the village, the fleet, the dungeon and the market, from the
 * events those modules publish; it has no channel, since the interface reads it when its
 * window opens.
 *
 * @param deps - Database and projection runner.
 * @returns The module, exposing its Hono sub-app and its personal data contributor.
 */
export function createChronicleModule({ db, projections }: ChronicleModuleDeps) {
  return {
    api: createChronicleApi(createDrizzleChronicleReader(db, projections)),
    personalData: createChroniclePersonalData(db, projections),
  }
}

export type { ChronicleApi } from './api'
