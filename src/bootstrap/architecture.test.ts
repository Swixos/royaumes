import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'

/** Directories of the business modules. */
const MODULES = readdirSync(path.join(process.cwd(), 'src/modules'))

/**
 * Fitness functions: architecture rules that dependency-cruiser cannot check, because they
 * are not about imports, are checked by tests. The first one fails if a migration creates a
 * table in the `public` schema, or in a schema owned by no module or platform brick. The
 * second one ties the ADR 0008 obligation to a check: every module except `system`, which
 * keeps no data, must take part in player rights. The third one protects the determinism
 * of the naval battles (ADR 0012): the fleet domain reads neither the clock nor a random
 * source, so the same raid always ends the same way, and the pirate captains stay
 * predictable.
 */
describe("Fonctions d'aptitude", () => {
  it("range chaque table dans le schéma d'une brique de la plateforme ou d'un module", async () => {
    const db = await createTestDatabase()
    const result = await db.execute(sql`
      SELECT DISTINCT table_schema FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')`)
    const schemas = (result as unknown as { rows: { table_schema: string }[] }).rows.map(
      (row) => row.table_schema,
    )

    const owners = ['platform', 'identity', ...MODULES]
    expect(schemas).not.toContain('public')
    for (const schema of schemas) expect(owners).toContain(schema)
  })

  it('déclare les données personnelles de chaque module qui conserve des données', () => {
    const withData = MODULES.filter((module) => module !== 'system')
    for (const module of withData) {
      const file = path.join(process.cwd(), 'src/modules', module, 'personal-data.ts')
      expect(existsSync(file), `${module} n'a pas de fichier personal-data.ts`).toBe(true)
    }
  })

  it('garde le domaine de la Flotte déterministe : ni horloge, ni hasard', () => {
    const dir = path.join(process.cwd(), 'src/modules/fleet/domain')
    const files = readdirSync(dir).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    )
    expect(files.length).toBeGreaterThan(0)
    const forbidden = /Math\.random|Date\.now|new Date\b|performance\.now|crypto\./
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8')
      expect(forbidden.test(source), `${file} lit l'horloge ou le hasard`).toBe(false)
    }
  })
})
