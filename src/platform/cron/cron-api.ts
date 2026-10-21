import { Hono } from 'hono'
import type { AppEnv } from '../http/types'

/** Daily task: it returns a report of its run, such as counts. */
export type DailyTask = () => Promise<unknown>

/** Report of a task: its result, or the message of the error it threw. */
type TaskReport = { ok: true; result: unknown } | { ok: false; error: string }

/**
 * Creates the sub-app of the scheduled tasks, mounted on `/api/cron`. The Vercel scheduled
 * task calls the `/daily` route every day with the `Authorization: Bearer <CRON_SECRET>`
 * header; any other request is refused, and without a configured secret the route stays
 * closed. Tasks are provided by the composition root, since the platform knows no module.
 * They run one after the other, and the failure of one does not prevent the next ones.
 *
 * @param tasks - Daily tasks, by name.
 * @param secret - Secret expected in the `Authorization` header, if configured.
 * @returns The scheduled tasks sub-app.
 */
export function createCronApi(tasks: Record<string, DailyTask>, secret: string | undefined) {
  return new Hono<AppEnv>().get('/daily', async (c) => {
    if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Accès refusé' } }, 401)
    }
    const reports: Record<string, TaskReport> = {}
    for (const [name, task] of Object.entries(tasks)) {
      try {
        reports[name] = { ok: true, result: await task() }
      } catch (error) {
        reports[name] = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
    return c.json(reports)
  })
}
