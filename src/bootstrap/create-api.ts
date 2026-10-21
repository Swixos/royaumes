import { Hono } from 'hono'
import { createDungeonModule } from '@/modules/dungeon'
import { createMarketModule } from '@/modules/market'
import { createRankingModule } from '@/modules/ranking'
import { createRealmModule } from '@/modules/realm'
import { createSystemModule } from '@/modules/system'
import { createTavernModule } from '@/modules/tavern'
import { createIdentityPersonalData } from '@/platform/auth/personal-data'
import type { AuthPort } from '@/platform/auth/port'
import { createCronApi } from '@/platform/cron/cron-api'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import { requireUser } from '@/platform/http/require-user'
import type { AppEnv } from '@/platform/http/types'
import { createDispatcher, type DispatcherOptions } from '@/platform/outbox/outbox'
import { createPrivacyService } from '@/platform/privacy/privacy'
import { createPrivacyApi } from '@/platform/privacy/privacy-api'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createRealtimeApi, type RealtimeOptions } from '@/platform/realtime/stream-api'

/** Dependencies provided to the application by its entry point. */
export interface ApiDeps {
  /** Authentication: Better Auth in production, a simplified adapter in tests. */
  auth: AuthPort
  /** Database, in which the projection runner keeps the read models. */
  db: Db
  /** Event store, passed to the modules using it. */
  store: EventStore
  /** Awaited before each request; resolves once the database is migrated. */
  ready?: Promise<void>
  /** Reference clock in milliseconds; real time by default, replaced in tests. */
  clock?: () => number
  /** Real-time settings (stream duration, polling interval); shortened in tests. */
  realtime?: Partial<Omit<RealtimeOptions, 'store' | 'policies'>>
  /** Secret expected from the scheduled task dispatching the outbox; route closed without it. */
  cronSecret?: string
  /** Outbox dispatcher settings; its clock is shifted in tests. */
  outbox?: DispatcherOptions
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
 * the real-time sub-app; with no rule, every channel is refused. The projection
 * runner and the outbox dispatcher are created here from the database, and shared by
 * the modules, which hand their message handlers to the dispatcher. The market module
 * triggers a dispatch after its commands and reads.
 *
 * Player rights rely on the personal data each module provides; identity comes last,
 * so a player can restart an interrupted erasure as long as their account exists. The
 * daily tasks (dispatch of pending outbox messages, retention of tavern data) are
 * mounted outside the player routes: they authenticate the Vercel scheduled task with a
 * secret, not a player session. Abandoned outbox messages produce a warning in the logs:
 * they call for a review with the `scripts/dead-letters.ts` script.
 *
 * @param deps - Authentication, database, event store, database readiness, optional clock,
 *   real-time settings, scheduled task secret and outbox settings.
 * @returns The main Hono application, with every route under `/api`.
 */
export function createApi({
  auth,
  db,
  store,
  ready,
  clock,
  realtime,
  cronSecret,
  outbox,
}: ApiDeps) {
  const projections = createProjectionRunner(db)
  const dispatcher = createDispatcher(db, outbox)
  const system = createSystemModule()
  const realm = createRealmModule({ store, clock })
  const dungeon = createDungeonModule({ store, db, projections, clock })
  const ranking = createRankingModule({ db, projections })
  const market = createMarketModule({
    store,
    db,
    projections,
    dispatch: () => dispatcher.dispatch(),
    clock,
  })
  const tavern = createTavernModule({ db, clock })
  const privacy = createPrivacyService(
    db,
    [
      realm.personalData,
      dungeon.personalData,
      market.personalData,
      ranking.personalData,
      tavern.personalData,
      createIdentityPersonalData(db),
    ],
    clock,
  )
  dispatcher.register(realm.handlers)
  dispatcher.register(market.handlers)

  const policies: ChannelPolicy[] = [
    realm.channelPolicy,
    dungeon.channelPolicy,
    ranking.channelPolicy,
    market.channelPolicy,
    tavern.channelPolicy,
  ]

  const app = new Hono<AppEnv>().basePath('/api')

  app.use(async (_c, next) => {
    await ready
    await next()
  })

  app.onError((error, c) => {
    // DETTE TECHNIQUE DT-009 (docs/qualite/dette-technique.md): the whole error is logged,
    // including the parameters of a failed SQL query, which may hold personal data.
    console.error(error)
    return c.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, 500)
  })

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue' } }, 404))

  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  app.route(
    '/cron',
    createCronApi(
      {
        outbox: async () => {
          const result = { ...(await dispatcher.dispatch()), ...(await dispatcher.status()) }
          if (result.abandoned > 0) {
            console.warn(`Boîte d'envoi : ${result.abandoned} message(s) abandonné(s) à examiner`)
          }
          return result
        },
        tavern: tavern.dailyTask,
        // DETTE TECHNIQUE DT-008 (docs/qualite/dette-technique.md): no task deletes expired
        // sessions, so their IP addresses and user agents are kept with no limit.
      },
      cronSecret,
    ),
  )

  app.use('/realm/*', requireUser(auth))
  app.use('/dungeon/*', requireUser(auth))
  app.use('/ranking/*', requireUser(auth))
  app.use('/market/*', requireUser(auth))
  app.use('/tavern/*', requireUser(auth))
  app.use('/account', requireUser(auth))
  app.use('/account/*', requireUser(auth))
  app.use('/stream/*', requireUser(auth))

  return app
    .route('/system', system.api)
    .route('/realm', realm.api)
    .route('/dungeon', dungeon.api)
    .route('/ranking', ranking.api)
    .route('/market', market.api)
    .route('/tavern', tavern.api)
    .route('/account', createPrivacyApi(privacy))
    .route('/stream', createRealtimeApi({ store, policies, ...realtime }))
}

/** Type of the whole application, inferred from its routes. */
export type Api = ReturnType<typeof createApi>
