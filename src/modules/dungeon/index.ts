/**
 * Server public entry of the dungeon module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { EventStore } from '@/platform/event-store/event-store'
import { createDungeonApi } from './api'
import { createDungeonService } from './application/dungeon-service'
import { createEventStoreGameRepository } from './infrastructure/event-store-game-repository'

/** Dependencies of the dungeon module. */
export interface DungeonModuleDeps {
  /** Platform event store, provided by the composition root. */
  store: EventStore
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the storage adapter, the service and the API.
 *
 * @param deps - Event store and optional clock.
 * @returns The module, exposing its Hono sub-app.
 */
export function createDungeonModule({ store, clock }: DungeonModuleDeps) {
  const repo = createEventStoreGameRepository(store)
  const service = createDungeonService(repo, { clock })
  return { api: createDungeonApi(service) }
}

export type { DungeonApi } from './api'
