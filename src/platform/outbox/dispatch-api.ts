import { Hono } from 'hono'
import type { AppEnv } from '../http/types'
import type { Dispatcher } from './outbox'

/**
 * Creates the sub-app of the scheduled dispatch, mounted on `/api/outbox`. The Vercel
 * scheduled task calls the route with the `Authorization: Bearer <CRON_SECRET>` header;
 * any other request is refused. Without a configured secret the route stays closed: it
 * must never be open by default.
 *
 * @param dispatcher - Outbox dispatcher.
 * @param secret - Secret expected in the `Authorization` header, if configured.
 * @returns The dispatch sub-app.
 */
export function createDispatchApi(dispatcher: Dispatcher, secret: string | undefined) {
  return new Hono<AppEnv>().get('/dispatch', async (c) => {
    if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    const result = await dispatcher.dispatch()
    // DETTE TECHNIQUE DT-007 (docs/qualite/dette-technique.md): abandoned messages are only
    // counted; no tool lets anyone review or retry them.
    return c.json({ ...result, ...(await dispatcher.status()) })
  })
}
