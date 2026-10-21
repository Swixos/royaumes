import { Hono } from 'hono'
import type { AppEnv } from '../http/types'
import type { PrivacyService } from './privacy'

/**
 * Creates the sub-app of the signed-in player's rights, mounted on `/api/account`. As
 * elsewhere, the player is the one identified by authentication: nobody can export or
 * erase the data of another player.
 *
 * - `GET /export`: right of access and portability, as a JSON file downloaded by the browser.
 * - `DELETE /`: right to erasure, deleting the account and all personal data.
 *
 * @param service - Player rights service.
 * @returns The player rights sub-app.
 */
export function createPrivacyApi(service: PrivacyService) {
  return new Hono<AppEnv>()
    .get('/export', async (c) => {
      const data = await service.exportData(c.var.userId)
      c.header('Content-Disposition', 'attachment; filename="royaumes-mes-donnees.json"')
      return c.json(data)
    })

    .delete('/', async (c) => {
      const result = await service.erase(c.var.userId)
      return c.json(result)
    })
}
