import { Hono } from 'hono'
import { createRealmModule } from '@/modules/realm'
import { createSystemModule } from '@/modules/system'
import type { AuthPort } from '@/platform/auth/port'
import type { EventStore } from '@/platform/event-store/event-store'
import { requireUser } from '@/platform/http/require-user'
import type { AppEnv } from '@/platform/http/types'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRealtimeApi, type RealtimeOptions } from '@/platform/realtime/stream-api'

/** Dependencies provided to the application by its entry point. */
export interface ApiDeps {
  /** Authentication: Better Auth in production, a simplified adapter in tests. */
  auth: AuthPort
  /** Event store, passed to the modules using it. */
  store: EventStore
  /** Awaited before each request; resolves once the database is migrated. */
  ready?: Promise<void>
  /** Reference clock in milliseconds; real time by default, replaced in tests. */
  clock?: () => number
  /** Real-time settings (stream duration, polling interval); shortened in tests. */
  realtime?: Partial<Omit<RealtimeOptions, 'store' | 'policies'>>
}

/**
 * Composition root: the only place that knows both the technical platform
 * and every business module. Adding a module means instantiating it here
 * and mounting its API.
 *
 * No request is handled before the database is ready. `/api/auth/*` is fully
 * handled by the authentication adapter. Routes reserved to signed-in players
 * are protected one by one: every new protected module must be added here, or
 * its routes stay open.
 *
 * Channel access rules declared by the modules are gathered here and passed to
 * the real-time sub-app; with no rule, every channel is refused.
 *
 * @param deps - Authentication, event store, database readiness, optional clock
 *   and real-time settings.
 * @returns The main Hono application, with every route under `/api`.
 */
export function createApi({ auth, store, ready, clock, realtime }: ApiDeps) {
  const system = createSystemModule()
  const realm = createRealmModule({ store, clock })

  const policies: ChannelPolicy[] = [realm.channelPolicy]

  const app = new Hono<AppEnv>().basePath('/api')

  app.use(async (_c, next) => {
    await ready
    await next()
  })

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))

  app.use('/realm/*', requireUser(auth))
  app.use('/stream/*', requireUser(auth))

  return app
    .route('/system', system.api)
    .route('/realm', realm.api)
    .route('/stream', createRealtimeApi({ store, policies, ...realtime }))
}

/** Type of the whole application, inferred from its routes. */
export type Api = ReturnType<typeof createApi>
