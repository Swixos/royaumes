import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '../db/client'
import { createEventStore, type EventStore } from '../event-store/event-store'
import type { AppEnv } from '../http/types'
import type { ChannelPolicy } from './channel-policy'
import { createRealtimeApi } from './stream-api'

/** Test rule: a player only listens to the `test-<player>` channel. */
const policy: ChannelPolicy = {
  prefix: 'test-',
  canSubscribe: (channel, userId) => channel === `test-${userId}`,
}

let store: EventStore
let app: Hono<AppEnv>

beforeEach(async () => {
  store = createEventStore(await createTestDatabase())
  app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('userId', c.req.header('x-test-user') ?? '')
      await next()
    })
    .route(
      '/stream',
      createRealtimeApi({ store, policies: [policy], pollMs: 20, maxStreamMs: 150 }),
    )
})

/**
 * Opens a stream as alice and reads its response until it closes on purpose.
 *
 * @param path - Stream path.
 * @param headers - Extra request headers, such as `last-event-id`.
 * @returns The status code and the full response body.
 */
async function readStream(path: string, headers: Record<string, string> = {}) {
  const res = await app.request(path, { headers: { 'x-test-user': 'alice', ...headers } })
  return { status: res.status, body: await res.text() }
}

/**
 * Extracts the ids of the `domain-event` messages of a stream, in order.
 * Messages are separated by a blank line and their field order is free.
 *
 * @param body - Full stream body.
 * @returns The SSE ids.
 */
function eventIds(body: string): string[] {
  return body
    .split('\n\n')
    .filter((message) => message.includes('event: domain-event'))
    .map((message) => message.match(/^id: (\d+)$/m)?.[1] ?? '')
}

describe('Flux temps réel', () => {
  it('annonce son ouverture avec un délai de reconnexion', async () => {
    const { status, body } = await readStream('/stream/test-alice')

    expect(status).toBe(200)
    expect(body).toContain('event: ready')
    expect(body).toContain('retry: 1000')
  })

  it('transmet les événements du canal, identifiés par leur version', async () => {
    await store.append('test-alice', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
    ])
    const { body } = await readStream('/stream/test-alice')

    expect(eventIds(body)).toEqual(['1', '2'])
    expect(body).toContain('"type":"B"')
  })

  it('transmet un événement enregistré pendant que le flux est ouvert', async () => {
    const reading = readStream('/stream/test-alice')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await store.append('test-alice', 0, [{ type: 'A', data: {} }])

    expect(eventIds((await reading).body)).toEqual(['1'])
  })

  it('reprend après Last-Event-ID, sans perte ni doublon', async () => {
    await store.append('test-alice', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
      { type: 'C', data: {} },
    ])
    const { body } = await readStream('/stream/test-alice', { 'last-event-id': '2' })

    expect(eventIds(body)).toEqual(['3'])
  })

  it("refuse le canal d'un autre joueur (403)", async () => {
    const { status } = await readStream('/stream/test-bob')
    expect(status).toBe(403)
  })

  it("refuse un canal qu'aucune règle ne couvre (403)", async () => {
    const { status } = await readStream('/stream/inconnu-alice')
    expect(status).toBe(403)
  })

  it('fournit une route de repli sans diffusion progressive', async () => {
    await store.append('test-alice', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
    ])
    const res = await app.request('/stream/test-alice/events?after=1', {
      headers: { 'x-test-user': 'alice' },
    })
    const { events } = await res.json()

    expect(events.map((e: { type: string }) => e.type)).toEqual(['B'])
  })
})
