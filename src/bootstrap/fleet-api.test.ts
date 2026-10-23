import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { HarborView, RaidSummary, RaidView, TargetsList } from '@/modules/fleet/contracts'
import type { RankingEntry } from '@/modules/ranking/contracts'
import type { Stock } from '@/modules/realm/contracts'
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
 * Launches 3 triremes against Bob's village and returns the raid.
 *
 * @param api - Test application.
 * @param tactic - Tactic of the fleet; ramming by default.
 * @returns The raid identifier and its view.
 */
async function raidBob(api: TestApi, tactic = 'ram') {
  const res = await launch(api, { target: { kind: 'village', playerId: 'bob' }, ships: 3, tactic })
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

/**
 * Chooses the posture of a player's harbor.
 *
 * @param api - Test application.
 * @param posture - Posture sent.
 * @param player - Owner of the harbor.
 * @returns The response.
 */
const choosePosture = (api: TestApi, posture: unknown, player: string) =>
  api.api.request('/api/fleet/harbor/posture', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-test-user': player },
    body: JSON.stringify({ posture }),
  })

describe('API du module Flotte - accès et validation', () => {
  it('refuse une requête anonyme sur chaque route (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/fleet/targets', null)).status).toBe(401)
    expect((await api.get('/api/fleet/raids', null)).status).toBe(401)
    expect((await api.post('/api/fleet/raids', {}, null)).status).toBe(401)
    expect((await api.get('/api/fleet/raids/r1', null)).status).toBe(401)
    expect((await api.post('/api/fleet/raids/r1/recall', {}, null)).status).toBe(401)
    expect((await api.get('/api/fleet/harbor', null)).status).toBe(401)
    expect((await api.api.request('/api/fleet/harbor/posture', { method: 'PUT' })).status).toBe(401)
  })

  it('valide le corps des commandes (400)', async () => {
    const api = await seaWithVillages()
    const village = { kind: 'village', playerId: 'bob' }
    expect((await launch(api, { target: village, ships: 11, tactic: 'ram' })).status).toBe(400)
    expect((await launch(api, { target: village, ships: 3, tactic: 'canon' })).status).toBe(400)
    expect(
      (await launch(api, { target: { kind: 'kraken' }, ships: 3, tactic: 'ram' })).status,
    ).toBe(400)
    expect((await choosePosture(api, 'canon', 'bob')).status).toBe(400)
  })

  it("ne prend jamais le nom de la cible ni l'identité de l'attaquant dans la requête", async () => {
    const api = await seaWithVillages()
    const res = await launch(api, {
      target: { kind: 'village', playerId: 'bob', name: 'Nom forgé' },
      ships: 1,
      tactic: 'ram',
      attackerId: 'carol',
      attackerName: 'Carol',
    })
    const { view } = (await res.json()) as { view: RaidView }
    expect(view.target).toEqual({ kind: 'village', playerId: 'bob', name: 'Port de bob' })
    expect(view).toMatchObject({ role: 'attacker', attackerName: 'alice' })
  })
})

describe('API du module Flotte - cibles', () => {
  it('liste les villages des autres joueurs et les îles pirates', async () => {
    const api = await seaWithVillages()
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList

    expect(targets.home).toMatchObject({ name: 'Port de alice', defense: 20 })
    expect(targets.villages.map((v) => v.playerId).sort()).toEqual(['bob', 'carol'])
    expect(targets.villages[0]).toMatchObject({ defense: 20, travelMinutes: expect.any(Number) })
    expect(targets.islands.map((i) => i.islandId)).toEqual([
      'misty-reef',
      'raven-cove',
      'scarlet-atoll',
    ])
  })

  it('cherche un port par une partie de son nom, sans tenir compte de la casse', async () => {
    const api = await seaWithVillages()
    const res = await api.get('/api/fleet/targets?search=DE%20BOB')
    const targets = (await res.json()) as TargetsList
    expect(targets.villages.map((v) => v.playerId)).toEqual(['bob'])
    expect(targets.home?.name).toBe('Port de alice')
    expect((await api.get(`/api/fleet/targets?search=${'x'.repeat(31)}`)).status).toBe(400)
  })

  it('compte les améliorations du village dans sa défense, par le langage publié du Village', async () => {
    const api = await seaWithVillages()
    await api.post('/api/realm/village/upgrade', { building: 'sawmill' }, 'bob')
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList
    expect(targets.villages.find((v) => v.playerId === 'bob')?.defense).toBe(25)
  })
})

describe('API du module Flotte - raids contre un village', () => {
  it("prélève l'équipement, met la flotte en mer et la signale au défenseur", async () => {
    const api = await seaWithVillages()
    const { view } = await raidBob(api)

    expect(view).toMatchObject({
      status: 'at-sea',
      role: 'attacker',
      ships: 3,
      cost: { wood: 45, stone: 15 },
    })
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 55, stone: 35 })
    const harbor = await harborOf(api, 'bob')
    expect(harbor.log[0]).toMatchObject({
      type: 'FleetSighted',
      data: { attackerName: 'alice', ships: 3, arrivesAt: view.arrivesAt },
    })
    expect(JSON.stringify(harbor.log)).not.toContain('ram')
  })

  it("annule le raid lorsque le village de l'attaquant ne peut pas l'équiper", async () => {
    const api = await seaWithVillages()
    const res = await launch(api, {
      target: { kind: 'village', playerId: 'bob' },
      ships: 10,
      tactic: 'ram',
    })
    const { view } = (await res.json()) as { view: RaidView }

    expect(view).toMatchObject({ status: 'cancelled', missing: { wood: 50 } })
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 100, stone: 50 })
  })

  it('refuse un raid contre son village, contre un joueur sans village, et un troisième raid en mer', async () => {
    const api = await seaWithVillages()
    const self = await launch(api, {
      target: { kind: 'village', playerId: 'alice' },
      ships: 1,
      tactic: 'ram',
    })
    expect(self.status).toBe(409)
    const ghost = await launch(api, {
      target: { kind: 'village', playerId: 'dave' },
      ships: 1,
      tactic: 'ram',
    })
    expect(ghost.status).toBe(404)

    await raidBob(api)
    await launch(api, { target: { kind: 'village', playerId: 'carol' }, ships: 1, tactic: 'ram' })
    const third = await launch(api, {
      target: { kind: 'village', playerId: 'carol' },
      ships: 1,
      tactic: 'ram',
    })
    expect(third.status).toBe(409)
    expect(((await third.json()) as { error: { code: string } }).error.code).toBe('TOO_MANY_RAIDS')
  })

  it("rend l'équipement à l'attaquant qui rappelle sa flotte, et le défenseur la voit faire demi-tour", async () => {
    const api = await seaWithVillages()
    const { raidId } = await raidBob(api)

    expect((await api.post(`/api/fleet/raids/${raidId}/recall`, {}, 'bob')).status).toBe(403)
    const res = await api.post(`/api/fleet/raids/${raidId}/recall`, {}, 'alice')
    expect(((await res.json()) as { view: RaidView }).view.status).toBe('recalled')
    expect(await stockOf(api, 'alice')).toMatchObject({ wood: 100, stone: 50 })
    expect((await harborOf(api, 'bob')).log[0].type).toBe('FleetTurnedBack')
    expect((await api.post(`/api/fleet/raids/${raidId}/recall`, {}, 'alice')).status).toBe(409)
  })

  it('montre le raid au défenseur sans sa tactique, et ne le montre à aucun autre joueur', async () => {
    const api = await seaWithVillages()
    const { raidId } = await raidBob(api)

    const seen = (await (await viewOf(api, raidId, 'bob')).json()) as { view: RaidView }
    expect(seen.view).toMatchObject({ role: 'defender', tactic: null, cost: null })
    expect((await viewOf(api, raidId, 'carol')).status).toBe(404)
    expect((await viewOf(api, 'inconnu', 'alice')).status).toBe(404)
  })

  it("livre la bataille à l'arrivée de la flotte, à la première lecture, et pille le village", async () => {
    const api = await seaWithVillages()
    const { raidId, view } = await raidBob(api, 'ram')

    api.advance(6)
    const list = (await (await api.get('/api/fleet/raids', 'bob')).json()) as {
      raids: RaidSummary[]
    }
    expect(list.raids[0]).toMatchObject({ raidId, role: 'defender', tactic: 'ram', victory: true })

    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view.battle).toEqual({
      attack: 45,
      defense: 20,
      posture: 'blockade',
      victory: true,
    })
    expect(after.view).toMatchObject({ status: 'returned', loot: { wood: 30, stone: 15 } })
    expect(view.arrivesAt).toBeLessThanOrEqual(Date.UTC(2026, 0, 1) + 6 * 60_000)

    const [alice, bob, carol] = await Promise.all(
      ['alice', 'bob', 'carol'].map((p) => stockOf(api, p)),
    )
    expect(alice.wood).toBe(carol.wood - 45 + 30)
    expect(alice.stone).toBe(carol.stone - 15 + 15)
    expect(bob.wood).toBe(carol.wood - 30)
    expect((await harborOf(api, 'bob')).log[0]).toMatchObject({
      type: 'BattleReported',
      data: { role: 'defender', won: false, opponentName: 'alice', loot: { wood: 30, stone: 15 } },
    })
  })

  it('perd la flotte qui se heurte à la bonne posture', async () => {
    const api = await seaWithVillages()
    expect((await choosePosture(api, 'board', 'bob')).status).toBe(200)
    const { raidId } = await raidBob(api, 'ram')

    api.advance(6)
    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view).toMatchObject({
      status: 'sunk',
      battle: { attack: 15, posture: 'board', victory: false },
    })
    expect((await harborOf(api, 'alice')).log[0]).toMatchObject({
      type: 'BattleReported',
      data: { role: 'attacker', won: false },
    })
  })
})

describe('API du module Flotte - port', () => {
  it('enregistre la posture du seul joueur connecté', async () => {
    const api = await seaWithVillages()
    expect((await harborOf(api, 'bob')).holding).toBe('blockade')
    const res = await choosePosture(api, 'ram', 'bob')
    expect(((await res.json()) as HarborView).posture).toBe('ram')
    expect((await harborOf(api, 'bob')).holding).toBe('ram')
    expect((await harborOf(api, 'alice')).posture).toBeNull()
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
    const island = { kind: 'pirates', islandId: 'misty-reef' }
    const res = await launch(api, { target: island, ships: 4, tactic: 'blockade' })
    const { raidId } = (await res.json()) as { raidId: string }

    api.advance(3)
    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view).toMatchObject({
      status: 'returned',
      battle: { posture: 'board', victory: true },
      loot: { wood: 40, gold: 8 },
    })
    expect((await stockOf(api, 'alice')).gold).toBe((await stockOf(api, 'carol')).gold + 8)

    const ranking = (await (await api.get('/api/ranking/players', 'bob')).json()) as {
      entries: RankingEntry[]
    }
    expect(ranking.entries.find((e) => e.playerId === 'alice')?.gold).toBe(8)

    const again = await launch(api, { target: island, ships: 1, tactic: 'ram' })
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('TREASURE_TAKEN')
    const targets = (await (await api.get('/api/fleet/targets')).json()) as TargetsList
    expect(targets.islands[0].raidedToday).toBe(true)
  })

  it("fait jouer au capitaine la parade de la tactique favorite de l'attaquant", async () => {
    const api = await seaWithVillages()
    await launch(api, {
      target: { kind: 'pirates', islandId: 'misty-reef' },
      ships: 4,
      tactic: 'ram',
    })
    api.advance(3)
    await api.get('/api/fleet/raids')
    const res = await launch(api, {
      target: { kind: 'pirates', islandId: 'raven-cove' },
      ships: 4,
      tactic: 'ram',
    })
    const { raidId } = (await res.json()) as { raidId: string }
    api.advance(4)
    const after = (await (await viewOf(api, raidId)).json()) as { view: RaidView }
    expect(after.view.battle?.posture).toBe('board')
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
    expect((await stockOf(api, 'alice')).wood).toBe((await stockOf(api, 'carol')).wood)
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
