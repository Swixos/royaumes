import { Hono } from 'hono'

/**
 * Hono sub-app of the system module, mounted on `/api/system`. Routes are
 * chained so the returned type describes each route, its method and response.
 *
 * @param startedAt - Module start time in milliseconds, used for the uptime.
 * @returns The system sub-app exposing `GET /health`.
 */
export function createSystemApi(startedAt: number) {
  return new Hono().get('/health', (c) =>
    c.json({
      ok: true,
      time: new Date().toISOString(),
      uptime: Math.round((Date.now() - startedAt) / 1000),
    }),
  )
}

/** Type of the sub-app, used by the typed client of the interface. */
export type SystemApi = ReturnType<typeof createSystemApi>
