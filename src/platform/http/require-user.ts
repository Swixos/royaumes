import { createMiddleware } from 'hono/factory'
import type { AuthPort } from '../auth/port'
import type { AppEnv } from './types'

/**
 * Middleware requiring a signed-in player. An anonymous request is refused with
 * 401 without reaching the route; otherwise the player identifier and name are
 * put in the context, where module routes read them (`c.var.userId`,
 * `c.var.userName`).
 *
 * @param auth - Authentication port.
 * @returns A Hono middleware.
 */
export const requireUser = (auth: AuthPort) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = await auth.getUser(c.req.raw.headers)
    if (!user) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Connexion requise' } }, 401)
    }
    c.set('userId', user.id)
    c.set('userName', user.name)
    await next()
  })
