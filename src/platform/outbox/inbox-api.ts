import { Hono } from 'hono'
import { z } from 'zod'
import { requireServiceSecret } from '../http/service-auth'
import type { AppEnv } from '../http/types'
import type { Dispatcher, Message } from './outbox'

/** Message sent by another process, as it stood in its outbox. */
const IncomingMessage = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().positive(),
})

/**
 * Creates the inbox: it receives the messages another process recorded in its own outbox,
 * and has them handled by the handler of their topic. The 204 response is only sent once
 * the handling succeeded: the sender only marks the message as processed when it receives
 * it, and retries otherwise.
 *
 * @param dispatcher - Outbox dispatcher, whose handlers process the messages.
 * @param secret - Shared secret expected from the sender.
 * @param afterHandle - Called after each handled message, for instance to dispatch at once
 *   the messages its handling produced.
 * @returns The inbox sub-app.
 */
export function createInboxApi(
  dispatcher: Dispatcher,
  secret: string,
  afterHandle: () => Promise<unknown> = async () => {},
) {
  return new Hono<AppEnv>().use(requireServiceSecret(secret)).post('/messages', async (c) => {
    const parsed = IncomingMessage.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Message invalide' } }, 400)
    }
    await dispatcher.handle(parsed.data as Message)
    await afterHandle()
    return c.body(null, 204)
  })
}

/**
 * Creates a handler forwarding a message to the inbox of another process. A non-2xx
 * response throws an error: the message stays in the outbox, and is retried according
 * to the usual rules.
 *
 * @param url - Base address of the other process's inbox.
 * @param secret - Shared secret.
 * @param fetchFn - Fetch function; replaced in tests.
 * @returns The forwarding message handler.
 */
export function forwardTo(url: string, secret: string, fetchFn: typeof fetch = fetch) {
  return async (message: Message) => {
    const res = await fetchFn(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(message),
    })
    if (!res.ok) throw new Error(`Transmission refusée par ${url} (${res.status})`)
  }
}
