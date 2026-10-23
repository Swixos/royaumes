/**
 * Exchanges between the application and an extracted service. The service has no access
 * to player sessions: the application authenticates the player, then passes their
 * identity on to the service. The service only trusts that identity if the request
 * carries the shared secret, which only the application knows.
 *
 * @packageDocumentation
 */
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './types'

/** Header passing the identifier of the player authenticated by the application. */
export const PLAYER_ID_HEADER = 'x-player-id'

/** Header passing the name of the player authenticated by the application. */
export const PLAYER_NAME_HEADER = 'x-player-name'

/**
 * Builds the headers of a request sent to a service, on behalf of a player or of the
 * application. The name is URI-encoded, since it may hold accented characters, which are
 * not allowed in an HTTP header.
 *
 * @param secret - Shared secret.
 * @param player - Player on whose behalf the request is sent, if any.
 * @returns The request headers.
 */
export function serviceHeaders(secret: string, player?: { id: string; name: string }) {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` }
  if (player) {
    headers[PLAYER_ID_HEADER] = player.id
    headers[PLAYER_NAME_HEADER] = encodeURIComponent(player.name)
  }
  return headers
}

/**
 * Creates a middleware refusing any request that does not carry the shared secret (401).
 *
 * @param secret - Shared secret.
 * @returns The Hono middleware.
 */
export const requireServiceSecret = (secret: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.header('authorization') !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    await next()
  })

/**
 * Middleware putting in the context the player passed on by the application, as
 * `requireUser` does for a session. Only to be used after `requireServiceSecret`.
 */
export const playerFromHeaders = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.header(PLAYER_ID_HEADER)
  if (!id) return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Joueur absent' } }, 401)
  c.set('userId', id)
  c.set('userName', decodeURIComponent(c.req.header(PLAYER_NAME_HEADER) ?? id))
  await next()
})
