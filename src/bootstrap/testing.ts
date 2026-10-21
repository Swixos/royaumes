import type { AuthPort } from '@/platform/auth/port'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
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

/** Player a test request is sent as; `null` for an anonymous request. */
type TestUser = string | null

/**
 * Builds the full application on an emptied test database, with a controlled
 * clock, the test authentication adapter and very short real-time streams so
 * tests never hang on an open stream. The outbox dispatcher compares the availability
 * of messages, set by the database in real time, with its own clock: that clock starts
 * at real time and moves forward with the application clock.
 *
 * @returns The application, `get` and `post` helpers sending requests as a
 *   player, and an `advance` function moving the clock forward.
 */
export async function createTestApi() {
  const start = Date.UTC(2026, 0, 1)
  let now = start
  const db = await createTestDatabase()
  const store = createEventStore(db)
  const api = createApi({
    auth: testAuth,
    db,
    store,
    clock: () => now,
    realtime: { pollMs: 20, maxStreamMs: 150 },
    cronSecret: TEST_CRON_SECRET,
    outbox: { now: () => Date.now() + (now - start) },
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

  return { api, get, post, advance }
}
