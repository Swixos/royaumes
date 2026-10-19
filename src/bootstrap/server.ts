import { type Api, createApi } from './create-api'

/** What the application exposes to Next.js: for now, the API only. */
interface Server {
  api: Api
}

/**
 * The instance is kept on the process global object. In development, Next.js
 * reloads modules on every change: a plain module variable would be reset and
 * the application rebuilt each time.
 */
const globalForServer = globalThis as unknown as { royaumes?: Server }

/**
 * Returns the application, building it on first use. Lazy construction
 * ensures no application code runs while Next.js analyses files at build time.
 *
 * @returns The single server instance.
 */
export function getServer(): Server {
  if (!globalForServer.royaumes) {
    globalForServer.royaumes = { api: createApi() }
  }
  return globalForServer.royaumes
}
