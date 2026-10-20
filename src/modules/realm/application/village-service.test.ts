import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import { ConcurrencyError, createEventStore } from '@/platform/event-store/event-store'
import type { VillageEvent } from '../domain/village'
import { createEventStoreVillageRepository } from '../infrastructure/event-store-village-repository'
import type { VillageRepository } from './village-repository'
import { createVillageService } from './village-service'

let repo: VillageRepository
let now: number
const advance = (minutes: number) => {
  now += minutes * 60_000
}
const service = () => createVillageService(repo, () => now)

beforeEach(async () => {
  repo = createEventStoreVillageRepository(createEventStore(await createTestDatabase()))
  now = Date.UTC(2026, 0, 1)
})

describe('Service du Village', () => {
  it("n'a aucune vue tant que le village n'est pas fondé", async () => {
    expect(await service().getView('alice')).toBeNull()
  })

  it('fonde un village et renvoie sa vue', async () => {
    const result = await service().execute('alice', { type: 'FoundVillage', name: 'Valombre' })

    expect(result.ok).toBe(true)
    expect((await service().getView('alice'))?.name).toBe('Valombre')
  })

  it('enregistre les événements et fait évoluer la vue avec le temps', async () => {
    await service().execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    advance(5)
    await service().execute('alice', { type: 'UpgradeBuilding', building: 'mine' })
    advance(10)

    const view = await service().getView('alice')
    expect(view?.levels.mine).toBe(1)
    expect(view?.stock).toEqual({ wood: 170, stone: 80, gold: 20 })
  })

  it("renvoie l'erreur métier sans rien enregistrer", async () => {
    await service().execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    const result = await service().execute('alice', { type: 'FoundVillage', name: 'Autre' })

    expect(result).toEqual({ ok: false, error: { code: 'ALREADY_FOUNDED' } })
    expect((await repo.load('alice')).version).toBe(1)
  })

  it('isole les villages des différents joueurs', async () => {
    await service().execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    expect(await service().getView('bob')).toBeNull()
  })

  it("rejoue une commande concurrente et n'accepte qu'une amélioration payée une fois", async () => {
    await service().execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    advance(5)
    const upgrade = { type: 'UpgradeBuilding', building: 'sawmill' } as const

    const results = await Promise.all([
      service().execute('alice', upgrade),
      service().execute('alice', upgrade),
    ])

    expect(results.map((r) => r.ok).sort()).toEqual([false, true])
    expect(results.find((r) => !r.ok)).toEqual({
      ok: false,
      error: { code: 'INSUFFICIENT_RESOURCES', missing: { wood: 115, stone: 52 } },
    })
    expect((await service().getView('alice'))?.levels.sawmill).toBe(2)
  })
})

describe('Adaptateur fondé sur le journal', () => {
  it('refuse un enregistrement fondé sur une version périmée', async () => {
    const founded: VillageEvent = { type: 'VillageFounded', data: { name: 'Valombre', at: 0 } }
    await repo.save('alice', 0, [founded])

    await expect(repo.save('alice', 0, [founded])).rejects.toBeInstanceOf(ConcurrencyError)
  })
})
