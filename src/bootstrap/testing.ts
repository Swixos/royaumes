import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { createApi } from './create-api'

/**
 * Builds the full application on an emptied test database with a controlled
 * clock, wiring the platform the same way `server.ts` does.
 *
 * @returns The application, a JSON `post` helper and an `advance` function
 *   moving the clock forward.
 */
export async function createTestApi() {
  let now = Date.UTC(2026, 0, 1)
  const store = createEventStore(await createTestDatabase())
  const api = createApi({ store, clock: () => now })

  /**
   * Sends a POST request with a JSON body.
   *
   * @param path - Request path, starting with `/api`.
   * @param body - Value serialized as the JSON body.
   * @returns The response.
   */
  const post = (path: string, body: unknown) =>
    api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

  return { api, post, advance }
}
