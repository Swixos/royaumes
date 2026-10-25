import { describe, expect, it } from 'vitest'
import type { TutorialView } from '@/modules/tutorial/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Reads the tutorial of a player through the API.
 *
 * @param api - Test application.
 * @returns The view of the tutorial.
 */
async function tutorial(api: TestApi) {
  const res = await api.get('/api/tutorial')
  return ((await res.json()) as { view: TutorialView }).view
}

/**
 * Reads the stock of the village of a player through the API.
 *
 * @param api - Test application.
 * @returns The stock of the village.
 */
async function stock(api: TestApi) {
  const res = await api.get('/api/realm/village')
  return ((await res.json()) as { view: { stock: Record<string, number> } }).view.stock
}

describe('API du module Tutoriel', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/tutorial', null)).status).toBe(401)
  })

  it('démarre le tutoriel, le met en pause et le reprend', async () => {
    const api = await createTestApi()
    expect(await tutorial(api)).toMatchObject({ started: false, current: 'sawmill-2' })
    await api.post('/api/tutorial/start', {})
    expect(await tutorial(api)).toMatchObject({ started: true, paused: false })
    await api.post('/api/tutorial/pause', {})
    expect(await tutorial(api)).toMatchObject({ paused: true })
    await api.post('/api/tutorial/resume', {})
    expect(await tutorial(api)).toMatchObject({ paused: false })
  })

  it('suit le chantier de la quête, puis verse sa récompense au village une seule fois', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' })
    await api.post('/api/tutorial/start', {})
    expect((await api.post('/api/tutorial/quests/sawmill-2/claim', {})).status).toBe(409)

    await api.post('/api/realm/village/upgrade', { building: 'sawmill' })
    const ordered = await tutorial(api)
    expect(ordered.quests[0]).toMatchObject({
      status: 'active',
      progress: { current: 1, target: 2, pending: true },
    })

    api.advance(5)
    expect((await tutorial(api)).quests[0].status).toBe('ready')
    const before = await stock(api)
    const res = await api.post('/api/tutorial/quests/sawmill-2/claim', {})
    expect(res.status).toBe(200)
    const body = (await res.json()) as { view: TutorialView; reward: Record<string, number> }
    expect(body.reward).toEqual({ wood: 80, stone: 40 })
    expect(body.view).toMatchObject({ current: 'quarry-2', claimed: 1 })
    const after = await stock(api)
    expect(after.wood - before.wood).toBeGreaterThanOrEqual(80)
    expect(after.stone - before.stone).toBeGreaterThanOrEqual(40)

    expect((await api.post('/api/tutorial/quests/sawmill-2/claim', {})).status).toBe(409)
    expect((await api.post('/api/tutorial/quests/shipyard-1/claim', {})).status).toBe(409)
    expect((await api.post('/api/tutorial/quests/dragon/claim', {})).status).toBe(404)
  })

  it('reconnaît les faits accomplis dans les autres modules', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Valombre' })
    await api.post('/api/market/offers', { give: { wood: 10 }, want: { stone: 5 } })
    await api.post('/api/dungeon/games', {})
    const view = await tutorial(api)
    const byId = Object.fromEntries(view.quests.map((quest) => [quest.id, quest.progress.done]))
    expect(byId).toMatchObject({ offer: true, expedition: true, 'pirate-raid': false })
  })
})
