import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore, type EventStore } from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { ChronicleReader } from '../application/chronicle-reader'
import { createDrizzleChronicleReader } from './drizzle-chronicle-reader'

let store: EventStore
let reader: ChronicleReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleChronicleReader(db, createProjectionRunner(db))
})

/**
 * Reads the types of the entries of a player, latest first.
 *
 * @param playerId - Player whose chronicle is read.
 * @returns The types of the entries.
 */
const typesOf = async (playerId: string) =>
  (await reader.page(playerId, { limit: 50 })).entries.map((entry) => entry.type)

describe("Projection de l'historique", () => {
  it('raconte la fondation du village et ses chantiers, avec leur date de fin', async () => {
    await store.append('village-alice', 0, [
      { type: 'VillageFounded', data: { name: 'Valombre', at: 1_000 } },
      {
        type: 'BuildingUpgraded',
        data: {
          building: 'sawmill',
          toLevel: 2,
          cost: { wood: 40 },
          at: 2_000,
          completesAt: 9_000,
        },
      },
      { type: 'ResourcesWithdrawn', data: { transferId: 't1', resources: { wood: 5 }, at: 3_000 } },
    ])
    const { entries } = await reader.page('alice', { limit: 50 })
    expect(entries).toMatchObject([
      { type: 'building-ordered', building: 'sawmill', toLevel: 2, completesAt: 9_000, at: 2_000 },
      { type: 'village-founded', name: 'Valombre', at: 1_000 },
    ])
  })

  it("raconte un raid à l'attaquant et au défenseur, chacun de son côté", async () => {
    await store.append('raid-r1', 0, [
      {
        type: 'RaidLaunched',
        data: {
          raidId: 'r1',
          attackerId: 'alice',
          attackerName: 'Alice',
          target: { kind: 'village', playerId: 'bob', name: 'Roche-Haute' },
          ships: 3,
          tactic: 'ram',
          cost: {},
          travelMs: 1,
          at: 1,
        },
      },
    ])
    await store.append('harbor-bob', 0, [
      {
        type: 'FleetSighted',
        data: {
          raidId: 'r1',
          attackerId: 'alice',
          attackerName: 'Alice',
          ships: 3,
          arrivesAt: 9,
          at: 2,
        },
      },
      {
        type: 'BattleReported',
        data: {
          raidId: 'r1',
          role: 'defender',
          won: false,
          opponentId: 'alice',
          opponentName: 'Alice',
          loot: { wood: 20 },
          at: 3,
        },
      },
    ])
    await store.append('harbor-alice', 0, [
      {
        type: 'BattleReported',
        data: {
          raidId: 'r1',
          role: 'attacker',
          won: true,
          opponentId: 'bob',
          opponentName: 'Roche-Haute',
          loot: { wood: 20 },
          at: 3,
        },
      },
    ])
    expect(await typesOf('alice')).toEqual(['battle', 'raid-launched'])
    expect(await typesOf('bob')).toEqual(['battle', 'fleet-sighted'])
    const [report] = (await reader.page('bob', { limit: 1 })).entries
    expect(report).toMatchObject({ role: 'defender', won: false, opponent: 'Alice' })
  })

  it("raconte l'issue d'une expédition à ses joueurs, sans les compagnons", async () => {
    await store.append('dungeon-g1', 0, [
      { type: 'GameCreated', data: { hostId: 'alice', hostName: 'Alice', seed: 1, at: 1 } },
      { type: 'PlayerJoined', data: { playerId: 'bob', name: 'Bob', at: 2 } },
      { type: 'CompanionAdded', data: { companionId: 'c1', name: 'Golem', at: 3 } },
      {
        type: 'GameEnded',
        data: { result: 'won', loot: 40, heroIds: ['alice', 'bob', 'c1'], at: 4 },
      },
    ])
    expect((await reader.page('bob', { limit: 50 })).entries).toMatchObject([
      { type: 'expedition-ended', won: true, loot: 40 },
      { type: 'expedition-joined', host: 'Alice' },
    ])
    expect(await typesOf('alice')).toEqual(['expedition-ended', 'expedition-created'])
    expect(await typesOf('c1')).toEqual([])
  })

  it("raconte un échange au vendeur et à l'acheteur", async () => {
    await store.append('market-o1', 0, [
      {
        type: 'OfferPublished',
        data: {
          offerId: 'o1',
          sellerId: 'alice',
          sellerName: 'Alice',
          give: { wood: 10 },
          want: { stone: 5 },
          at: 1,
          expiresAt: 9,
        },
      },
      { type: 'OfferAccepted', data: { buyerId: 'bob', buyerName: 'Bob', attempt: 1, at: 2 } },
      { type: 'TradeCompleted', data: { at: 3 } },
    ])
    expect((await reader.page('alice', { limit: 50 })).entries).toMatchObject([
      { type: 'trade-completed', role: 'seller', partner: 'Bob' },
      { type: 'offer-published', give: { wood: 10 } },
    ])
    expect((await reader.page('bob', { limit: 50 })).entries).toMatchObject([
      { type: 'trade-completed', role: 'buyer', partner: 'Alice', want: { stone: 5 } },
    ])
  })

  it('filtre une partie du jeu, et pagine du plus récent au plus ancien', async () => {
    await store.append('village-alice', 0, [
      { type: 'VillageFounded', data: { name: 'Valombre', at: 1 } },
      ...[2, 3, 4].map((toLevel) => ({
        type: 'BuildingUpgraded',
        data: { building: 'sawmill', toLevel, cost: {}, at: toLevel },
      })),
    ])
    await store.append('dungeon-g1', 0, [
      { type: 'GameCreated', data: { hostId: 'alice', hostName: 'Alice', seed: 1, at: 5 } },
    ])
    const first = await reader.page('alice', { category: 'village', limit: 2 })
    expect(first.entries.map((entry) => entry.at)).toEqual([4, 3])
    expect(first.next).not.toBeNull()
    const second = await reader.page('alice', {
      category: 'village',
      limit: 2,
      before: first.next ?? undefined,
    })
    expect(second.entries.map((entry) => entry.at)).toEqual([2, 1])
    expect(second.next).toBeNull()
    expect(await typesOf('alice')).toHaveLength(5)
  })
})
