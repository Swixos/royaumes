import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit configuration, used to generate SQL migrations. Each platform
 * brick and each module declares its tables in its own `schema.ts`, gathered
 * here to produce the migrations.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/platform/*/schema.ts', './src/modules/*/infrastructure/schema.ts'],
  out: './drizzle',
})
