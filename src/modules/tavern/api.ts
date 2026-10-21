import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { TavernService } from './application/tavern-service'
import { type MessageError, PostMessageInput } from './contracts'

/** HTTP status code for each error. */
const STATUS: Record<MessageError['code'], 422 | 429> = {
  EMPTY_MESSAGE: 422,
  MESSAGE_TOO_LONG: 422,
  TOO_MANY_MESSAGES: 429,
}

/**
 * Creates the Hono sub-app of the tavern module, mounted on `/api/tavern`. The author of
 * a message is always the signed-in player. When rate limited, the `Retry-After` header
 * gives the delay to wait, in seconds.
 *
 * - `GET /messages` and `POST /messages`: latest messages, and posting one.
 * - `GET /presence`: present players.
 * - `POST /presence`: presence signal, sent regularly by the browser; the response holds
 *   the present players, which spares the interface a second request.
 * - `POST /presence/leave`: explicit departure, sent when the player leaves the page.
 *
 * @param service - Tavern application service.
 * @returns The tavern sub-app.
 */
export function createTavernApi(service: TavernService) {
  return new Hono<AppEnv>()
    .get('/messages', async (c) => c.json({ messages: await service.latest() }))

    .post('/messages', validateJson(PostMessageInput), async (c) => {
      const player = { id: c.var.userId, name: c.var.userName }
      const result = await service.post(player, c.req.valid('json').body)
      if (result.ok) return c.json({ message: result.message }, 201)
      if (result.error.code === 'TOO_MANY_MESSAGES') {
        c.header('Retry-After', String(Math.ceil(result.error.retryAfterMs / 1000)))
      }
      return c.json({ error: result.error }, STATUS[result.error.code])
    })
    .get('/presence', async (c) => c.json({ players: await service.present() }))

    .post('/presence', async (c) => {
      const players = await service.heartbeat({ id: c.var.userId, name: c.var.userName })
      return c.json({ players })
    })

    .post('/presence/leave', async (c) => {
      await service.leave(c.var.userId)
      return c.body(null, 204)
    })
}

/** Type of the sub-app, used by the typed client of the interface. */
export type TavernApi = ReturnType<typeof createTavernApi>
