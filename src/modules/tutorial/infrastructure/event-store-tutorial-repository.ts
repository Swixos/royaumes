import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { TutorialRepository } from '../application/ports'
import { tutorialStream } from '../contracts'
import { replay, type TutorialEvent } from '../domain/tutorial'

/**
 * {@link TutorialRepository} adapter backed by the event store. The events of the
 * tutorial and the reward messages are recorded in a single transaction.
 *
 * @param store - Platform event store.
 * @returns The tutorial repository.
 */
export function createEventStoreTutorialRepository(store: EventStore): TutorialRepository {
  return {
    async load(playerId) {
      const stored = await store.read(tutorialStream(playerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as TutorialEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(playerId, expectedVersion, events, messages) {
      await store.append(
        tutorialStream(playerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
