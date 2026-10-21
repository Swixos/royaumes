import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { PresentPlayer } from '@/modules/tavern/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Sends the presence signal of a player.
 *
 * @param api - Test application.
 * @param player - Player identifier.
 * @returns The present players.
 */
async function beat(api: TestApi, player: string) {
  const res = await api.post('/api/tavern/presence', {}, player)
  return ((await res.json()) as { players: PresentPlayer[] }).players
}

/**
 * Reads the names of the present players, as seen by Alice.
 *
 * @param api - Test application.
 * @returns The names of the present players.
 */
async function present(api: TestApi) {
  const res = await api.get('/api/tavern/presence')
  return ((await res.json()) as { players: PresentPlayer[] }).players.map((p) => p.name)
}

describe('Présence dans la Taverne', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.post('/api/tavern/presence', {}, null)).status).toBe(401)
  })

  it('signale la présence du joueur, et renvoie les joueurs présents', async () => {
    const api = await createTestApi()
    await beat(api, 'bob')
    expect((await beat(api, 'alice')).map((p) => p.name)).toEqual(['alice', 'bob'])
  })

  it('considère comme parti un joueur sans signal depuis deux minutes, et supprime sa ligne', async () => {
    const api = await createTestApi()
    await beat(api, 'alice')
    await beat(api, 'bob')
    api.advance(1)
    await beat(api, 'bob')
    api.advance(1.5)

    expect(await present(api)).toEqual(['bob'])
    const result = await api.db.execute(sql`SELECT player_id FROM tavern.presence`)
    const rows = (result as unknown as { rows: { player_id: string }[] }).rows
    expect(rows.map((row) => row.player_id)).toEqual(['bob'])
  })

  it('retire aussitôt un joueur qui quitte la Taverne', async () => {
    const api = await createTestApi()
    await beat(api, 'alice')
    await beat(api, 'bob')
    expect((await api.post('/api/tavern/presence/leave', {}, 'bob')).status).toBe(204)
    expect(await present(api)).toEqual(['alice'])
  })
})
