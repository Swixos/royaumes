/**
 * Server public entry of the realm module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import { createRealmApi } from './api'
import { createVillageService } from './application/village-service'
import { createInMemoryVillageRepository } from './infrastructure/in-memory-village-repository'

/** Dependencies of the realm module. */
export interface RealmModuleDeps {
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the storage adapter, the service and the API.
 *
 * @param deps - Optional dependencies, such as the clock.
 * @returns The module, exposing its Hono sub-app.
 */
export function createRealmModule({ clock }: RealmModuleDeps = {}) {
  // DETTE TECHNIQUE DT-002 (docs/qualite/dette-technique.md): in-memory storage,
  // replaced by the event store in TD3.
  const repo = createInMemoryVillageRepository()
  const service = createVillageService(repo, clock)
  return { api: createRealmApi(service) }
}

export type { RealmApi } from './api'
