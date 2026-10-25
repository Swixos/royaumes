import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { VillageService } from './application/village-service'
import { type DomainError, FoundVillageInput, UpgradeBuildingInput } from './contracts'

/** HTTP status code for each domain error. */
const STATUS: Record<DomainError['code'], 404 | 409 | 422> = {
  NOT_FOUNDED: 404,
  ALREADY_FOUNDED: 409,
  MAX_LEVEL_REACHED: 409,
  INSUFFICIENT_RESOURCES: 422,
  REQUIREMENTS_NOT_MET: 409,
  QUEUE_FULL: 409,
}

/**
 * Hono sub-app of the realm module, mounted on `/api/realm`. Each route turns
 * an HTTP request into a service call, then the result into an HTTP response.
 * No business rule lives here.
 *
 * @param service - Village application service.
 * @returns The realm sub-app with its chained routes.
 */
export function createRealmApi(service: VillageService) {
  return new Hono<AppEnv>()
    .get('/village', async (c) => c.json({ view: await service.getView(c.var.userId) }))

    .post('/village', validateJson(FoundVillageInput), async (c) => {
      const result = await service.execute(c.var.userId, {
        type: 'FoundVillage',
        name: c.req.valid('json').name,
      })
      return result.ok
        ? c.json({ view: result.view }, 201)
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/village/upgrade', validateJson(UpgradeBuildingInput), async (c) => {
      const result = await service.execute(c.var.userId, {
        type: 'UpgradeBuilding',
        building: c.req.valid('json').building,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
}

/** Type of the sub-app, used by the typed client of the interface. */
export type RealmApi = ReturnType<typeof createRealmApi>
