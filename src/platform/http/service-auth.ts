/**
 * Exchanges between the application and an extracted service. The service has no access
 * to player sessions: the application authenticates the player, then passes their
 * identity on to the service inside a signed token. The secret shared by both processes
 * is a signing key: it never travels on the network. A token is only valid for a short
 * time, and the identity it carries cannot be changed without breaking its signature.
 *
 * @packageDocumentation
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './types'

/** Lifetime of a service token, in milliseconds. */
export const SERVICE_TOKEN_TTL_MS = 60_000

/** Version prefix of the tokens, changed if their format ever changes. */
const VERSION = 'v1'

/** Content of a service token. */
export interface ServiceClaims {
  /** Issue time, in milliseconds. */
  iat: number
  /** Expiry time, in milliseconds. */
  exp: number
  /** Identifier of the player on whose behalf the request is sent, if any. */
  sub?: string
  /** Name of that player. */
  name?: string
}

/**
 * Signs a text with the shared secret (HMAC-SHA256).
 *
 * @param secret - Shared secret.
 * @param text - Text to sign.
 * @returns The signature, in base64url.
 */
const sign = (secret: string, text: string) =>
  createHmac('sha256', secret).update(text).digest('base64url')

/**
 * Builds a service token: `v1.<claims>.<signature>`, claims and signature in base64url.
 *
 * @param secret - Shared secret, used as signing key.
 * @param player - Player on whose behalf the request is sent, if any.
 * @param now - Current time in milliseconds.
 * @returns The signed token.
 */
export function signServiceToken(
  secret: string,
  player?: { id: string; name: string },
  now = Date.now(),
) {
  const claims: ServiceClaims = { iat: now, exp: now + SERVICE_TOKEN_TTL_MS }
  if (player) {
    claims.sub = player.id
    claims.name = player.name
  }
  const body = `${VERSION}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
  return `${body}.${sign(secret, body)}`
}

/**
 * Checks a service token: its format, its signature, in constant time, and its expiry.
 *
 * @param secret - Shared secret.
 * @param token - Token to check.
 * @param now - Current time in milliseconds.
 * @returns The claims of a valid token, or null.
 */
export function verifyServiceToken(secret: string, token: string, now = Date.now()) {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  const body = `${parts[0]}.${parts[1]}`
  const expected = Buffer.from(sign(secret, body))
  const given = Buffer.from(parts[2])
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as ServiceClaims
    if (typeof claims.exp !== 'number' || now >= claims.exp) return null
    if (typeof claims.iat !== 'number' || claims.iat > now + SERVICE_TOKEN_TTL_MS) return null
    return claims
  } catch {
    return null
  }
}

/**
 * Builds the headers of a request sent to a service, on behalf of a player or of the
 * application: a fresh signed token, carrying the player if any.
 *
 * @param secret - Shared secret.
 * @param player - Player on whose behalf the request is sent, if any.
 * @returns The request headers.
 */
export function serviceHeaders(secret: string, player?: { id: string; name: string }) {
  return { authorization: `Bearer ${signServiceToken(secret, player)}` }
}

/**
 * Creates a middleware refusing any request that does not carry a valid service token
 * (401). The player the token carries, if any, is put in the context, as `requireUser`
 * does for a session.
 *
 * @param secret - Shared secret.
 * @returns The Hono middleware.
 */
export const requireServiceToken = (secret: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const claims = header.startsWith('Bearer ') ? verifyServiceToken(secret, header.slice(7)) : null
    if (!claims) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    if (claims.sub) {
      c.set('userId', claims.sub)
      c.set('userName', claims.name ?? claims.sub)
    }
    await next()
  })

/**
 * Middleware refusing a request whose token carries no player (401). Only to be used
 * after `requireServiceToken`.
 */
export const requireTokenPlayer = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.userId) {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Joueur absent' } }, 401)
  }
  await next()
})
