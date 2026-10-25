import { eq } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import {
  ATTACK_PER_SHIP,
  BEATS,
  DEFENSE_PER_WALL_LEVEL,
  HARBOR_CHANNEL_PREFIX,
  holdOf,
  RAID_STREAM_PREFIX,
  TACTICS,
  villageDefense,
} from '@/modules/fleet/contracts'
import { OFFER_STREAM_PREFIX } from '@/modules/market/contracts'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import type { Amounts, BattleDetail, Fact, Tactic } from '../domain/entry'
import { entries, expeditions, offers, raids } from './schema'

/**
 * Data of the events read by the chronicle. They form the published language of the
 * realm, fleet, dungeon and market modules: the chronicle depends on them like any reader
 * of the log. Only the useful fields are described.
 */
type Data = Record<string, unknown>

/**
 * Extracts an identifier from a stream name: "raid-7f3a" gives "7f3a".
 *
 * @param event - Event whose stream is read.
 * @param prefix - Stream prefix published by the module.
 * @returns The identifier after the prefix.
 */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/**
 * Time of an event: the time written by its module, or failing that the time it was
 * recorded in the log.
 *
 * @param event - Event to date.
 * @returns The time, in milliseconds.
 */
const timeOf = (event: StoredEvent) =>
  typeof event.data.at === 'number' ? event.data.at : event.occurredAt.getTime()

/**
 * Writes an entry of the chronicle of a player. Writing it again, when the projection is
 * rebuilt, changes nothing.
 *
 * @param tx - Transaction of the current catch-up.
 * @param event - Event told by the entry.
 * @param playerId - Player the entry is for.
 * @param fact - Fact told by the entry.
 * @returns Resolves once the entry is written.
 */
async function write(tx: DbTransaction, event: StoredEvent, playerId: string, fact: Fact) {
  const { type, ...data } = fact
  await tx
    .insert(entries)
    .values({ playerId, position: event.position, type, at: timeOf(event), data })
    .onConflictDoNothing()
}

/**
 * Finds a raid known from its launch.
 *
 * @param tx - Transaction of the current catch-up.
 * @param raidId - Raid identifier.
 * @returns The raid, or undefined if its launch was not read.
 */
async function raidOf(tx: DbTransaction, raidId: string) {
  const [raid] = await tx.select().from(raids).where(eq(raids.raidId, raidId))
  return raid
}

/**
 * Finds an offer known from its publication.
 *
 * @param tx - Transaction of the current catch-up.
 * @param offerId - Offer identifier.
 * @returns The offer, or undefined if its publication was not read.
 */
async function offerOf(tx: DbTransaction, offerId: string) {
  const [offer] = await tx.select().from(offers).where(eq(offers.offerId, offerId))
  return offer
}

/**
 * Tells the events of a village: its foundation and its constructions.
 *
 * @param event - Event of a village stream.
 * @param tx - Transaction of the current catch-up.
 * @returns Resolves once the entry is written.
 */
async function applyVillage(event: StoredEvent, tx: DbTransaction) {
  const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
  const data = event.data as Data
  if (event.type === 'VillageFounded') {
    await write(tx, event, playerId, { type: 'village-founded', name: String(data.name) })
  }
  if (event.type === 'BuildingUpgraded') {
    await write(tx, event, playerId, {
      type: 'building-ordered',
      building: String(data.building),
      toLevel: Number(data.toLevel),
      cost: (data.cost ?? {}) as Amounts,
      completesAt: typeof data.completesAt === 'number' ? data.completesAt : null,
    })
  }
}

/**
 * Builds the detail of the battle of a raid, from its fleet and its battle, with the rules
 * of the fleet published by its module: attack of a trireme, defense of a village and
 * tactic triangle.
 *
 * @param raid - Raid known from its launch, with its battle.
 * @returns The detail, or null before the battle.
 */
function detailOf(raid: typeof raids.$inferSelect): BattleDetail | null {
  if (!raid.battle || raid.ships === 0) return null
  const { attack, defense, posture } = raid.battle
  const multiplier = attack / (raid.ships * ATTACK_PER_SHIP)
  const wall = raid.pirates
    ? null
    : Math.round((defense - villageDefense(0)) / DEFENSE_PER_WALL_LEVEL)
  return {
    ships: raid.ships,
    tactic: raid.tactic,
    posture,
    counter: TACTICS.find((t) => BEATS[t] === raid.tactic) ?? posture,
    perShip: ATTACK_PER_SHIP,
    multiplier,
    attack,
    defense,
    pirates: raid.pirates,
    wall,
    perWallLevel: DEFENSE_PER_WALL_LEVEL,
    neededShips: Math.floor(defense / (ATTACK_PER_SHIP * multiplier)) + 1,
    cost: raid.cost,
    hold: holdOf(raid.ships),
  }
}

/**
 * Tells the events of a raid to its attacker: its launch, and how it ended before a
 * battle. The battle itself is told by the harbors.
 *
 * @param event - Event of a raid stream.
 * @param tx - Transaction of the current catch-up.
 * @returns Resolves once the entry is written.
 */
async function applyRaid(event: StoredEvent, tx: DbTransaction) {
  const raidId = idFrom(event, RAID_STREAM_PREFIX)
  const data = event.data as Data
  if (event.type === 'RaidLaunched') {
    const target = data.target as { kind: string; name: string }
    const attackerId = String(data.attackerId)
    await tx
      .insert(raids)
      .values({
        raidId,
        attackerId,
        attackerName: String(data.attackerName),
        targetName: target.name,
        pirates: target.kind === 'pirates',
        ships: Number(data.ships),
        tactic: data.tactic as Tactic,
        cost: (data.cost ?? {}) as Amounts,
      })
      .onConflictDoUpdate({
        target: raids.raidId,
        set: { attackerName: String(data.attackerName), targetName: target.name },
      })
    await write(tx, event, attackerId, {
      type: 'raid-launched',
      target: target.name,
      pirates: target.kind === 'pirates',
      ships: Number(data.ships),
      tactic: data.tactic as Tactic,
    })
    return
  }
  const raid = await raidOf(tx, raidId)
  if (!raid) return
  if (event.type === 'BattleFought') {
    await tx
      .update(raids)
      .set({
        battle: {
          attack: Number(data.attack),
          defense: Number(data.defense),
          posture: data.posture as Tactic,
        },
      })
      .where(eq(raids.raidId, raidId))
    return
  }
  const types = {
    RaidCancelled: 'raid-cancelled',
    FleetRecalled: 'fleet-recalled',
    RaidAborted: 'raid-aborted',
  } as const
  const type = types[event.type as keyof typeof types]
  if (type) await write(tx, event, raid.attackerId, { type, target: raid.targetName })
}

/**
 * Tells the events of a harbor to its owner: fleets sighted or turning back, battle
 * reports and changes of posture.
 *
 * @param event - Event of a harbor stream.
 * @param tx - Transaction of the current catch-up.
 * @returns Resolves once the entry is written.
 */
async function applyHarbor(event: StoredEvent, tx: DbTransaction) {
  const playerId = idFrom(event, HARBOR_CHANNEL_PREFIX)
  const data = event.data as Data
  switch (event.type) {
    case 'PostureChosen':
      await write(tx, event, playerId, { type: 'posture-chosen', posture: data.posture as Tactic })
      return
    case 'FleetSighted':
      await write(tx, event, playerId, {
        type: 'fleet-sighted',
        attacker: String(data.attackerName),
        ships: Number(data.ships),
        arrivesAt: Number(data.arrivesAt),
      })
      return
    case 'FleetTurnedBack': {
      const raid = await raidOf(tx, String(data.raidId))
      await write(tx, event, playerId, {
        type: 'fleet-turned-back',
        attacker: raid?.attackerName ?? 'une flotte inconnue',
      })
      return
    }
    case 'BattleReported': {
      const raid = await raidOf(tx, String(data.raidId))
      const report = raid ? detailOf(raid) : null
      await write(tx, event, playerId, {
        type: 'battle',
        role: data.role as 'attacker' | 'defender',
        won: Boolean(data.won),
        opponent: String(data.opponentName),
        loot: (data.loot ?? {}) as Amounts,
        ...(report ? { report } : {}),
      })
      return
    }
  }
}

/**
 * Tells the events of an expedition to its players, companions excluded: its creation,
 * the players joining it, and its outcome.
 *
 * @param event - Event of a dungeon stream.
 * @param tx - Transaction of the current catch-up.
 * @returns Resolves once the entries are written.
 */
async function applyExpedition(event: StoredEvent, tx: DbTransaction) {
  const gameId = idFrom(event, GAME_CHANNEL_PREFIX)
  const data = event.data as Data
  if (event.type === 'GameCreated') {
    const hostId = String(data.hostId)
    await tx
      .insert(expeditions)
      .values({ gameId, playerId: hostId, hostName: String(data.hostName) })
      .onConflictDoNothing()
    await write(tx, event, hostId, { type: 'expedition-created' })
    return
  }
  if (event.type === 'PlayerJoined') {
    const [host] = await tx.select().from(expeditions).where(eq(expeditions.gameId, gameId))
    const hostName = host?.hostName ?? 'un inconnu'
    const playerId = String(data.playerId)
    await tx.insert(expeditions).values({ gameId, playerId, hostName }).onConflictDoNothing()
    await write(tx, event, playerId, { type: 'expedition-joined', host: hostName })
    return
  }
  if (event.type === 'GameEnded') {
    const players = await tx.select().from(expeditions).where(eq(expeditions.gameId, gameId))
    for (const player of players) {
      await write(tx, event, player.playerId, {
        type: 'expedition-ended',
        won: data.result === 'won',
        loot: data.result === 'won' ? Number(data.loot) : 0,
      })
    }
    await tx.delete(expeditions).where(eq(expeditions.gameId, gameId))
  }
}

/**
 * Tells the events of an offer of the market: its publication and withdrawal to its
 * seller, and the trade to both its seller and its buyer.
 *
 * @param event - Event of a market stream.
 * @param tx - Transaction of the current catch-up.
 * @returns Resolves once the entries are written.
 */
async function applyOffer(event: StoredEvent, tx: DbTransaction) {
  const offerId = idFrom(event, OFFER_STREAM_PREFIX)
  const data = event.data as Data
  if (event.type === 'OfferPublished') {
    const give = (data.give ?? {}) as Amounts
    const want = (data.want ?? {}) as Amounts
    const sellerId = String(data.sellerId)
    await tx
      .insert(offers)
      .values({ offerId, sellerId, sellerName: String(data.sellerName), give, want })
      .onConflictDoUpdate({ target: offers.offerId, set: { sellerName: String(data.sellerName) } })
    await write(tx, event, sellerId, { type: 'offer-published', give, want })
    return
  }
  const offer = await offerOf(tx, offerId)
  if (!offer) return
  switch (event.type) {
    case 'OfferAccepted':
      await tx
        .update(offers)
        .set({ buyerId: String(data.buyerId), buyerName: String(data.buyerName) })
        .where(eq(offers.offerId, offerId))
      return
    case 'PaymentRefused':
      await tx
        .update(offers)
        .set({ buyerId: null, buyerName: null })
        .where(eq(offers.offerId, offerId))
      return
    case 'OfferWithdrawn':
      await write(tx, event, offer.sellerId, {
        type: 'offer-withdrawn',
        expired: data.reason === 'expired',
        give: offer.give,
        want: offer.want,
      })
      return
    case 'TradeCompleted': {
      const trade = { give: offer.give, want: offer.want }
      await write(tx, event, offer.sellerId, {
        type: 'trade-completed',
        role: 'seller',
        partner: offer.buyerName ?? 'un inconnu',
        ...trade,
      })
      if (offer.buyerId) {
        await write(tx, event, offer.buyerId, {
          type: 'trade-completed',
          role: 'buyer',
          partner: offer.sellerName,
          ...trade,
        })
      }
      return
    }
  }
}

/**
 * Chronicle projection: writes, for every player, an entry for each event of the game
 * that concerns them, whatever the module that recorded it. Each stream prefix sends the
 * event to the rules of its module.
 *
 * Version 2: keeps the fleet and the battle of each raid, for the battle reports.
 */
export const chronicleProjection: Projection = {
  name: 'chronicle',
  version: 2,
  eventTypes: [
    'VillageFounded',
    'BuildingUpgraded',
    'RaidLaunched',
    'RaidCancelled',
    'FleetRecalled',
    'RaidAborted',
    'BattleFought',
    'PostureChosen',
    'FleetSighted',
    'FleetTurnedBack',
    'BattleReported',
    'GameCreated',
    'PlayerJoined',
    'GameEnded',
    'OfferPublished',
    'OfferAccepted',
    'PaymentRefused',
    'OfferWithdrawn',
    'TradeCompleted',
  ],

  async apply(event, tx) {
    if (event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) return applyVillage(event, tx)
    if (event.stream.startsWith(RAID_STREAM_PREFIX)) return applyRaid(event, tx)
    if (event.stream.startsWith(HARBOR_CHANNEL_PREFIX)) return applyHarbor(event, tx)
    if (event.stream.startsWith(GAME_CHANNEL_PREFIX)) return applyExpedition(event, tx)
    if (event.stream.startsWith(OFFER_STREAM_PREFIX)) return applyOffer(event, tx)
  },

  async reset(tx) {
    await tx.delete(entries)
    await tx.delete(raids)
    await tx.delete(expeditions)
    await tx.delete(offers)
  },
}
