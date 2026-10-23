import type { StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_VILLAGE, type PersonalDataContributor } from '@/platform/privacy/privacy'
import type { VillageService } from './application/village-service'
import { villageChannel } from './contracts'

/**
 * Rewrites a village event without the player's personal data: only the founding event
 * holds the village name, and it is in the player's stream. It serves the in-process
 * village, and the relayed copies of an extracted village.
 *
 * @param event - Candidate event.
 * @param playerId - Identifier of the player being erased.
 * @returns The event data with a neutral village name, or null if there is nothing to rewrite.
 */
export function redactVillageEvent(event: StoredEvent, playerId: string) {
  if (event.stream !== villageChannel(playerId) || event.type !== 'VillageFounded') return null
  if (event.data.name === ERASED_VILLAGE) return null
  return { ...event.data, name: ERASED_VILLAGE }
}

/**
 * Creates the personal data contributor of the village module: the village name, chosen
 * by the player. This file plays, for player rights, the role `api.ts` plays for requests
 * and `messages.ts` for the outbox. Only the founding event holds the village name, and
 * it is in the player's stream.
 *
 * @param service - Village application service.
 * @returns The village contributor.
 */
export function createRealmPersonalData(service: VillageService): PersonalDataContributor {
  return {
    name: 'realm',

    async export(playerId) {
      const view = await service.getView(playerId)
      return view ? { village: view.name, stock: view.stock, levels: view.levels } : null
    },

    redact: redactVillageEvent,
  }
}
