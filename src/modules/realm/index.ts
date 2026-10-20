/**
 * Server public entry of the realm module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { EventStore } from '@/platform/event-store/event-store'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRealmApi } from './api'
import { createVillageService } from './application/village-service'
import { villageChannel } from './contracts'
import { createEventStoreVillageRepository } from './infrastructure/event-store-village-repository'

/** Dependencies of the realm module. */
export interface RealmModuleDeps {
  /** Platform event store, provided by the composition root. */
  store: EventStore
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the storage adapter, the service, the API and the
 * channel access rule, which lets a player listen to their own village only.
 *
 * @param deps - Event store and optional clock.
 * @returns The module, exposing its Hono sub-app and its channel policy.
 */
export function createRealmModule({ store, clock }: RealmModuleDeps) {
  const repo = createEventStoreVillageRepository(store)
  const service = createVillageService(repo, clock)
  const channelPolicy: ChannelPolicy = {
    prefix: 'village-',
    canSubscribe: (channel, userId) => channel === villageChannel(userId),
  }

  return { api: createRealmApi(service), channelPolicy }
}

export type { RealmApi } from './api'
