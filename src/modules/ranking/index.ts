/**
 * Server public entry of the ranking module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createRankingApi } from './api'
import { createDrizzleRankingReader } from './infrastructure/drizzle-ranking-reader'

/** Dependencies of the ranking module. */
export interface RankingModuleDeps {
  /** Database, in which the module keeps its read model. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
}

/**
 * Module factory: wires the read adapter and the API.
 *
 * @param deps - Database and projection runner.
 * @returns The ranking sub-app.
 */
export function createRankingModule({ db, projections }: RankingModuleDeps) {
  const reader = createDrizzleRankingReader(db, projections)
  return { api: createRankingApi(reader) }
}

export type { RankingApi } from './api'
