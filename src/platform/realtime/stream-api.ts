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
 * only the position, stream, version and type remain.
 *
 * @param event - Stored event.
 * @param policy - Rule of the channel.
 * @returns The event as is, or without its data on a discreet channel.
 */
function present(event: StoredEvent, policy: ChannelPolicy) {
  if (!policy.redact) return event
  return {
    position: event.position,
    stream: event.stream,
    version: event.version,
    type: event.type,
    data: {},
  }
}

/** Source of the events of a channel: how to read them, and how to identify them. */
interface ChannelSource {
  /**
   * Reads the events after an identifier, in order.
   *
   * @param after - Identifier of the last event already sent.
   * @returns The later events.
   */
  read(after: number): Promise<StoredEvent[]>
  /**
   * Identifies an event, as sent back by the browser in `Last-Event-ID`.
   *
   * @param event - Event to identify.
   * @returns Its identifier.
   */
  idOf(event: StoredEvent): number
  /**
   * Gives the starting identifier, when the browser provides none.
   *
   * @returns The identifier to read after.
   */
  start(): Promise<number>
}

/**
 * Builds the event source of a channel. A regular channel is a stream of the log,
 * whose events are identified by their version and sent from the start. A global
 * channel follows the whole log: its events are identified by their position, and
 * only upcoming events are sent.
 *
 * @param store - Event store.
 * @param channel - Channel name.
 * @param policy - Access rule matching the channel.
 * @returns The source of the channel events.
 */
function sourceOf(store: EventStore, channel: string, policy: ChannelPolicy): ChannelSource {
  const global = policy.global
  if (global) {
    return {
      read: (after) => store.readAll({ types: global.types, afterPosition: after }),
      idOf: (event) => event.position,
      start: () => store.lastPosition(),
    }
  }
  return {
    read: (after) => store.read(channel, after),
    idOf: (event) => event.version,
    start: async () => 0,
  }
}

/**
 * Resolves the identifier to resume from.
 *
 * @param given - Identifier provided by the browser (header or parameter), if any.
 * @param source - Source of the channel events.
 * @returns The given identifier, or the starting one of the source.
 */
async function startFrom(given: string | undefined, source: ChannelSource) {
  return given === undefined ? source.start() : Number(given) || 0
}

/**
 * Real-time sub-app, mounted on `/api/stream`. Streams keep no state in memory:
 * they reread the event store, so any instance can serve any player.
 *
 * - `GET /:channel` opens a Server-Sent Events stream. It resumes after the
 *   `Last-Event-ID` header (or the `after` query parameter), sends a `ready`
 *   message with the reconnection delay, then polls the store and sends each new
 *   event with its identifier as SSE id: its version, or its position on a global
 *   channel. A comment is written as keep-alive when
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

      const source = sourceOf(store, channel, policy)

      let lastId = await startFrom(c.req.header('last-event-id') ?? c.req.query('after'), source)

      return streamSSE(c, async (stream) => {
        let aborted = false
        stream.onAbort(() => {
          aborted = true
        })
        const deadline = Date.now() + maxStreamMs
        let lastWrite = Date.now()

        await stream.writeSSE({ event: 'ready', data: String(lastId), retry: retryMs })

        while (!aborted && Date.now() < deadline) {
          const fresh = await source.read(lastId)
          for (const event of fresh) {
            lastId = source.idOf(event)
            await stream.writeSSE({
              id: String(lastId),
              event: 'domain-event',
              data: JSON.stringify(present(event, policy)),
            })
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
      const source = sourceOf(store, channel, policy)
      const events = await source.read(await startFrom(c.req.query('after'), source))
      return c.json({ events: events.map((event) => present(event, policy)) })
    })
}
