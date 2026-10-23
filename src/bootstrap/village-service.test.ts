import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { OfferView } from '@/modules/market/contracts'
import type { RankingEntry } from '@/modules/ranking/contracts'
import type { Stock } from '@/modules/realm/contracts'
import type { Db } from '@/platform/db/client'
import { createTestApi, TEST_SERVICE_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Builds a test application whose village is extracted into a separate service.
 *
 * @returns The test application.
 */
const withService = () => createTestApi({ villageService: true })

/**
 * Lists the event types of a stream in a given database, in version order.
 *
 * @param db - Database to read.
 * @param stream - Stream name.
 * @returns The event types.
 */
async function typesIn(db: Db | null, stream: string) {
  const result = await (db as Db).execute(
    sql`SELECT type FROM platform.events WHERE stream = ${stream} ORDER BY version`,
  )
  return (result as unknown as { rows: { type: string }[] }).rows.map((row) => row.type)
}

/**
 * Reads the stock of a player's village through the application gateway.
 *
 * @param api - Test application.
 * @param player - Player identifier.
 * @returns The stock.
 */
async function stockOf(api: TestApi, player: string): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

describe("Village extrait - contrat avec l'application", () => {
  it('transmet les requêtes du joueur au service, et relaie ses événements', async () => {
    const api = await withService()
    const res = await api.post('/api/realm/village', { name: 'Valombre' })
    expect(res.status).toBe(201)
    expect((await (await api.get('/api/realm/village')).json()).view.name).toBe('Valombre')

    expect(await typesIn(api.serviceDb, 'village-alice')).toEqual(['VillageFounded'])
    expect(await typesIn(api.db, 'village-alice')).toEqual(['VillageFounded'])
  })

  it('refuse toute requête au service qui ne porte pas le secret partagé (401)', async () => {
    const api = await withService()
    const service = api.service
    expect((await service?.request('/events'))?.status).toBe(401)
    const forged = await service?.request('/realm/village', {
      headers: { authorization: 'Bearer autre', 'x-player-id': 'alice' },
    })
    expect(forged?.status).toBe(401)
    const genuine = await service?.request('/events', {
      headers: { authorization: `Bearer ${TEST_SERVICE_SECRET}` },
    })
    expect(genuine?.status).toBe(200)
  })

  it('présente au Classement les villages du service, par le relais', async () => {
    const api = await withService()
    await api.post('/api/realm/village', { name: 'Valombre' })

    const res = await api.get('/api/ranking/players', 'bob')
    const { entries } = (await res.json()) as { entries: RankingEntry[] }
    expect(entries).toMatchObject([{ playerId: 'alice', label: 'Seigneur de Valombre' }])
  })

  it("réalise l'échange du Marché avec le Village extrait, sans créer ni perdre de ressource", async () => {
    const api = await withService()
    await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
    await api.post('/api/realm/village', { name: 'Roche-Haute' }, 'bob')

    const published = await api.post('/api/market/offers', {
      give: { wood: 60 },
      want: { stone: 30 },
    })
    const { offerId } = (await published.json()) as { offerId: string }
    const accepted = await api.post(`/api/market/offers/${offerId}/accept`, {}, 'bob')
    expect(((await accepted.json()) as { view: OfferView }).view.status).toBe('completed')

    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 40, stone: 80 })
    expect(await stockOf(api, 'bob')).toMatchObject({ wood: 160, stone: 20 })
    expect(await typesIn(api.db, 'village-bob')).toEqual([
      'VillageFounded',
      'ResourcesWithdrawn',
      'ResourcesDeposited',
    ])
  })

  it('reprend la saga du Marché après une panne du service', async () => {
    const api = await withService()
    await api.post('/api/realm/village', { name: 'Valombre' })

    api.setServiceUp(false)
    const published = await api.post('/api/market/offers', {
      give: { wood: 60 },
      want: { stone: 30 },
    })
    const { offerId, view } = (await published.json()) as { offerId: string; view: OfferView }
    expect(view.status).toBe('reserving')

    api.setServiceUp(true)
    api.advance(1)
    await api.get('/api/market/offers', 'bob')
    const res = await api.get(`/api/market/offers/${offerId}`)
    expect(((await res.json()) as { view: OfferView }).view.status).toBe('open')
    expect((await stockOf(api, 'alice')).wood).toBe(50)
  })

  it("exporte et efface les données du Village par l'intermédiaire du service", async () => {
    const api = await withService()
    await api.post('/api/realm/village', { name: 'Valombre' })

    const exported = await (await api.get('/api/account/export')).json()
    expect(exported.sections.realm).toMatchObject({ village: 'Valombre' })

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    for (const db of [api.serviceDb, api.db]) {
      const result = await (db as Db).execute(
        sql`SELECT data->>'name' AS name FROM platform.events WHERE type = 'VillageFounded'`,
      )
      expect((result as unknown as { rows: { name: string }[] }).rows).toEqual([
        { name: 'Village effacé' },
      ])
    }
  })
})
