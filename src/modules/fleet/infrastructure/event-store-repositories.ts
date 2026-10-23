import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { HarborRepository, RaidRepository } from '../application/raid-repository'
import { harborChannel, raidStream } from '../contracts'
import { type HarborEvent, replayHarbor } from '../domain/harbor'
import { type RaidEvent, replay } from '../domain/raid'

/** Number of harbor events returned as its log. */
const LOG_SIZE = 20

/**
 * {@link RaidRepository} adapter backed by the event store. The events of the raid and
 * the saga messages are recorded in a single transaction.
 *
 * @param store - Platform event store.
 * @returns The raid repository.
 */
export function createEventStoreRaidRepository(store: EventStore): RaidRepository {
  return {
    async load(raidId) {
      const stored = await store.read(raidStream(raidId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as RaidEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(raidId, expectedVersion, events, messages) {
      await store.append(
        raidStream(raidId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}

/**
 * {@link HarborRepository} adapter backed by the event store: one stream per player,
 * which is also the real-time channel of their harbor.
 *
 * @param store - Platform event store.
 * @returns The harbor repository.
 */
export function createEventStoreHarborRepository(store: EventStore): HarborRepository {
  return {
    async load(playerId) {
      const stored = await store.read(harborChannel(playerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as HarborEvent)
      return {
        state: replayHarbor(events),
        version: stored.at(-1)?.version ?? 0,
        log: stored
          .slice(-LOG_SIZE)
          .reverse()
          .map((e) => ({ version: e.version, type: e.type, data: e.data })),
      }
    },

    async save(playerId, expectedVersion, events) {
      await store.append(harborChannel(playerId), expectedVersion, events as unknown as NewEvent[])
    },
  }
}
