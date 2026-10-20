import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventStore, StoredEvent } from '../event-store/event-store'
import type { AppEnv } from '../http/types'
import { authorize, type ChannelPolicy } from './channel-policy'

/** Options of the real-time sub-app. */
export interface RealtimeOptions {
  /** Event store: a channel maps to a stream of the store. */
  store: EventStore
  /** Channel access rules, provided by the modules. */
  policies: ChannelPolicy[]
  /** Interval between two reads of the store, in milliseconds. */
  pollMs?: number
  /** Maximum duration of a stream before it closes on purpose, in milliseconds. */
  maxStreamMs?: number
  /** Reconnection delay advised to the browser, in milliseconds. */
  retryMs?: number
  /** Maximum interval without message before a keep-alive is sent, in milliseconds. */
  pingMs?: number
}

/** Response of both routes when the channel is not allowed. */
const FORBIDDEN = { error: { code: 'FORBIDDEN', message: 'Canal non autorisé' } } as const

/**
 * Shapes an event for the browser. On a discreet channel its data is removed:
 * only the stream, version and type remain.
 *
 * @param event - Stored event.
 * @param policy - Rule of the channel.
 * @returns The event as is, or without its data on a discreet channel.
 */
function present(event: StoredEvent, policy: ChannelPolicy) {
  if (!policy.redact) return event
  return { stream: event.stream, version: event.version, type: event.type, data: {} }
}

/**
 * Real-time sub-app, mounted on `/api/stream`. Streams keep no state in memory:
 * they reread the event store, so any instance can serve any player.
 *
 * - `GET /:channel` opens a Server-Sent Events stream. It resumes after the
 *   `Last-Event-ID` header (or the `after` query parameter), sends a `ready`
 *   message with the reconnection delay, then polls the store and sends each new
 *   event with its version as SSE id. A comment is written as keep-alive when
 *   nothing was sent for `pingMs`, so network intermediaries keep the connection
 *   open. The stream ends when the browser disconnects or after `maxStreamMs`,
 *   and the browser reconnects on its own.
 * - `GET /:channel/events` is a non-streaming fallback returning the events after
 *   `after` as JSON.
 *
 * Both routes present events through the channel rule, so a discreet channel
 * never leaks event data.
 *
 * @param options - Event store, channel rules and timing settings.
 * @returns The real-time sub-app.
 */
export function createRealtimeApi({
  store,
  policies,
  pollMs = 500,
  maxStreamMs = 240_000,
  retryMs = 1_000,
  pingMs = 15_000,
}: RealtimeOptions) {
  return new Hono<AppEnv>()
    .get('/:channel', async (c) => {
      const channel = c.req.param('channel')
      const policy = await authorize(policies, channel, c.var.userId)
      if (!policy) return c.json(FORBIDDEN, 403)

      let lastVersion = Number(c.req.header('last-event-id') ?? c.req.query('after') ?? 0) || 0

      return streamSSE(c, async (stream) => {
        let aborted = false
        stream.onAbort(() => {
          aborted = true
        })
        const deadline = Date.now() + maxStreamMs
        let lastWrite = Date.now()

        await stream.writeSSE({ event: 'ready', data: String(lastVersion), retry: retryMs })

        while (!aborted && Date.now() < deadline) {
          const fresh = await store.read(channel, lastVersion)
          for (const event of fresh) {
            await stream.writeSSE({
              id: String(event.version),
              event: 'domain-event',
              data: JSON.stringify(present(event, policy)),
            })
            lastVersion = event.version
            lastWrite = Date.now()
          }
          if (Date.now() - lastWrite > pingMs) {
            await stream.write(': ping\n\n')
            lastWrite = Date.now()
          }
          await stream.sleep(pollMs)
        }
      })
    })

    .get('/:channel/events', async (c) => {
      const channel = c.req.param('channel')
      const policy = await authorize(policies, channel, c.var.userId)
      if (!policy) return c.json(FORBIDDEN, 403)
      const after = Number(c.req.query('after') ?? 0) || 0
      const events = await store.read(channel, after)
      return c.json({ events: events.map((event) => present(event, policy)) })
    })
}
