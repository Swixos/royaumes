import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson, validateQuery } from '@/platform/http/validate'
import type { FleetService } from './application/fleet-service'
import { LaunchRaidInput, type RaidError, TargetsQuery } from './contracts'

/** HTTP status code for each domain error. */
const STATUS: Record<RaidError['code'], 403 | 404 | 409 | 422> = {
  RAID_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  INVALID_FLEET: 422,
  NO_SHIP: 422,
  NO_ROOM: 422,
  OWN_VILLAGE: 409,
  UNKNOWN_TARGET: 404,
  TOO_MANY_RAIDS: 409,
  TREASURE_TAKEN: 409,
  NOT_ATTACKER: 403,
  NOT_AT_SEA: 409,
  ALREADY_ARRIVED: 409,
  NOT_ARRIVED: 409,
}

/**
 * Creates the Hono sub-app of the fleet module, mounted on `/api/fleet`. The player is
 * always the one identified by authentication: no route accepts the identifier of the
 * acting player in the request, only that of a targeted village.
 *
 * - `GET /targets`: nearest villages of the other players, or those whose name holds
 *   `search`, and pirate islands.
 * - `GET /raids`: raids launched and suffered by the player.
 * - `POST /raids`: launches a raid with an army of the player's village.
 * - `GET /raids/:id`: view of a raid, for its attacker or its defender.
 * - `POST /raids/:id/recall`: the attacker recalls their fleet.
 * - `GET /harbor`: garrison, wall and notices of the player's harbor.
 *
 * @param service - Fleet application service.
 * @returns The fleet sub-app with its chained routes.
 */
export function createFleetApi(service: FleetService) {
  return new Hono<AppEnv>()
    .get('/targets', validateQuery(TargetsQuery), async (c) => {
      const { search } = c.req.valid('query')
      return c.json(await service.targets(c.var.userId, search || undefined))
    })

    .get('/raids', async (c) => c.json(await service.list(c.var.userId)))

    .post('/raids', validateJson(LaunchRaidInput), async (c) => {
      const { target, army } = c.req.valid('json')
      const player = { id: c.var.userId, name: c.var.userName }
      const { raidId, result } = await service.launch(player, target, army)
      return result.ok
        ? c.json({ raidId, view: result.view }, 201)
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .get('/raids/:id', async (c) => {
      const view = await service.getView(c.req.param('id'), c.var.userId)
      return view ? c.json({ view }) : c.json({ error: { code: 'RAID_NOT_FOUND' as const } }, 404)
    })

    .post('/raids/:id/recall', async (c) => {
      const result = await service.recall(c.req.param('id'), c.var.userId)
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })

    .get('/harbor', async (c) => c.json(await service.harbor(c.var.userId)))

}

/** Type of the sub-app, used by the typed client of the interface. */
export type FleetApi = ReturnType<typeof createFleetApi>
