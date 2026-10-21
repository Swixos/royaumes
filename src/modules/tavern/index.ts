/**
 * Server public entry of the tavern module. Along with `contracts.ts` and
 * `ui.tsx`, it is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createTavernApi } from './api'
import { createTavernService } from './application/tavern-service'
import { MESSAGE_POSTED, TAVERN_CHANNEL } from './contracts'
import { createDrizzleMessageRepository } from './infrastructure/drizzle-message-repository'

/** Dependencies of the tavern module. */
export interface TavernModuleDeps {
  /** Database, in which the tavern keeps its tables. */
  db: Db
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/** Maximum number of messages sent at a time by the channel. */
const CHANNEL_BATCH = 100

/**
 * Module factory: wires the adapter, the service, the API and the channel access rule.
 * Every signed-in player may listen to the tavern channel. It does not read the log but
 * the messages table: each message is presented as an event whose position is the
 * message identifier. The channel is not discreet, since messages are meant for every
 * player and the interface shows them without rereading the API. A new subscriber only
 * receives upcoming messages; the history is read through the API.
 *
 * @param deps - Database and optional clock.
 * @returns The module, exposing its Hono sub-app and its channel policy.
 */
export function createTavernModule({ db, clock }: TavernModuleDeps) {
  const repo = createDrizzleMessageRepository(db)
  const service = createTavernService(repo, clock)

  const channelPolicy: ChannelPolicy = {
    prefix: TAVERN_CHANNEL,
    canSubscribe: (channel) => channel === TAVERN_CHANNEL,
    source: {
      async read(after) {
        const fresh = await repo.after(after, CHANNEL_BATCH)
        return fresh.map((message) => ({
          position: message.id,
          stream: TAVERN_CHANNEL,
          version: message.id,
          type: MESSAGE_POSTED,
          data: { ...message },
          occurredAt: new Date(message.postedAt),
        }))
      },
      start: () => repo.lastId(),
    },
  }

  return { api: createTavernApi(service), channelPolicy }
}

export type { TavernApi } from './api'
