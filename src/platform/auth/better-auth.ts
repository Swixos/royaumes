import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../db/client'
import type { AuthPort } from './port'
import { account, session, user, verification } from './schema'

/**
 * Lists the domains Vercel assigns to the current deployment: the production
 * domain, the branch domain and the deployment's own domain. Vercel provides
 * them through environment variables, without the `https://` prefix.
 *
 * @returns The HTTPS origins of the current Vercel deployment; empty locally.
 */
function vercelOrigins(): string[] {
  return [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`)
}

/**
 * Resolves the public address of the application, in order: `BETTER_AUTH_URL`;
 * in production on Vercel, the project production domain; on another Vercel
 * deployment (branch preview), the deployment domain; locally,
 * `http://localhost:3000`.
 *
 * @returns The public address of the application.
 */
function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
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
 * with email and password sign-in (at least 8 characters). Only the origins of
 * this project may send requests carrying a session cookie, which guards
 * against cross-site request forgery. Attempts are rate limited per IP address
 * with limits sized for a classroom sharing one public address: 40 sign-ups and
 * 60 sign-ins per minute. The limit can only be turned off locally with
 * `AUTH_RATE_LIMIT=off`, never on Vercel.
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
    trustedOrigins: [resolveBaseUrl(), ...vercelOrigins()],
    // DETTE TECHNIQUE DT-004 (docs/qualite/dette-technique.md): counters live in the memory
    // of each instance, so they are not shared across instances.
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
