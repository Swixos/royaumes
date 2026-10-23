import { defineConfig } from '@playwright/test'

/**
 * Configuration of the end-to-end tests: they drive the interface in a browser, against
 * the development server, started on demand. They are not part of `pnpm verify`, which
 * stays fast and needs no browser: they run with `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1400, height: 1000 },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/system/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
