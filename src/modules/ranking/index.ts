/**
 * Server public entry of the ranking module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRankingApi } from './api'
import { RANKING_CHANNEL } from './contracts'
import { createDrizzleRankingReader } from './infrastructure/drizzle-ranking-reader'
import { rankingProjection } from './infrastructure/ranking-projection'

/** Dependencies of the ranking module. */
export interface RankingModuleDeps {
  /** Database, in which the module keeps its read model. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
}

/**
 * Module factory: wires the read adapter, the API and the channel access rule. Every
 * signed-in player may listen to the ranking channel. It is a global channel, which
 * announces the events applied by the projection across all streams. It is discreet:
 * dungeon events hold the expedition seed, which must never be sent, and the interface
 * only needs their position.
 *
 * @param deps - Database and projection runner.
 * @returns The module, exposing its Hono sub-app and its channel policy.
 */
export function createRankingModule({ db, projections }: RankingModuleDeps) {
  const reader = createDrizzleRankingReader(db, projections)
  const channelPolicy: ChannelPolicy = {
    prefix: RANKING_CHANNEL,
    canSubscribe: (channel) => channel === RANKING_CHANNEL,
    redact: true,
    global: { types: rankingProjection.eventTypes },
  }
  return { api: createRankingApi(reader), channelPolicy }
}

export type { RankingApi } from './api'
