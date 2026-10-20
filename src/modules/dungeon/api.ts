import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { DungeonService } from './application/dungeon-service'
import { type GameError, SubmitActionInput } from './contracts'

/** HTTP status code for each domain error. */
const STATUS: Record<GameError['code'], 403 | 404 | 409 | 422> = {
  GAME_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  WRONG_PHASE: 409,
  GAME_FULL: 409,
  ALREADY_JOINED: 409,
  NOT_A_MEMBER: 403,
  NOT_HOST: 403,
  NOT_YOUR_TURN: 409,
  HERO_DOWN: 409,
  ROUND_OVER: 409,
  ALREADY_CHOSEN: 409,
  INVALID_TARGET: 422,
}

/**
 * Hono sub-app of the dungeon module, mounted on `/api/dungeon`. The player is
 * always the one identified by authentication (`c.var.userId`): no route accepts
 * a player identifier in the request.
 *
 * Routes: list open expeditions, open one (the player becomes host), read one
 * filtered for the player, join, start, open the next door, choose an action,
 * and the deadline command sent by the interface when its countdown ends.
 *
 * @param service - Dungeon application service.
 * @returns The dungeon sub-app with its chained routes.
 */
export function createDungeonApi(service: DungeonService) {
  return new Hono<AppEnv>()
    .get('/games', async (c) => c.json({ games: await service.listOpenGames() }))

    .post('/games', async (c) => {
      const { gameId, result } = await service.create({ id: c.var.userId, name: c.var.userName })
      return result.ok
        ? c.json({ gameId, view: result.view }, 201)
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .get('/games/:id', async (c) => {
      const view = await service.getView(c.req.param('id'), c.var.userId)
      return view ? c.json({ view }) : c.json({ error: { code: 'GAME_NOT_FOUND' as const } }, 404)
    })

    .post('/games/:id/join', async (c) => {
      const result = await service.execute(c.req.param('id'), c.var.userId, {
        type: 'JoinGame',
        playerId: c.var.userId,
        name: c.var.userName,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/games/:id/start', async (c) => {
      const result = await service.execute(c.req.param('id'), c.var.userId, {
        type: 'StartGame',
        playerId: c.var.userId,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/games/:id/door', async (c) => {
      const result = await service.execute(c.req.param('id'), c.var.userId, {
        type: 'OpenDoor',
        playerId: c.var.userId,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/games/:id/action', validateJson(SubmitActionInput), async (c) => {
      const { round, action } = c.req.valid('json')
      const result = await service.execute(c.req.param('id'), c.var.userId, {
        type: 'SubmitAction',
        playerId: c.var.userId,
        round,
        action,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .post('/games/:id/deadline', async (c) => {
      const result = await service.execute(c.req.param('id'), c.var.userId, {
        type: 'CheckDeadline',
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
}

/** Type of the sub-app, used by the typed client of the interface. */
export type DungeonApi = ReturnType<typeof createDungeonApi>
