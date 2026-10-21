import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { MarketService } from './application/market-service'
import { type OfferError, PublishOfferInput } from './contracts'

/** HTTP status code for each domain error. */
const STATUS: Record<OfferError['code'], 403 | 404 | 409> = {
  OFFER_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  NOT_OPEN: 409,
  OWN_OFFER: 409,
  NOT_SELLER: 403,
  EXPIRED: 409,
  NOT_EXPIRED: 409,
}

/**
 * Creates the Hono sub-app of the market module, mounted on `/api/market`. The player is
 * always the one identified by authentication: no route accepts a player identifier in
 * the request.
 *
 * - `GET /offers`: ongoing offers of the player, and open offers of the other players.
 * - `POST /offers`: publishes an offer.
 * - `GET /offers/:id`: view of an offer.
 * - `POST /offers/:id/accept`: another player accepts an offer.
 * - `POST /offers/:id/withdraw`: the seller withdraws an offer.
 *
 * @param service - Market application service.
 * @returns The market sub-app with its chained routes.
 */
export function createMarketApi(service: MarketService) {
  return new Hono<AppEnv>()
    .get('/offers', async (c) => c.json(await service.list(c.var.userId)))

    .post('/offers', validateJson(PublishOfferInput), async (c) => {
      const { give, want } = c.req.valid('json')
      const player = { id: c.var.userId, name: c.var.userName }
      const { offerId, result } = await service.publish(player, give, want)
      return result.ok
        ? c.json({ offerId, view: result.view }, 201)
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .get('/offers/:id', async (c) => {
      const view = await service.getView(c.req.param('id'), c.var.userId)
      return view ? c.json({ view }) : c.json({ error: { code: 'OFFER_NOT_FOUND' as const } }, 404)
    })

    .post('/offers/:id/accept', async (c) => {
      const player = { id: c.var.userId, name: c.var.userName }
      const result = await service.acceptOffer(c.req.param('id'), player)
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/offers/:id/withdraw', async (c) => {
      const result = await service.withdrawOffer(c.req.param('id'), c.var.userId)
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
}

/** Type of the sub-app, used by the typed client of the interface. */
export type MarketApi = ReturnType<typeof createMarketApi>
