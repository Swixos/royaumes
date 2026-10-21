import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import type { RankingReader } from './application/ranking-reader'
import { RANKING_SIZE } from './contracts'

/**
 * Creates the Hono sub-app of the ranking module, mounted on `/api/ranking`. It has a
 * single read route: the module accepts no command.
 *
 * @param reader - Ranking read port.
 * @returns The ranking sub-app.
 */
export function createRankingApi(reader: RankingReader) {
  return new Hono<AppEnv>().get('/players', async (c) =>
    c.json({ entries: await reader.top(RANKING_SIZE) }),
  )
}

/** Type of the sub-app, used by the typed client of the interface. */
export type RankingApi = ReturnType<typeof createRankingApi>
