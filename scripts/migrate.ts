/**
 * Applies the SQL migrations of the `drizzle/` directory to the production
 * database. Vercel runs this script during the build, before going live.
 * Without `DATABASE_URL` it does nothing, since PGlite applies its migrations at
 * startup. Neon provides a pooled connection, suited to the application, and a
 * direct one, preferred for migrations and used when available. Already applied
 * migrations are skipped, so it is safe to run on every deployment.
 *
 * @packageDocumentation
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL

if (!url) {
  console.log('DATABASE_URL absente : migrations ignorées (PGlite est migré au démarrage).')
  process.exit(0)
}

const pool = new Pool({ connectionString: url })
await migrate(drizzle(pool), { migrationsFolder: 'drizzle' })
await pool.end()
console.log('Migrations appliquées.')
