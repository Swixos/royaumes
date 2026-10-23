import type { AuthPort } from '@/platform/auth/port'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { createVillageServiceApp } from '@/services/village/village-service'
import { createApi } from './create-api'

/**
 * Authentication adapter for tests only: the player is identified by the
 * `x-test-user` header, without account or cookie. Never used by `server.ts`.
 */
export const testAuth: AuthPort = {
  handler: async () => new Response(null, { status: 404 }),
  getUser: async (headers) => {
    const id = headers.get('x-test-user')
    return id ? { id, name: id } : null
  },
}

/** Secret of the scheduled task, in tests. */
export const TEST_CRON_SECRET = 'secret-de-test'
/** Secret shared with the extracted village service, in tests. */
export const TEST_SERVICE_SECRET = 'secret-de-service'

/** Player a test request is sent as; `null` for an anonymous request. */
type TestUser = string | null

/**
 * Builds the full application on an emptied test database, with a controlled
 * clock, the test authentication adapter and very short real-time streams so
 * tests never hang on an open stream. The outbox dispatcher compares the availability
 * of messages, set by the database in real time, with its own clock: that clock starts
 * at real time and moves forward with the application clock.
 *
 * With `villageService`, the village is extracted into a separate service with its own
 * database. The application and the service call each other without network: each one
 * hands its requests straight to the other through Hono's `request` method. A test can
 * simulate an outage of the service, then its recovery.
 *
 * @param options - Whether to extract the village into a separate service.
 * @returns The application, its database, so tests can check stored rows, the service and
 *   its database if any, `get` and `post` helpers sending requests as a player, an
 *   `advance` function moving the clock forward and `setServiceUp` simulating an outage.
 */
export async function createTestApi({ villageService = false } = {}) {
  const start = Date.UTC(2026, 0, 1)
  let now = start
  const db = await createTestDatabase()
  const store = createEventStore(db)
  const serviceDb = villageService ? await createTestDatabase('village') : null
  let serviceUp = true
  const service = serviceDb
    ? createVillageServiceApp({
        db: serviceDb,
        secret: TEST_SERVICE_SECRET,
        appUrl: 'http://app.test',
        clock: () => now,
        fetch: async (input, init) => api.request(String(input), init),
      })
    : null
  const api = createApi({
    auth: testAuth,
    db,
    store,
    clock: () => now,
    realtime: { pollMs: 20, maxStreamMs: 150 },
    cronSecret: TEST_CRON_SECRET,
    outbox: { now: () => Date.now() + (now - start) },
    realmService: service
      ? {
          url: 'http://village.test',
          secret: TEST_SERVICE_SECRET,
          fetch: async (input, init) => {
            if (!serviceUp) throw new TypeError('fetch failed : service Village injoignable')
            return service.request(String(input), init)
          },
        }
      : undefined,
  })

  /**
   * Builds the headers identifying a player.
   *
   * @param user - Player, or `null` for an anonymous request.
   * @returns The `x-test-user` header, or no header.
   */
  const as = (user: TestUser): Record<string, string> => (user ? { 'x-test-user': user } : {})

  /**
   * Sends a GET request.
   *
   * @param path - Request path, starting with `/api`.
   * @param user - Player sending the request; `alice` by default.
   * @returns The response.
   */
  const get = (path: string, user: TestUser = 'alice') => api.request(path, { headers: as(user) })

  /**
   * Sends a POST request with a JSON body.
   *
   * @param path - Request path, starting with `/api`.
   * @param body - Value serialized as the JSON body.
   * @param user - Player sending the request; `alice` by default.
   * @returns The response.
   */
  const post = (path: string, body: unknown, user: TestUser = 'alice') =>
    api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...as(user) },
      body: JSON.stringify(body),
    })

  /**
   * Moves the application clock forward.
   *
   * @param minutes - Number of minutes to add.
   */
  const advance = (minutes: number) => {
    now += minutes * 60_000
  }

  /**
   * Simulates an outage of the extracted village service, or its recovery.
   *
   * @param up - Whether the service answers.
   */
  const setServiceUp = (up: boolean) => {
    serviceUp = up
  }

  return { api, db, service, serviceDb, get, post, advance, setServiceUp }
}
