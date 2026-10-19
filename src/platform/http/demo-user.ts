import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './types'

/** Single player identifier, until authentication. */
export const DEMO_USER_ID = 'demo'

/**
 * Temporary middleware assigning every request to the same player.
 * DETTE TECHNIQUE DT-001 (docs/qualite/dette-technique.md): to be replaced by a
 * middleware identifying the signed-in player.
 *
 * @returns A Hono middleware setting `userId` in the context.
 */
export const demoUser = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('userId', DEMO_USER_ID)
    await next()
  })
