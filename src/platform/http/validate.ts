import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'

/**
 * Validates the JSON body of a request against a Zod schema. On failure, it
 * answers 400 with the API error format and the message of the first issue.
 *
 * @param schema - Zod schema of the expected body.
 * @returns A Hono validation middleware.
 */
export const validateJson = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Entrée invalide'
      return c.json({ error: { code: 'INVALID_INPUT' as const, message } }, 400)
    }
  })
