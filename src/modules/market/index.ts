/**
 * Server public entry of the market module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createMarketApi } from './api'
import { createMarketService } from './application/market-service'
import { MARKET_CHANNEL } from './contracts'
import { createDrizzleOffersReader } from './infrastructure/drizzle-offers-reader'
import { createEventStoreOfferRepository } from './infrastructure/event-store-offer-repository'
import { offersProjection } from './infrastructure/offers-projection'
import { createMarketHandlers } from './messages'

/** Dependencies of the market module. */
export interface MarketModuleDeps {
  /** Platform event store. */
  store: EventStore
  /** Database, in which the module keeps the list of offers. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
  /** Outbox dispatch, triggered by the market module after its commands and reads. */
  dispatch: () => Promise<unknown>
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the adapters, the service, the API, the channel access rule and
 * the message handlers. Every signed-in player may listen to the market channel, a global
 * and discreet channel announcing offer changes.
 *
 * @param deps - Event store, database, projection runner, outbox dispatch and optional clock.
 * @returns The module, exposing its Hono sub-app, its channel policy and its message handlers.
 */
export function createMarketModule({ store, db, projections, dispatch, clock }: MarketModuleDeps) {
  const repo = createEventStoreOfferRepository(store)
  const reader = createDrizzleOffersReader(db, projections)
  const service = createMarketService(repo, reader, { dispatch, clock })

  const channelPolicy: ChannelPolicy = {
    prefix: MARKET_CHANNEL,
    canSubscribe: (channel) => channel === MARKET_CHANNEL,
    redact: true,
    global: { types: offersProjection.eventTypes },
  }

  return { api: createMarketApi(service), channelPolicy, handlers: createMarketHandlers(service) }
}

export type { MarketApi } from './api'
