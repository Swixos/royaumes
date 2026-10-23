import { describe, expect, it } from 'vitest'
import { createTestApi } from './testing'

describe("Assemblage de l'API", () => {
  it('monte le module System sous /api/system', async () => {
    const { api } = await createTestApi()
    const res = await api.request('/api/system/health')
    expect(res.status).toBe(200)
  })

  it('renvoie une erreur JSON uniforme pour une route inconnue', async () => {
    const { api } = await createTestApi()
    const res = await api.request('/api/inconnue')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route inconnue' },
    })
  })

  it('réserve le temps réel aux joueurs connectés (401)', async () => {
    const { get } = await createTestApi()
    expect((await get('/api/stream/village-alice', null)).status).toBe(401)
  })
})

/**
 * Routes reachable without a player session, each for a stated reason: authentication
 * itself, the health route, the scheduled task (protected by its own secret) and the inbox
 * of an extracted service (protected by a signed token).
 */
const PUBLIC_ROUTES = [/^\/api\/auth\//, /^\/api\/system\//, /^\/api\/cron\//, /^\/api\/internal\//]

describe("Contrôle d'accès généralisé", () => {
  it('refuse une requête anonyme sur toute route qui ne figure pas dans la liste des routes publiques', async () => {
    const { api } = await createTestApi()
    const routes = api.routes.filter(
      (route) =>
        route.method !== 'ALL' && !PUBLIC_ROUTES.some((pattern) => pattern.test(route.path)),
    )
    expect(routes.length).toBeGreaterThan(20)

    for (const route of routes) {
      const path = route.path.replace(/:[^/]+/g, 'x')
      const res = await api.request(path, { method: route.method })
      expect(res.status, `${route.method} ${route.path}`).toBe(401)
    }
  })
})
