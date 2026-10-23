import { Hono } from 'hono'
import { createRealmModule } from '@/modules/realm'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { Db } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { requireServiceToken, requireTokenPlayer } from '@/platform/http/service-auth'
import type { AppEnv } from '@/platform/http/types'
import { createInboxApi, forwardTo } from '@/platform/outbox/inbox-api'
import { createDispatcher } from '@/platform/outbox/outbox'
import { createPrivacyService } from '@/platform/privacy/privacy'

/** Dependencies of the extracted village service. */
export interface VillageServiceDeps {
  /** Database of the service: its own event store and its own outbox. */
  db: Db
  /** Secret shared with the application. */
  secret: string
  /** Address of the application, to which the service sends its replies. */
  appUrl: string
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
  /** Function sending requests to the application; replaced in tests. */
  fetch?: typeof fetch
}

/**
 * Composition root of the extracted village service. It wires the village module,
 * unchanged, with its own platform: event store, outbox and player rights. Every route
 * requires a token signed with the shared secret, so only the application can call the
 * service.
 *
 * The outbox of the service handles the village messages; all the others, that is the
 * replies addressed to the market, are forwarded to the application. Player rights erase
 * the personal data of the service's own event store.
 *
 * - `/realm/*`: village API, called by the application gateway on behalf of a player.
 * - `POST /messages`: inbox for the market saga messages; the replies they produce are
 *   dispatched at once, that is forwarded to the application.
 * - `GET /events`: published event stream, the village events after a position.
 * - `GET` and `DELETE /personal-data/:playerId`: player rights, requested by the application.
 *
 * @param deps - Database, shared secret, application address, optional clock and fetch.
 * @returns The Hono application of the service.
 */
export function createVillageServiceApp({ db, secret, appUrl, clock, fetch }: VillageServiceDeps) {
  const store = createEventStore(db)
  const realm = createRealmModule({ store, clock })

  const dispatcher = createDispatcher(db)
  dispatcher.register(realm.handlers)
  dispatcher.registerFallback(forwardTo(`${appUrl}/api/internal`, secret, fetch))

  const privacy = createPrivacyService(db, [realm.personalData], clock)

  return (
    new Hono<AppEnv>()
      .use(requireServiceToken(secret))
      .use('/realm/*', requireTokenPlayer)
      .route('/realm', realm.api)
      // DETTE TECHNIQUE DT-012 (docs/qualite/dette-technique.md): the service outbox is only
      // dispatched when a message is received, so a reply that could not be sent waits for the
      // next message.
      .route(
        '/',
        createInboxApi(dispatcher, secret, () => dispatcher.dispatch()),
      )
      // DETTE TECHNIQUE DT-011 (docs/qualite/dette-technique.md): the stream is returned in a
      // single response, without pagination.
      .get('/events', async (c) => {
        const after = Number(c.req.query('after') ?? 0) || 0
        const events = await store.readAll({
          streamPrefix: VILLAGE_CHANNEL_PREFIX,
          afterPosition: after,
        })
        return c.json({ events })
      })
      .get('/personal-data/:playerId', async (c) => {
        const data = await privacy.exportData(c.req.param('playerId'))
        return c.json(data.sections.realm ?? null)
      })
      .delete('/personal-data/:playerId', async (c) =>
        c.json(await privacy.erase(c.req.param('playerId'))),
      )
  )
}
