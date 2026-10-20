import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../db/client'
import type { AuthPort } from './port'
import { account, session, user, verification } from './schema'

/**
 * Resolves the public address of the application.
 *
 * @returns `BETTER_AUTH_URL`, or the local address by default.
 */
function resolveBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
}

/**
 * Resolves the secret signing the session cookies. In development, a fixed
 * value is used, which protects nothing.
 *
 * @returns `BETTER_AUTH_SECRET`, or the development value.
 * @throws If the secret is missing in production on Vercel.
 */
function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    throw new Error('BETTER_AUTH_SECRET est obligatoire en production.')
  }
  return 'dev-only-secret-not-for-production-use-0123456789'
}

/**
 * Authentication port adapter backed by Better Auth.
 *
 * Accounts and sessions are stored in the project database through Drizzle,
 * with email and password sign-in (at least 8 characters). Attempts are rate
 * limited per IP address with limits sized for a classroom sharing one public
 * address: 40 sign-ups and 60 sign-ins per minute. The limit can only be turned
 * off locally with `AUTH_RATE_LIMIT=off`, never on Vercel.
 *
 * @param db - Database connection.
 * @returns The authentication port.
 */
export function createBetterAuth(db: Db): AuthPort {
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    secret: resolveSecret(),
    baseURL: resolveBaseUrl(),
    rateLimit: {
      enabled: process.env.AUTH_RATE_LIMIT !== 'off' || Boolean(process.env.VERCEL),
      customRules: {
        '/sign-up/email': { window: 60, max: 40 },
        '/sign-in/email': { window: 60, max: 60 },
      },
    },
  })

  return {
    handler: (request) => auth.handler(request),

    async getUser(headers) {
      const result = await auth.api.getSession({ headers })
      return result ? { id: result.user.id, name: result.user.name } : null
    },
  }
}
