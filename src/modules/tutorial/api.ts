import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import type { TutorialService } from './application/tutorial-service'
import type { TutorialError } from './contracts'

/** HTTP status code for each domain error. */
const STATUS: Record<TutorialError['code'], 404 | 409> = {
  UNKNOWN_QUEST: 404,
  QUEST_LOCKED: 409,
  ALREADY_CLAIMED: 409,
  QUEST_NOT_DONE: 409,
}

/**
 * Creates the Hono sub-app of the tutorial module, mounted on `/api/tutorial`: the view of
 * the tutorial of the signed-in player, the commands of its guide, and the claim of a
 * reward.
 *
 * @param service - Tutorial application service.
 * @returns The tutorial sub-app.
 */
export function createTutorialApi(service: TutorialService) {
  return new Hono<AppEnv>()
    .get('/', async (c) => c.json({ view: await service.view(c.var.userId) }))
    .post('/start', async (c) => c.json(await service.command(c.var.userId, 'StartTutorial')))
    .post('/pause', async (c) => c.json(await service.command(c.var.userId, 'PauseTutorial')))
    .post('/resume', async (c) => c.json(await service.command(c.var.userId, 'ResumeTutorial')))
    .post('/quests/:id/claim', async (c) => {
      const result = await service.claim(c.var.userId, c.req.param('id'))
      return result.ok
        ? c.json({ view: result.view, reward: result.reward ?? {} })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
}

/** Type of the sub-app, used by the typed client of the interface. */
export type TutorialApi = ReturnType<typeof createTutorialApi>
