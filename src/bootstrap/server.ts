import { createBetterAuth } from '@/platform/auth/better-auth'
import type { AuthPort, AuthUser } from '@/platform/auth/port'
import { createDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { type Api, createApi } from './create-api'

/** What the application exposes to Next.js. */
interface Server {
  /** The API application. */
  api: Api
  /** Authentication, also used by server-rendered pages. */
  auth: AuthPort
  /** Resolves once the database is ready. */
  ready: Promise<void>
}

/**
 * The instance is kept on the process global object. In development, Next.js
 * reloads modules on every change: a plain module variable would be reset and
 * the application rebuilt each time, with a new database connection.
 */
const globalForServer = globalThis as unknown as { royaumes?: Server }

/**
 * Returns the application, building the platform (database, then the event
 * store and Better Auth on the same connection) and the API on first use. Lazy
 * construction ensures no application code, and no database connection, runs
 * while Next.js analyses files at build time.
 *
 * Real-time streams last 240 s by default, under the 300 s Vercel limit;
 * `STREAM_MAX_SECONDS` shortens them to observe reconnection in development.
 *
 * @returns The single server instance.
 */
export function getServer(): Server {
  if (!globalForServer.royaumes) {
    const { db, ready } = createDatabase()
    const store = createEventStore(db)
    const auth = createBetterAuth(db)
    const maxStreamMs = Number(process.env.STREAM_MAX_SECONDS ?? 240) * 1000
    globalForServer.royaumes = {
      api: createApi({
        auth,
        db,
        store,
        ready,
        realtime: { maxStreamMs },
        cronSecret: process.env.CRON_SECRET,
      }),
      auth,
      ready,
    }
  }
  return globalForServer.royaumes
}

/**
 * Finds the signed-in player for server-rendered pages. Pages do not call the
 * API: they query the authentication port directly from the request headers.
 *
 * @param headers - Headers of the request received by Next.js.
 * @returns The signed-in player, or `null` if nobody is signed in.
 */
export async function currentUser(headers: Headers): Promise<AuthUser | null> {
  const { auth, ready } = getServer()
  await ready
  return auth.getUser(headers)
}
