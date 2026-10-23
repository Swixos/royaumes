/**
 * Server public entry of the fleet module. Along with `contracts.ts` and `ui.tsx`, it is
 * the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createFleetApi } from './api'
import { createFleetService } from './application/fleet-service'
import { HARBOR_CHANNEL_PREFIX, harborChannel } from './contracts'
import { createDrizzleFleetReader } from './infrastructure/drizzle-fleet-reader'
import {
  createEventStoreHarborRepository,
  createEventStoreRaidRepository,
} from './infrastructure/event-store-repositories'
import { createFleetHandlers } from './messages'
import { createFleetPersonalData } from './personal-data'

/** Dependencies of the fleet module. */
export interface FleetModuleDeps {
  /** Platform event store. */
  store: EventStore
  /** Database, in which the module keeps its read model. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
  /** Outbox dispatch, triggered by the fleet module after its commands and reads. */
  dispatch: () => Promise<unknown>
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the adapters, the service, the API, the channel access rule and
 * the message handlers. A player only listens to the channel of their own harbor, which
 * announces the fleets sighted and the battle reports.
 *
 * @param deps - Event store, database, projection runner, outbox dispatch and optional clock.
 * @returns The module, exposing its Hono sub-app, its channel policy, its message handlers
 *   and its personal data contributor.
 */
export function createFleetModule({ store, db, projections, dispatch, clock }: FleetModuleDeps) {
  const reader = createDrizzleFleetReader(db, projections)
  const service = createFleetService(
    createEventStoreRaidRepository(store),
    createEventStoreHarborRepository(store),
    reader,
    { dispatch, clock },
  )

  const channelPolicy: ChannelPolicy = {
    prefix: HARBOR_CHANNEL_PREFIX,
    canSubscribe: (channel, userId) => channel === harborChannel(userId),
  }

  return {
    api: createFleetApi(service),
    channelPolicy,
    handlers: createFleetHandlers(service),
    personalData: createFleetPersonalData(store, db),
  }
}

export type { FleetApi } from './api'
