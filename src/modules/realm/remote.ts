import { Hono } from 'hono'
import {
  ConcurrencyError,
  type EventStore,
  type StoredEvent,
} from '@/platform/event-store/event-store'
import { serviceHeaders } from '@/platform/http/service-auth'
import type { AppEnv } from '@/platform/http/types'
import { forwardTo } from '@/platform/outbox/inbox-api'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { REALM_TOPICS, villageChannel } from './contracts'
import { redactVillageEvent } from './personal-data'

/** Dependencies of the remote village module. */
export interface RemoteRealmDeps {
  /** Address of the extracted village service, such as `http://localhost:4000`. */
  url: string
  /** Secret shared by the application and the service. */
  secret: string
  /** Application event store, where the relay drops a copy of the service events. */
  store: EventStore
  /** Projection runner, which keeps the position of the relay. */
  projections: ProjectionRunner
  /** Function sending requests; replaced in tests to call the service without network. */
  fetch?: typeof fetch
  /** Clock, for the rule of recent missing positions. */
  now?: () => number
}

/** Name of the relay checkpoint. */
const RELAY = 'realm-relay'

/** Delay during which a missing position of the published stream is waited for. */
const GAP_GRACE_MS = 5_000

/**
 * Creates the remote village module: it has the same shape as the in-process village (API,
 * channel rule, message handlers, personal data), but each part talks to the village
 * service over HTTP. The rest of the application sees no difference: it is the facade of
 * the strangler fig pattern.
 *
 * - The API is a gateway: it forwards each request to the service with the player's
 *   identity, then relays the events the request may have produced.
 * - Saga messages are forwarded to the service, then the events they produced are relayed.
 * - The real-time channel is unchanged: it reads the relayed copies in the local log.
 * - Player rights ask the service for export and erasure; the relayed copies in the local
 *   log are rewritten as the originals would be.
 *
 * @param deps - Service address and secret, application event store, projection runner,
 *   optional fetch and clock.
 * @returns The module, exposing its gateway sub-app, its channel policy, its message
 *   handlers, its personal data contributor and its daily relay task.
 */
export function createRemoteRealmModule({
  url,
  secret,
  store,
  projections,
  fetch: fetchFn = fetch,
  now = () => Date.now(),
}: RemoteRealmDeps) {
  /**
   * Relays the published event stream: reads the service events after its position, and
   * drops a copy into the application log. The ranking and the village real-time channel
   * thus keep reading the local log, unchanged. Each copy keeps the stream and version of
   * the original, so a copy already dropped is refused by the uniqueness constraint, which
   * makes the relay idempotent. A recent missing position may be an insert still in progress
   * in the service: the relay stops, and will resume on the next read.
   *
   * @returns The number of relayed events.
   * @throws Error if the stream of the service is unavailable.
   */
  async function relay() {
    let position = await projections.positionOf(RELAY)
    const res = await fetchFn(`${url}/events?after=${position}`, {
      headers: serviceHeaders(secret),
    })
    if (!res.ok) throw new Error(`Flux du service Village indisponible (${res.status})`)
    const { events } = (await res.json()) as { events: (StoredEvent & { occurredAt: string })[] }

    let relayed = 0
    for (const event of events) {
      const gap = event.position !== position + 1
      if (gap && now() - new Date(event.occurredAt).getTime() < GAP_GRACE_MS) break
      try {
        await store.append(event.stream, event.version - 1, [
          { type: event.type, data: event.data },
        ])
        relayed++
      } catch (error) {
        if (!(error instanceof ConcurrencyError)) throw error
      }
      position = event.position
    }
    await projections.savePosition(RELAY, position)
    return { relayed }
  }

  const api = new Hono<AppEnv>().all('/*', async (c) => {
    const target = new URL(c.req.url)
    const path = target.pathname.replace(/^\/api/, '')
    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'
    const res = await fetchFn(`${url}${path}${target.search}`, {
      method: c.req.method,
      headers: {
        ...serviceHeaders(secret, { id: c.var.userId, name: c.var.userName }),
        'content-type': c.req.header('content-type') ?? 'application/json',
      },
      body: hasBody ? await c.req.text() : undefined,
    })
    if (hasBody) await relay()
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    })
  })

  const forward = forwardTo(url, secret, fetchFn)
  /**
   * Wraps a handler so the events it produced in the service are relayed right after.
   *
   * @param handler - Handler forwarding the message to the service.
   * @returns The wrapped handler.
   */
  const relayAfter =
    (handler: MessageHandler): MessageHandler =>
    async (message) => {
      await handler(message)
      await relay()
    }
  const handlers: Record<string, MessageHandler> = {
    [REALM_TOPICS.withdraw]: relayAfter(forward),
    [REALM_TOPICS.deposit]: relayAfter(forward),
  }

  const channelPolicy: ChannelPolicy = {
    prefix: 'village-',
    canSubscribe: (channel, userId) => channel === villageChannel(userId),
  }

  const personalData: PersonalDataContributor = {
    name: 'realm',
    async export(playerId) {
      const res = await fetchFn(`${url}/personal-data/${encodeURIComponent(playerId)}`, {
        headers: serviceHeaders(secret),
      })
      if (!res.ok) throw new Error(`Export refusé par le service Village (${res.status})`)
      return res.json()
    },
    redact: redactVillageEvent,
    async erase(playerId) {
      const res = await fetchFn(`${url}/personal-data/${encodeURIComponent(playerId)}`, {
        method: 'DELETE',
        headers: serviceHeaders(secret),
      })
      if (!res.ok) throw new Error(`Effacement refusé par le service Village (${res.status})`)
    },
  }

  return { api, channelPolicy, handlers, personalData, dailyTask: relay }
}
