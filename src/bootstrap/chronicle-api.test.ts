import { describe, expect, it } from 'vitest'
import type { ChroniclePage } from '@/modules/chronicle/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Reads a page of the chronicle through the API.
 *
 * @param api - Test application.
 * @param player - Player whose chronicle is read.
 * @param query - Query string of the page.
 * @returns The page, as returned by the API.
 */
async function chronicle(api: TestApi, player = 'alice', query = '') {
  const res = await api.get(`/api/chronicle/entries${query}`, player)
  return (await res.json()) as ChroniclePage
}

describe('API du module Historique', () => {
  it('refuse une requête anonyme (401), et une partie du jeu inconnue (400)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/chronicle/entries', null)).status).toBe(401)
    expect((await api.get('/api/chronicle/entries?category=tavern')).status).toBe(400)
  })

  it("rassemble le village, le donjon, le marché et la flotte d'un joueur", async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
    await api.post('/api/realm/village', { name: 'Roche-Haute' }, 'bob')
    api.advance(60)
    await api.post('/api/realm/village/upgrade', { building: 'sawmill' }, 'alice')
    await api.post('/api/dungeon/games', {}, 'alice')
    await api.post('/api/market/offers', { give: { wood: 10 }, want: { stone: 5 } }, 'alice')
    await api.post(
      '/api/fleet/raids',
      { target: { kind: 'village', playerId: 'bob' }, ships: 1, tactic: 'ram' },
      'alice',
    )

    const { entries } = await chronicle(api)
    expect(new Set(entries.map((entry) => entry.type))).toEqual(
      new Set([
        'village-founded',
        'building-ordered',
        'expedition-created',
        'offer-published',
        'raid-launched',
      ]),
    )
    const positions = entries.map((entry) => entry.position)
    expect(positions).toEqual([...positions].sort((a, b) => b - a))
    expect((await chronicle(api, 'alice', '?category=village')).entries).toHaveLength(2)
    expect((await chronicle(api, 'bob')).entries.map((entry) => entry.type)).toContain(
      'village-founded',
    )
  })

  it('reprend le nom rectifié dans l’historique des autres joueurs', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
    const { gameId } = await (await api.post('/api/dungeon/games', {}, 'alice')).json()
    await api.post(`/api/dungeon/games/${gameId}/join`, {}, 'bob')
    expect((await chronicle(api, 'bob')).entries[0]).toMatchObject({ host: 'alice' })

    await api.api.request('/api/account/name', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-user': 'alice' },
      body: JSON.stringify({ name: 'Aliénor' }),
    })
    expect((await chronicle(api, 'bob')).entries[0]).toMatchObject({ host: 'Aliénor' })

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    expect((await chronicle(api, 'bob')).entries[0]).toMatchObject({ host: 'Joueur effacé' })
  })
})
