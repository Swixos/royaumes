import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateQuery } from '@/platform/http/validate'
import type { ChronicleReader } from './application/chronicle-reader'
import { CHRONICLE_PAGE_SIZE, ChronicleQuery } from './contracts'

/**
 * Creates the Hono sub-app of the chronicle module, mounted on `/api/chronicle`. It has a
 * single read route, returning a page of the chronicle of the signed-in player: the
 * module accepts no command.
 *
 * @param reader - Chronicle read port.
 * @returns The chronicle sub-app.
 */
export function createChronicleApi(reader: ChronicleReader) {
  return new Hono<AppEnv>().get('/entries', validateQuery(ChronicleQuery), async (c) => {
    const { category, before } = c.req.valid('query')
    return c.json(await reader.page(c.var.userId, { category, before, limit: CHRONICLE_PAGE_SIZE }))
  })
}

/** Type of the sub-app, used by the typed client of the interface. */
export type ChronicleApi = ReturnType<typeof createChronicleApi>
