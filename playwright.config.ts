import { defineConfig } from '@playwright/test'

/** Port of the server started for the end-to-end tests. */
const PORT = 3100

/**
 * Configuration of the end-to-end tests: they drive the interface in a browser, against a
 * production build of the application, started on demand with its local database and
 * without rate limiting of sign-ups. A production build has no hot reload, which would
 * reload the pages under test. The tests are not part of `pnpm verify`, which stays fast
 * and needs no browser: they run with `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1400, height: 1000 },
  },
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/system/health`,
    env: { AUTH_RATE_LIMIT: 'off', BETTER_AUTH_URL: `http://localhost:${PORT}` },
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
