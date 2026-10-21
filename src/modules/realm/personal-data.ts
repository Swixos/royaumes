import type { StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_VILLAGE, type PersonalDataContributor } from '@/platform/privacy/privacy'
import type { VillageService } from './application/village-service'
import { villageChannel } from './contracts'

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

    redact(event: StoredEvent, playerId) {
      if (event.stream !== villageChannel(playerId) || event.type !== 'VillageFounded') return null
      if (event.data.name === ERASED_VILLAGE) return null
      return { ...event.data, name: ERASED_VILLAGE }
    },
  }
}
