import { getServer } from '@/bootstrap/server'

/** The API runs on the full Node.js runtime, not the restricted Edge runtime. */
export const runtime = 'nodejs'

/** API responses are never cached nor generated at build time. */
export const dynamic = 'force-dynamic'

/**
 * Maximum duration of a request on Vercel, in seconds. It bounds real-time
 * streams, which close on their own before it (240 s).
 */
export const maxDuration = 300

/**
 * Single entry point of the API: Next.js forwards every `/api/*` request as is
 * to the Hono application, which handles routing.
 *
 * @param request - Incoming request.
 * @returns The API response.
 */
const handle = (request: Request) => getServer().api.fetch(request)

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
