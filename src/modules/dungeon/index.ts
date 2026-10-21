/**
 * Server public entry of the dungeon module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createDungeonApi } from './api'
import { createDungeonService } from './application/dungeon-service'
import { GAME_CHANNEL_PREFIX } from './contracts'
import { createDrizzleOpenGamesReader } from './infrastructure/drizzle-open-games-reader'
import { createEventStoreGameRepository } from './infrastructure/event-store-game-repository'
import { createDungeonPersonalData } from './personal-data'

/** Dependencies of the dungeon module. */
export interface DungeonModuleDeps {
  /** Platform event store, provided by the composition root. */
  store: EventStore
  /** Database, in which the module keeps its read model. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the storage adapter, the open games reader, the service, the API and the
 * channel access rule. Only members of an expedition may listen to it, which is
 * checked on the player's view when the stream opens. The channel is discreet:
 * it carries no event data, since `ActionSubmitted` would reveal a hero's action.
 *
 * @param deps - Event store, database, projection runner and optional clock.
 * @returns The module, exposing its Hono sub-app, its channel policy and its personal
 *   data contributor.
 */
export function createDungeonModule({ store, db, projections, clock }: DungeonModuleDeps) {
  const repo = createEventStoreGameRepository(store)
  const openGames = createDrizzleOpenGamesReader(db, projections)
  const service = createDungeonService(repo, openGames, { clock })
  const channelPolicy: ChannelPolicy = {
    prefix: GAME_CHANNEL_PREFIX,
    redact: true,
    canSubscribe: async (channel, userId) => {
      const gameId = channel.slice(GAME_CHANNEL_PREFIX.length)
      const view = await service.getView(gameId, userId)
      return view?.isMember ?? false
    },
  }

  return {
    api: createDungeonApi(service),
    channelPolicy,
    personalData: createDungeonPersonalData(store, db),
  }
}

export type { DungeonApi } from './api'
export { type SimulationSetup, winRate } from './domain/simulation'
