import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { HarborView, RaidSummary, RaidView, TargetsList } from '@/modules/fleet/contracts'
import type { RankingEntry } from '@/modules/ranking/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createEventStore } from '@/platform/event-store/event-store'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Builds a test application where Alice, Bob and Carol founded their village: each has
 * 100 wood and 50 stone. Carol never raids nor is raided: her stock is the reference
 * production, so stocks are compared with hers once time has passed.
 *
 * @returns The test application.
 */
async function seaWithVillages() {
  const api = await createTestApi()
  for (const player of ['alice', 'bob', 'carol']) {
    await api.post('/api/realm/village', { name: `Port de ${player}` }, player)
  }
  return api
}

/**
 * Reads the stock of a player's village.
 *
 * @param api - Test application.
 * @param player - Player identifier.
 * @returns The stock.
 */
async function stockOf(api: TestApi, player: string): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/**
 * Gives units to a player's village, as if trained long ago at the barracks and the
 * shipyard: the orders are recorded in the village log, the way the village module
 * records them.
 *
 * @param api - Test application.
 * @param player - Player identifier.
 * @param army - Units to give.
 * @returns Resolves once the orders are recorded.
 */
async function enlist(api: TestApi, player: string, army: Record<string, number>) {
  const store = createEventStore(api.db)
  const stream = `village-${player}`
  const version = (await store.read(stream)).length
  await store.append(
    stream,
    version,
    Object.entries(army).map(([unit, count]) => ({
      type: 'UnitsRecruited',
      data: { unit, count, cost: {}, at: 0, startsAt: 0, each: 1 },
    })),
  )
}

/**
 * Reads the units at home in a player's village.
 *
 * @param api - Test application.
 * @param player - Player identifier.
 * @returns The units at home.
 */
async function armyOf(api: TestApi, player: string) {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { army: Record<string, number> } }).view.army
}

/** Army of the raids of the tests: ten slingers in a transport. */
const ARMY = { slinger: 10, transport: 1 }

/**
 * Launches a raid.
 *
 * @param api - Test application.
 * @param body - Body of the request.
 * @param player - Attacker; Alice by default.
 * @returns The response.
 */
const launch = (api: TestApi, body: unknown, player = 'alice') =>
  api.post('/api/fleet/raids', body, player)

/**
 * Sends ten slingers of Alice against Bob's village and returns the raid.
 *
 * @param api - Test application.
 * @returns The raid identifier and its view.
 */
async function raidBob(api: TestApi) {
  await enlist(api, 'alice', ARMY)
  const res = await launch(api, { target: { kind: 'village', playerId: 'bob' }, army: ARMY })
  expect(res.status).toBe(201)
  return (await res.json()) as { raidId: string; view: RaidView }
}

/**
 * Reads a raid.
 *
 * @param api - Test application.
 * @param raidId - Raid identifier.
 * @param player - Viewing player.
 * @returns The response.
 */
const viewOf = (api: TestApi, raidId: string, player = 'alice') =>
  api.get(`/api/fleet/raids/${raidId}`, player)

/**
 * Reads a player's harbor.
 *
 * @param api - Test application.
 * @param player - Owner of the harbor.
 * @returns The harbor.
 */
async function harborOf(api: TestApi, player: string) {
  return (await (await api.get('/api/fleet/harbor', player)).json()) as HarborView
}

describe('API du module Flotte - accès et validation', () => {
  it('refuse une requête anonyme sur chaque route (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/fleet/targets', null)).status).toBe(401)
    expect((await api.get('/api/fleet/raids', null)).status).toBe(401)
    expect((await api.post('/api/fleet/raids', {}, null)).status).toBe(401)
    expect((await api.get('/api/fleet/raids/r1', null)).status).toBe(401)
    expect((await api.post('/api/fleet/raids/r1/recall', {}, null)).status).toBe(401)
    expect((await api.get('/api/fleet/harbor', null)).status).toBe(401)
  })

  it('valide le corps des commandes (400)', async () => {
    const api = await seaWithVillages()
    const village = { kind: 'village', playerId: 'bob' }
    expect((await launch(api, { target: village, army: { dragon: 1 } })).status).toBe(400)
    expect((await launch(api, { target: village, army: { slinger: -1 } })).status).toBe(400)
    expect((await launch(api, { target: village, ships: 3, tactic: 'ram' })).status).toBe(400)
    expect((await launch(api, { target: { kind: 'kraken' }, army: ARMY })).status).toBe(400)
  })

  it("ne prend jamais le nom de la cible ni l'identité de l'attaquant dans la requête", async () => {
    const api = await seaWithVillages()
    await enlist(api, 'alice', ARMY)
    const res = await launch(api, {
      target: { kind: 'village', playerId: 'bob', name: 'Nom forgé' },
      army: ARMY,
      attackerId: 'carol',
      attackerName: 'Carol',
    })
    const { view } = (await res.json()) as { view: RaidView }
    expect(view.target).toEqual({ kind: 'village', playerId: 'bob', name: 'Port de bob' })
    expect(view).toMatchObject({ role: 'attacker', attackerName: 'alice' })
  })
})

describe('API du module Flotte - cibles', () => {
  it('liste les villages des autres joueurs, les îles pirates et les troupes prêtes à partir', async () => {
    const api = await seaWithVillages()
    await enlist(api, 'alice', ARMY)
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList

    expect(targets.home).toMatchObject({ name: 'Port de alice', defense: 20, garrison: ARMY })
    expect(targets.villages.map((v) => v.playerId).sort()).toEqual(['bob', 'carol'])
    expect(targets.villages[0]).toMatchObject({ wall: 0, travelMinutes: expect.any(Number) })
    expect(targets.islands.map((i) => i.islandId)).toEqual([
      'misty-reef',
      'raven-cove',
      'scarlet-atoll',
    ])
    expect(targets.islands[0].garrison).toEqual({ swordsman: 4, slinger: 2 })
  })

  it('cherche un port par une partie de son nom, sans tenir compte de la casse', async () => {
    const api = await seaWithVillages()
    const res = await api.get('/api/fleet/targets?search=DE%20BOB')
    const targets = (await res.json()) as TargetsList
    expect(targets.villages.map((v) => v.playerId)).toEqual(['bob'])
    expect(targets.home?.name).toBe('Port de alice')
    expect((await api.get(`/api/fleet/targets?search=${'x'.repeat(31)}`)).status).toBe(400)
  })

  it('compte le rempart du village une fois achevé, par le langage publié du Village', async () => {
    const api = await seaWithVillages()
    /**
     * Orders an upgrade for Bob, then lets time pass.
     *
     * @param building - Building to upgrade.
     * @param wait - Minutes to let pass after the order.
     */
    const build = async (building: string, wait: number) => {
      expect((await api.post('/api/realm/village/upgrade', { building }, 'bob')).status).toBe(200)
      api.advance(wait)
    }
    /**
     * Reads the wall of Bob's village, as Alice sees it.
     *
     * @returns The level of the wall.
     */
    const wall = async () => {
      const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList
      return targets.villages.find((v) => v.playerId === 'bob')?.wall
    }
    api.advance(30)
    await build('sawmill', 0)
    await build('senate', 60)
    await build('senate', 30)
    await build('wall', 0)
    expect(await wall()).toBe(0)
    api.advance(10)
    expect(await wall()).toBe(1)
    expect((await harborOf(api, 'bob')).wall).toBe(1)
  })
})

describe('API du module Flotte - raids contre un village', () => {
  it("fait partir l'armée du village, met la flotte en mer et la signale au défenseur", async () => {
    const api = await seaWithVillages()
    const { view } = await raidBob(api)

    expect(view).toMatchObject({ status: 'at-sea', role: 'attacker', ships: 1, army: ARMY })
    expect(await armyOf(api, 'alice')).toEqual({})
    const harbor = await harborOf(api, 'bob')
    expect(harbor.log[0]).toMatchObject({
      type: 'FleetSighted',
      data: { attackerName: 'alice', ships: 1, arrivesAt: view.arrivesAt },
    })
    expect(JSON.stringify(harbor.log)).not.toContain('slinger')
  })

  it("annule le raid lorsque l'attaquant n'a pas les troupes demandées", async () => {
    const api = await seaWithVillages()
    await enlist(api, 'alice', { slinger: 4, transport: 1 })
    const res = await launch(api, { target: { kind: 'village', playerId: 'bob' }, army: ARMY })
    const { view } = (await res.json()) as { view: RaidView }
    expect(view).toMatchObject({ status: 'cancelled', missing: { slinger: 6 } })
    expect(await armyOf(api, 'alice')).toEqual({ slinger: 4, transport: 1 })
  })

  it('refuse un raid sans navire, contre son village, contre un joueur sans village, et un troisième raid en mer', async () => {
    const api = await seaWithVillages()
    const bob = { kind: 'village', playerId: 'bob' }
    const noShip = await launch(api, { target: bob, army: { slinger: 3 } })
    expect(noShip.status).toBe(422)
    expect(
      (await launch(api, { target: { kind: 'village', playerId: 'alice' }, army: ARMY })).status,
    ).toBe(409)
    expect(
      (await launch(api, { target: { kind: 'village', playerId: 'dave' }, army: ARMY })).status,
    ).toBe(404)

    await enlist(api, 'alice', { lightShip: 3 })
    await launch(api, { target: bob, army: { lightShip: 1 } })
    await launch(api, { target: { kind: 'village', playerId: 'carol' }, army: { lightShip: 1 } })
    const third = await launch(api, { target: bob, army: { lightShip: 1 } })
    expect(third.status).toBe(409)
    expect(((await third.json()) as { error: { code: string } }).error.code).toBe('TOO_MANY_RAIDS')
  })

  it("ramène l'armée rappelée après le temps déjà passé en mer, et le défenseur la voit faire demi-tour", async () => {
    const api = await seaWithVillages()
    const { raidId } = await raidBob(api)
    api.advance(1)

    expect((await api.post(`/api/fleet/raids/${raidId}/recall`, {}, 'bob')).status).toBe(403)
    const res = await api.post(`/api/fleet/raids/${raidId}/recall`, {}, 'alice')
    const { view } = (await res.json()) as { view: RaidView }
    expect(view.status).toBe('recalled')
    expect(view.returnsAt).toBeGreaterThan(Date.UTC(2026, 0, 1) + 60_000)
    expect((await harborOf(api, 'bob')).log[0].type).toBe('FleetTurnedBack')

    api.advance(2)
    await api.get('/api/fleet/raids')
    expect(await armyOf(api, 'alice')).toEqual(ARMY)
  })

  it("montre le raid au défenseur sans l'armée, et ne le montre à aucun autre joueur", async () => {
    const api = await seaWithVillages()
    const { raidId } = await raidBob(api)
    const seen = (await (await viewOf(api, raidId, 'bob')).json()) as { view: RaidView }
    expect(seen.view).toMatchObject({ role: 'defender', army: null, cost: null })
    expect((await viewOf(api, raidId, 'carol')).status).toBe(404)
    expect((await viewOf(api, 'inconnu', 'alice')).status).toBe(404)
  })

  it('livre la bataille contre la garnison, tue les défenseurs, pille le village et rentre avec le butin', async () => {
    const api = await seaWithVillages()
    await enlist(api, 'bob', { swordsman: 2 })
    const { raidId, view } = await raidBob(api)

    api.advance(6)
    const list = (await (await api.get('/api/fleet/raids', 'bob')).json()) as {
      raids: RaidSummary[]
    }
    expect(list.raids[0]).toMatchObject({ raidId, role: 'defender', army: ARMY, victory: true })
    expect(await armyOf(api, 'bob')).toEqual({})

    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view.report).toMatchObject({
      victory: true,
      defender: { present: { swordsman: 2 }, lost: { swordsman: 2 } },
    })
    expect(after.view.status).toBe('returned')
    const loot = after.view.loot as Record<string, number>
    expect(loot.wood).toBeGreaterThan(0)
    expect(after.view.returnsAt).toBe(after.view.arrivesAt + view.arrivesAt - view.sailedAt)

    api.advance(Math.ceil((view.arrivesAt - view.sailedAt) / 60_000))
    await api.get('/api/fleet/raids')
    const home = await armyOf(api, 'alice')
    expect(home.transport).toBe(1)
    expect(home.slinger).toBe(10 - (after.view.report?.attacker.lost.slinger ?? 0))
    const [alice, carol] = await Promise.all(['alice', 'carol'].map((p) => stockOf(api, p)))
    expect(alice.wood - carol.wood).toBe(loot.wood)
    expect((await harborOf(api, 'bob')).log[0]).toMatchObject({
      type: 'BattleReported',
      data: { role: 'defender', won: false, opponentName: 'alice', report: { victory: true } },
    })
  })

  it('perd ses troupes contre une garnison plus forte, qui compte ses propres morts', async () => {
    const api = await seaWithVillages()
    await enlist(api, 'bob', { swordsman: 10 })
    const { raidId } = await raidBob(api)

    api.advance(6)
    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view.status).toBe('sunk')
    expect(after.view.report?.attacker.lost).toEqual({ slinger: 10 })
    const lost = after.view.report?.defender.lost.swordsman ?? 0
    expect(lost).toBeGreaterThan(0)
    expect((await armyOf(api, 'bob')).swordsman).toBe(10 - lost)
    expect((await harborOf(api, 'alice')).log[0]).toMatchObject({
      type: 'BattleReported',
      data: { role: 'attacker', won: false },
    })
  })
})

describe('API du module Flotte - port', () => {
  it('montre la garnison du village, qui le défend', async () => {
    const api = await seaWithVillages()
    await enlist(api, 'bob', { archer: 3, bireme: 1 })
    expect(await harborOf(api, 'bob')).toMatchObject({
      garrison: { archer: 3, bireme: 1 },
      wall: 0,
    })
    expect((await harborOf(api, 'alice')).garrison).toEqual({})
  })

  it("n'ouvre le canal d'un port qu'à son propriétaire", async () => {
    const api = await seaWithVillages()
    await raidBob(api)
    expect((await api.get('/api/stream/harbor-bob/events', 'alice')).status).toBe(403)
    const res = await api.get('/api/stream/harbor-bob/events?after=0', 'bob')
    const { events } = (await res.json()) as { events: { type: string }[] }
    expect(events.map((e) => e.type)).toEqual(['FleetSighted'])
  })
})

describe('API du module Flotte - îles pirates', () => {
  it("pille le trésor de l'île, l'ajoute au classement, et refuse une seconde attaque le même jour", async () => {
    const api = await seaWithVillages()
    await enlist(api, 'alice', ARMY)
    const island = { kind: 'pirates', islandId: 'misty-reef' }
    const res = await launch(api, { target: island, army: ARMY })
    const { raidId } = (await res.json()) as { raidId: string }

    api.advance(3)
    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view).toMatchObject({ status: 'returned', report: { victory: true } })
    const gold = (after.view.loot as Record<string, number>).gold

    const ranking = (await (await api.get('/api/ranking/players', 'bob')).json()) as {
      entries: RankingEntry[]
    }
    expect(ranking.entries.find((e) => e.playerId === 'alice')?.gold).toBe(gold)

    const again = await launch(api, { target: island, army: { transport: 1 } })
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('TREASURE_TAKEN')
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList
    expect(targets.islands[0].raidedToday).toBe(true)
  })

  it("fait appeler au capitaine un renfort contre l'arme favorite de l'attaquant", async () => {
    const api = await seaWithVillages()
    await enlist(api, 'alice', ARMY)
    await launch(api, { target: { kind: 'pirates', islandId: 'misty-reef' }, army: ARMY })
    api.advance(3)
    await api.get('/api/fleet/raids')
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList
    const cove = targets.islands.find((i) => i.islandId === 'raven-cove')
    expect(cove?.garrison.swordsman).toBe(16)
  })
})

describe('API du module Flotte - données personnelles', () => {
  it("exporte les raids du joueur, et retire son village des cibles à l'effacement", async () => {
    const api = await seaWithVillages()
    const { raidId } = await raidBob(api)

    const exported = await (await api.get('/api/account/export', 'bob')).json()
    expect(exported.sections.fleet.suffered).toMatchObject([{ raidId, attacker: 'alice' }])
    expect(exported.sections.fleet.harbor).toMatchObject([{ type: 'FleetSighted' }])

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'bob' } })
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList
    expect(targets.villages.map((v) => v.playerId)).toEqual(['carol'])
    const list = (await (await api.get('/api/fleet/raids')).json()) as { raids: RaidSummary[] }
    expect(list.raids[0].targetName).toBe('Village effacé')

    api.advance(6)
    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view.status).toBe('aborted')
    api.advance(6)
    await api.get('/api/fleet/raids')
    expect(await armyOf(api, 'alice')).toEqual(ARMY)
  })

  it("ne recopie aucun nom de joueur dans les avis conservés par la boîte d'envoi", async () => {
    const api = await seaWithVillages()
    const { raidId } = await raidBob(api)
    api.advance(6)
    await viewOf(api, raidId)

    const result = await api.db.execute(
      sql`SELECT payload FROM platform.outbox WHERE topic = 'fleet.notice'`,
    )
    const payloads = (result as unknown as { rows: { payload: Record<string, unknown> }[] }).rows
    expect(payloads.length).toBeGreaterThanOrEqual(3)
    for (const { payload } of payloads) {
      expect(Object.keys(payload).sort()).toEqual(['notice', 'playerId', 'raidId'])
    }
  })

  it("efface le nom de l'attaquant des ports qui ont vu sa flotte", async () => {
    const api = await seaWithVillages()
    await raidBob(api)
    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    expect((await harborOf(api, 'bob')).log[0].data.attackerName).toBe('Joueur effacé')
  })
})
