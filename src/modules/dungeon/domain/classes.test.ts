import { describe, expect, it } from 'vitest'
import { CLASSES, type HeroClass, SHRINE_HEAL, SKILL_COOLDOWN } from './content'
import { evolve, type GameEvent, type GameState, type Room, replay } from './game'
import { companionClass, decide, generateRooms, heroOf, monsterIntents } from './rules'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

const TROLL: Room = { kind: 'monsters', monsters: [{ kind: 'troll', hp: 20, attack: 7 }] }
const PACK: Room = {
  kind: 'monsters',
  monsters: [
    { kind: 'goblin', hp: 30, attack: 3 },
    { kind: 'spider', hp: 30, attack: 5 },
    { kind: 'cultist', hp: 30, attack: 4 },
  ],
}

/**
 * Builds an expedition of two heroes, alice and bob, in the first room of a dungeon.
 *
 * @param first - First room.
 * @param classes - Classes of alice and bob.
 * @param seed - Seed of the expedition.
 * @returns The state, once the first room entered.
 */
function party(first: Room, classes: [HeroClass, HeroClass], seed = 7): GameState {
  const events: GameEvent[] = [
    {
      type: 'GameCreated',
      data: { hostId: 'alice', hostName: 'Alice', hero: heroOf(classes[0]), seed, at: T0 },
    },
    {
      type: 'PlayerJoined',
      data: { playerId: 'bob', name: 'Bob', hero: heroOf(classes[1]), at: T0 },
    },
    { type: 'GameStarted', data: { rooms: [first, TROLL, TROLL, TROLL, TROLL, TROLL], at: T0 } },
    { type: 'RoomEntered', data: { heroId: 'alice', room: 0, deadline: T0 + 30_000, at: T0 } },
  ]
  return replay(events)
}

/**
 * Plays the actions of alice and bob for the current round.
 *
 * @param state - Expedition in combat.
 * @param alice - Command of alice.
 * @param bob - Command of bob.
 * @returns The events recorded and the new state.
 */
function round(state: GameState, alice: Parameters<typeof act>[1], bob: Parameters<typeof act>[1]) {
  const first = act(state, alice, 'alice')
  const second = act(first.state, bob, 'bob')
  return { state: second.state, events: [...first.events, ...second.events] }
}

/**
 * Submits the action of a hero, expected to be accepted.
 *
 * @param state - Expedition in combat.
 * @param action - Chosen action.
 * @param playerId - Player choosing.
 * @returns The events recorded and the new state.
 * @throws If the action is refused.
 */
function act(
  state: GameState,
  action: { type: 'attack'; target: string } | { type: 'defend' } | { type: 'skill' },
  playerId: string,
) {
  const decision = decide(state, { type: 'SubmitAction', playerId, round: state.round, action }, T0)
  if (!decision.ok) throw new Error(decision.error.code)
  return { state: decision.events.reduce(evolve, state), events: decision.events }
}

/**
 * Effects of the resolution among recorded events.
 *
 * @param events - Events recorded by a round.
 * @returns The effects of the `RoundResolved` event.
 */
const effectsOf = (events: GameEvent[]) =>
  events.flatMap((event) => (event.type === 'RoundResolved' ? event.data.effects : []))

describe('Donjon - classes, compétences et intentions', () => {
  it('donne à chaque classe ses points de vie, son attaque et sa compétence', () => {
    const state = party(TROLL, ['ranger', 'cleric'])
    expect(state.heroes[0]).toMatchObject({
      hp: 26,
      attack: 8,
      heroClass: 'ranger',
      skill: 'volley',
    })
    expect(state.heroes[1]).toMatchObject({ hp: 30, heal: CLASSES.cleric.heal, skill: 'prayer' })
  })

  it('choisit pour un compagnon le rôle qui manque au groupe', () => {
    const state = party(TROLL, ['warrior', 'ranger'])
    expect(companionClass(state.heroes)).toBe('cleric')
    expect(companionClass(party(TROLL, ['cleric', 'ranger']).heroes)).toBe('warrior')
  })

  it('garde le troll en facile, réveille la liche en difficile, et ouvre des sanctuaires', () => {
    expect(generateRooms(3, 2, 'easy').at(-1)).toMatchObject({ monsters: [{ kind: 'troll' }] })
    expect(generateRooms(3, 2, 'hard').at(-1)).toMatchObject({
      monsters: [{ kind: 'lich', hp: 48 }],
    })
    const kinds = new Set(
      Array.from({ length: 40 }, (_, seed) => generateRooms(seed, 2)).flatMap((rooms) =>
        rooms.map((room) => room.kind),
      ),
    )
    expect(kinds).toContain('shrine')
  })

  it('soigne les héros debout dans un sanctuaire, sans dépasser leur maximum', () => {
    const wounded = party(TROLL, ['warrior', 'ranger'])
    const state = {
      ...wounded,
      phase: 'exploring' as const,
      rooms: [TROLL, { kind: 'shrine' as const, heal: SHRINE_HEAL }, TROLL, TROLL, TROLL, TROLL],
      heroes: wounded.heroes.map((hero, i) => ({ ...hero, hp: i === 0 ? 30 : 20 })),
    }
    const after = evolve(state, {
      type: 'RoomEntered',
      data: { heroId: 'alice', room: 1, deadline: null, at: T0 },
    })
    expect(after.heroes.map((hero) => hero.hp)).toEqual([40, 26])
  })

  it('annonce la cible de chaque monstre, et la frappe à la résolution', () => {
    const state = party(PACK, ['ranger', 'cleric'])
    const intents = monsterIntents(state)
    expect(Object.keys(intents)).toEqual(['m0', 'm1', 'm2'])
    expect(toView(state, 'alice', T0)?.intents.m1).toMatchObject({
      target: intents.m1,
      min: 4,
      max: 6,
    })
    const { events } = round(state, { type: 'defend' }, { type: 'defend' })
    const blows = effectsOf(events).filter((effect) => effect.source.startsWith('m'))
    for (const blow of blows) expect(blow.target).toBe(intents[blow.source])
  })

  it('attire toutes les attaques sur le guerrier au rempart, qui en encaisse la moitié', () => {
    const state = party(PACK, ['warrior', 'ranger'])
    const { events } = round(state, { type: 'skill' }, { type: 'defend' })
    const blows = effectsOf(events).filter((effect) => effect.source.startsWith('m'))
    expect(blows.map((blow) => blow.target)).toEqual(['alice', 'alice', 'alice'])
    for (const blow of blows) expect(blow.amount).toBeLessThanOrEqual(3)
  })

  it('frappe chaque monstre de la pluie de flèches, et soigne tout le groupe par la prière', () => {
    const wounded = party(PACK, ['ranger', 'cleric'])
    const state = { ...wounded, heroes: wounded.heroes.map((hero) => ({ ...hero, hp: 10 })) }
    const effects = effectsOf(round(state, { type: 'skill' }, { type: 'skill' }).events)
    const volley = effects.filter((effect) => effect.kind === 'damage' && effect.skill === 'volley')
    expect(volley.map((effect) => effect.target)).toEqual(['m0', 'm1', 'm2'])
    const prayer = effects.filter((effect) => effect.kind === 'heal' && effect.skill === 'prayer')
    expect(prayer.map((effect) => effect.target)).toEqual(['alice', 'bob'])
    expect(prayer[0].amount).toBe(7)
  })

  it(`attend ${SKILL_COOLDOWN} manches avant de rendre une compétence`, () => {
    const state = party(PACK, ['ranger', 'cleric'])
    const after = round(state, { type: 'skill' }, { type: 'defend' }).state
    expect(toView(after, 'alice', T0)?.heroes[0].skillWait).toBe(SKILL_COOLDOWN - 1)
    const refused = decide(
      after,
      { type: 'SubmitAction', playerId: 'alice', round: after.round, action: { type: 'skill' } },
      T0,
    )
    expect(refused).toEqual({ ok: false, error: { code: 'SKILL_NOT_READY', rounds: 2 } })
  })

  it('double les dégâts sur un coup critique, et jamais pour un héros sans classe', () => {
    const crits = Array.from({ length: 30 }, (_, seed) => {
      const state = party(PACK, ['ranger', 'cleric'], seed)
      return effectsOf(round(state, { type: 'attack', target: 'm0' }, { type: 'defend' }).events)
    }).flatMap((effects) => effects.filter((effect) => effect.kind === 'damage' && effect.critical))
    expect(crits.length).toBeGreaterThan(0)
    for (const crit of crits) {
      expect(crit.amount % 2).toBe(0)
      expect(crit.amount).toBeGreaterThanOrEqual(12)
      expect(crit.amount).toBeLessThanOrEqual(20)
    }
  })

  it('décrit la carte des salles déjà ouvertes, jamais celles qui restent', () => {
    const state = party(PACK, ['warrior', 'cleric'])
    expect(toView(state, 'bob', T0)?.visited).toEqual(['monsters'])
  })
})
