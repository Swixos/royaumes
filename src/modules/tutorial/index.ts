/**
 * Server public entry of the tutorial module. Along with `contracts.ts` and `ui.tsx`, it
 * is the only file of the module importable from outside.
 *
 * @packageDocumentation
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createTutorialApi } from './api'
import { createTutorialService } from './application/tutorial-service'
import { createDrizzleProgressReader } from './infrastructure/drizzle-progress-reader'
import { createEventStoreTutorialRepository } from './infrastructure/event-store-tutorial-repository'
import { createTutorialPersonalData } from './personal-data'

/** Dependencies of the tutorial module. */
export interface TutorialModuleDeps {
  /** Platform event store. */
  store: EventStore
  /** Database, in which the module keeps the progress of the players. */
  db: Db
  /** Projection runner of the platform. */
  projections: ProjectionRunner
  /** Outbox dispatch, triggered after a reward is claimed. */
  dispatch: () => Promise<unknown>
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/**
 * Module factory: wires the repository, the progress reader, the service and the API.
 * The tutorial has no channel: the interface reads it again after each action of the
 * player.
 *
 * @param deps - Event store, database, projection runner, outbox dispatch and optional clock.
 * @returns The module, exposing its Hono sub-app and its personal data contributor.
 */
export function createTutorialModule({
  store,
  db,
  projections,
  dispatch,
  clock,
}: TutorialModuleDeps) {
  const service = createTutorialService(
    createEventStoreTutorialRepository(store),
    createDrizzleProgressReader(db, projections),
    { dispatch, clock },
  )
  return {
    api: createTutorialApi(service),
    personalData: createTutorialPersonalData(store),
  }
}

export type { TutorialApi } from './api'
