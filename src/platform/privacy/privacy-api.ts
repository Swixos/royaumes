import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../http/types'
import { validateJson } from '../http/validate'
import { ERASED_NAME, type PrivacyService } from './privacy'

/** Expected body to rectify one's name: the neutral name of erased players is refused. */
export const RectifyNameInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(40, 'Le nom doit comporter au plus 40 caractères')
    .refine((name) => name !== ERASED_NAME, 'Ce nom est réservé'),
})

/**
 * Creates the sub-app of the signed-in player's rights, mounted on `/api/account`. As
 * elsewhere, the player is the one identified by authentication: nobody can export or
 * erase the data of another player.
 *
 * - `GET /export`: right of access and portability, as a JSON file downloaded by the browser.
 * - `DELETE /`: right to erasure, deleting the account and all personal data.
 * - `PUT /name`: right to rectification of the player's name, everywhere it is copied.
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

    .put('/name', validateJson(RectifyNameInput), async (c) => {
      const { name } = c.req.valid('json')
      const result = await service.rectifyName(c.var.userId, name)
      return c.json({ name, ...result })
    })
}
