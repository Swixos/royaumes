import { Hono } from 'hono'
import { createRealmModule } from '@/modules/realm'
import { createSystemModule } from '@/modules/system'
import { demoUser } from '@/platform/http/demo-user'
import type { AppEnv } from '@/platform/http/types'

/** Dependencies provided to the application by its entry point. */
export interface ApiDeps {
  /** Reference clock in milliseconds; real time by default, replaced in tests. */
  clock?: () => number
}

/**
 * Composition root: the only place that knows both the technical platform
 * and every business module. Adding a module means instantiating it here
 * and mounting its API.
 *
 * @param deps - Optional dependencies, such as the clock.
 * @returns The main Hono application, with every route under `/api`.
 */
export function createApi({ clock }: ApiDeps = {}) {
  const system = createSystemModule()
  const realm = createRealmModule({ clock })

  const app = new Hono<AppEnv>().basePath('/api')

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  app.use('/realm/*', demoUser())

  return app.route('/system', system.api).route('/realm', realm.api)
}

/** Type of the whole application, inferred from its routes. */
export type Api = ReturnType<typeof createApi>
