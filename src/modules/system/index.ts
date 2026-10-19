/**
 * Server public entry of the system module. Along with `ui.tsx`, it is the only
 * file of the module importable from outside.
 *
 * @packageDocumentation
 */
import { createSystemApi } from './api'

/**
 * Module factory.
 *
 * @returns The module, exposing its Hono sub-app.
 */
export function createSystemModule() {
  const startedAt = Date.now()
  return { api: createSystemApi(startedAt) }
}

export type { SystemApi } from './api'
