/**
 * Outbox operations: review and retry of abandoned messages.
 *
 *   pnpm exec tsx scripts/dead-letters.ts             lists the abandoned messages
 *   pnpm exec tsx scripts/dead-letters.ts retry <id>  retries a message, once its cause is fixed
 *
 * The script works on the database named by `DATABASE_URL`, or failing that on the local
 * PGlite database. A retried message is delivered by the next dispatch: a market read, or
 * the daily task. No handler is registered: the script dispatches nothing, it only
 * reviews and retries.
 *
 * @packageDocumentation
 */
import { createDatabase } from '@/platform/db/client'
import { createDispatcher } from '@/platform/outbox/outbox'

const { db, ready } = createDatabase()
await ready
const dispatcher = createDispatcher(db)
const [command, id] = process.argv.slice(2)

if (command === 'retry' && id) {
  const done = await dispatcher.retry(id)
  console.log(done ? `Message ${id} relancé.` : `Message ${id} introuvable, ou non abandonné.`)
} else {
  const messages = await dispatcher.abandoned()
  if (messages.length === 0) console.log('Aucun message abandonné.')
  for (const m of messages) {
    console.log(`${m.id}  ${m.topic}  ${m.attempts} tentatives  ${m.createdAt.toISOString()}`)
    console.log(`  contenu : ${JSON.stringify(m.payload)}`)
    console.log(`  dernière erreur : ${m.lastError}`)
  }
}
process.exit(0)
