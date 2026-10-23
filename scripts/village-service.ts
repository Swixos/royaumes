/**
 * Starts the extracted village service, in a process separate from the application.
 *
 *   SERVICE_SECRET=<secret> pnpm exec tsx scripts/village-service.ts
 *
 * The service listens on port 4000, and keeps its data in its own database:
 * `.data/village` locally, or the database named by `VILLAGE_DATABASE_URL`. The
 * application must be started with `REALM_SERVICE_URL=http://localhost:4000` and the same
 * `SERVICE_SECRET`.
 *
 * @packageDocumentation
 */
import { serve } from '@hono/node-server'
import { createDatabase } from '@/platform/db/client'
import { createVillageServiceApp } from '@/services/village/village-service'

const secret = process.env.SERVICE_SECRET
if (!secret) throw new Error('SERVICE_SECRET est obligatoire : il authentifie les échanges.')
const port = Number(process.env.PORT ?? 4000)

// DETTE TECHNIQUE DT-010 (docs/qualite/dette-technique.md): the local database gets every
// migration of the application, including the tables of the other modules; a database named
// by VILLAGE_DATABASE_URL gets none.
const { db, ready } = createDatabase(process.env.VILLAGE_DATABASE_URL, 'village')
await ready

const app = createVillageServiceApp({
  db,
  secret,
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
})
serve({ fetch: app.fetch, port })
console.log(`Service Village : http://localhost:${port}`)
