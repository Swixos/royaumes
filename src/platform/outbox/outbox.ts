import { eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { outbox } from './schema'

/** Message to record in the outbox, along with the events that produce it. */
export interface NewMessage {
  /** Subject of the message, such as "realm.withdraw": it names its handler. */
  topic: string
  /** Content of the message, which the platform does not interpret. */
  payload: Record<string, unknown>
  /**
   * Delay before the first delivery, in milliseconds. A delayed message acts as a timer:
   * it is delivered by the first dispatch after the delay has elapsed.
   */
  delayMs?: number
}

/** Message delivered to a handler. */
export interface Message extends Omit<NewMessage, 'delayMs'> {
  /** Unique message identifier. */
  id: string
  /** Number of the current attempt, starting at 1. */
  attempt: number
}

/**
 * Handler of a topic. It fails by throwing an error, and the message is then retried.
 * A business refusal (not enough stock, for instance) is not a failure: the handler
 * processes it normally, by recording the refusal and answering it with a message.
 *
 * @param message - Delivered message.
 * @returns Resolves once the message is processed.
 */
export type MessageHandler = (message: Message) => Promise<void>

/**
 * Converts a message to record into a row of the table, with a unique identifier. The
 * availability of a delayed message is computed by the database, like that of a regular
 * message: now, plus the delay.
 *
 * @param message - Message to record.
 * @returns The outbox row.
 */
export const toOutboxRow = (message: NewMessage) => ({
  id: crypto.randomUUID(),
  topic: message.topic,
  payload: message.payload,
  ...(message.delayMs
    ? { availableAt: sql`now() + make_interval(secs => ${message.delayMs / 1000})` }
    : {}),
})

/** Options of the dispatcher. */
export interface DispatcherOptions {
  /** Maximum number of attempts; beyond it, the message is abandoned and left for review. */
  maxAttempts?: number
  /** Duration of the lease of a message being processed, in milliseconds. */
  leaseMs?: number
  /** Number of messages claimed at a time. */
  batchSize?: number
  /** Maximum number of messages delivered by one call to `dispatch`. */
  maxMessages?: number
  /** Clock, replaced in tests to simulate the passing of time. */
  now?: () => number
}

/**
 * Computes the delay before the next attempt: 2, 4, 8 seconds..., capped at one hour.
 *
 * @param attempt - Number of the failed attempt.
 * @returns The delay in milliseconds.
 */
const retryDelayMs = (attempt: number) => Math.min(2 ** attempt * 1000, 3_600_000)

/**
 * Creates the outbox dispatcher, which delivers pending messages to their handler at
 * least once. It knows no module: handlers are provided topic by topic by the
 * composition root.
 *
 * @param db - Database holding the outbox.
 * @param options - Attempts, lease, batch sizes and clock.
 * @returns The `register`, `dispatch` and `status` functions.
 */
export function createDispatcher(
  db: Db,
  {
    maxAttempts = 10,
    leaseMs = 30_000,
    batchSize = 20,
    maxMessages = 100,
    now = () => Date.now(),
  }: DispatcherOptions = {},
) {
  const handlers = new Map<string, MessageHandler>()

  /**
   * Registers the handlers of a module.
   *
   * @param moduleHandlers - Handlers by topic.
   */
  function register(moduleHandlers: Record<string, MessageHandler>) {
    for (const [topic, handler] of Object.entries(moduleHandlers)) handlers.set(topic, handler)
  }

  /**
   * Claims pending messages in a single statement: their availability is pushed back by
   * the lease duration, and their attempt count raised. `FOR UPDATE SKIP LOCKED` skips
   * the messages a concurrent dispatch is claiming, so two dispatches never claim the
   * same message.
   *
   * @returns The claimed messages, oldest first.
   */
  async function claim() {
    const at = now()
    const result = await db.execute(sql`
      UPDATE ${outbox}
      SET available_at = ${new Date(at + leaseMs)}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM ${outbox}
        WHERE processed_at IS NULL AND available_at <= ${new Date(at)} AND attempts < ${maxAttempts}
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, topic, payload, attempts`)
    const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows
    return rows.map(
      (row): Message => ({
        id: row.id as string,
        topic: row.topic as string,
        payload: row.payload as Record<string, unknown>,
        attempt: row.attempts as number,
      }),
    )
  }

  /**
   * Delivers a message to its handler, then records the success or the failure. If the
   * dispatcher stops after the handler but before the message is marked as processed,
   * the message is delivered again once the lease expires: handlers must be idempotent.
   *
   * @param message - Claimed message.
   * @returns True if the handler succeeded.
   */
  async function deliver(message: Message): Promise<boolean> {
    try {
      const handler = handlers.get(message.topic)
      if (!handler) throw new Error(`Aucun gestionnaire pour le sujet ${message.topic}`)
      await handler(message)
      await db
        .update(outbox)
        .set({ processedAt: new Date(now()) })
        .where(eq(outbox.id, message.id))
      return true
    } catch (error) {
      await db
        .update(outbox)
        .set({
          availableAt: new Date(now() + retryDelayMs(message.attempt)),
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(outbox.id, message.id))
      return false
    }
  }

  /**
   * Delivers the pending messages, including those the handlers produce during the
   * dispatch, so a saga can run entirely in a single call.
   *
   * @returns The number of messages delivered successfully, and the number of failures.
   */
  async function dispatch() {
    let delivered = 0
    let failed = 0
    while (delivered + failed < maxMessages) {
      const messages = await claim()
      if (messages.length === 0) break
      for (const message of messages) {
        if (await deliver(message)) delivered++
        else failed++
      }
    }
    return { delivered, failed }
  }

  /**
   * Counts the messages still to process.
   *
   * @returns The number of pending messages, and of messages abandoned after too many attempts.
   */
  async function status() {
    const [row] = await db
      .select({
        pending: sql<number>`count(*) filter (where ${outbox.attempts} < ${maxAttempts})`,
        abandoned: sql<number>`count(*) filter (where ${outbox.attempts} >= ${maxAttempts})`,
      })
      .from(outbox)
      .where(isNull(outbox.processedAt))
    return { pending: Number(row.pending), abandoned: Number(row.abandoned) }
  }

  return { register, dispatch, status }
}

/** Type of the dispatcher, inferred from its factory. */
export type Dispatcher = ReturnType<typeof createDispatcher>
