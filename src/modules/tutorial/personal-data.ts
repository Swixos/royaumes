import type { EventStore } from '@/platform/event-store/event-store'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { tutorialStream } from './contracts'

/**
 * Creates the personal data contributor of the tutorial module: the progress of the
 * player in the tutorial. Its events and its tables hold no name, so there is nothing to
 * rewrite or erase; the export lists the events of the tutorial of the player.
 *
 * @param store - Platform event store.
 * @returns The tutorial contributor.
 */
export function createTutorialPersonalData(store: EventStore): PersonalDataContributor {
  return {
    name: 'tutorial',

    async export(playerId) {
      const events = await store.read(tutorialStream(playerId))
      return events.map((event) => ({ type: event.type, ...event.data }))
    },
  }
}
