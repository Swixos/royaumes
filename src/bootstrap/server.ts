import { createBetterAuth } from '@/platform/auth/better-auth'
import type { AuthPort } from '@/platform/auth/port'
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
 * @returns The single server instance.
 */
export function getServer(): Server {
  if (!globalForServer.royaumes) {
    const { db, ready } = createDatabase()
    const store = createEventStore(db)
    const auth = createBetterAuth(db)
    globalForServer.royaumes = { api: createApi({ auth, store, ready }), auth, ready }
  }
  return globalForServer.royaumes
}
