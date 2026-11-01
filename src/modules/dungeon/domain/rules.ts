/**
 * Dungeon rules, following the decider pattern:
 *   decide(state, command, now) -> events or domain error
 * All game randomness is drawn here with a seeded generator and recorded in the
 * events: `evolve` (`game.ts`) only applies the results.
 *
 * @packageDocumentation
 */

import { chooseCompanionAction } from './companion'
import {
  BOSSES,
  CLASSES,
  COMMON_MONSTERS,
  DAMAGE_SPREAD,
  DEFAULT_DIFFICULTY,
  type Difficulty,
  DUNGEON_LENGTH,
  EXPLORE_MS,
  type HeroClass,
  MAX_HEROES,
  MONSTER_ATTACK_BONUS,
  MONSTERS,
  type MonsterKind,
  PRAYER_SHARE,
  ROOM_ODDS,
  ROUND_MS,
  SHRINE_HEAL,
  TREASURE_GOLD,
  VOLLEY_MALUS,
} from './content'
import {
  type Action,
  applyEffect,
  type Effect,
  evolve,
  type GameEvent,
  type GameState,
  type Hero,
  type HeroSpec,
  type MonsterSpec,
  type Phase,
  type Room,
  skillWait,
  standingHeroes,
  standingMonsters,
  standingPlayerHeroes,
} from './game'
import { MONSTER_STRATEGIES } from './monster-strategies'
import { mix, pick, type Random, randomInt, seeded } from './random'

/**
 * Requests on an expedition. In `SubmitAction`, `round` is the round the player
 * chose for, as shown on their screen. `AddCompanion` lets the host add a hero driven
 * by the game. `CheckDeadline` has no other effect than recording the rounds and
 * exploration turns whose deadline has passed.
 */
export type GameCommand =
  | {
      type: 'CreateGame'
      playerId: string
      name: string
      difficulty: Difficulty
      seed: number
      heroClass?: HeroClass
    }
  | { type: 'JoinGame'; playerId: string; name: string; heroClass?: HeroClass }
  | { type: 'AddCompanion'; playerId: string }
  | { type: 'StartGame'; playerId: string }
  | { type: 'OpenDoor'; playerId: string }
  | { type: 'SubmitAction'; playerId: string; round: number; action: Action }
  | { type: 'CheckDeadline' }

/** Business reasons for refusing a command. */
export type GameError =
  | { code: 'GAME_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'WRONG_PHASE'; phase: Phase }
  | { code: 'GAME_FULL' }
  | { code: 'ALREADY_JOINED' }
  | { code: 'NOT_A_MEMBER' }
  | { code: 'NOT_HOST' }
  | { code: 'NOT_YOUR_TURN' }
  | { code: 'HERO_DOWN' }
  | { code: 'ROUND_OVER'; round: number }
  | { code: 'ALREADY_CHOSEN' }
  | { code: 'INVALID_TARGET' }
  | { code: 'SKILL_NOT_READY'; rounds: number }

/** Outcome of {@link decide}: the events to record, or the refusal. */
export type Decision = { ok: true; events: GameEvent[] } | { ok: false; error: GameError }

/**
 * Builds a refusal.
 *
 * @param error - Reason of the refusal.
 * @returns The refused decision.
 */
const fail = (error: GameError): Decision => ({ ok: false, error })

/**
 * Starting stats of a hero of a class.
 *
 * @param heroClass - Class chosen by the player.
 * @returns The stats recorded in the event.
 */
export const heroOf = (heroClass: HeroClass): HeroSpec => ({
  hp: CLASSES[heroClass].hp,
  attack: CLASSES[heroClass].attack,
  heroClass,
})

/**
 * Class of a new companion: the role the party lacks most, the cleric first, then the
 * warrior, then the ranger.
 *
 * @param heroes - Heroes of the expedition.
 * @returns The class of the companion.
 */
export function companionClass(heroes: Hero[]): HeroClass {
  const order: HeroClass[] = ['cleric', 'warrior', 'ranger']
  const count = (kind: HeroClass) => heroes.filter((hero) => hero.heroClass === kind).length
  return order.reduce((best, kind) => (count(kind) < count(best) ? kind : best), order[0])
}

/**
 * Draws the content of the rooms. The derived seed `mix(seed, 0)` is only used for
 * rooms, so the same seed, hero count and difficulty always give the same dungeon.
 * Monster stats are read from the game content at draw time, with the attack bonus
 * of the difficulty level.
 *
 * @param seed - Expedition seed.
 * @param heroCount - Number of heroes, which scales monster rooms and the boss.
 * @param difficulty - Difficulty level, which sets the monster attack bonus.
 * @returns The rooms, the last one holding the boss.
 */
export function generateRooms(
  seed: number,
  heroCount: number,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): Room[] {
  const random = seeded(mix(seed, 0))
  const spec = (kind: MonsterKind): MonsterSpec => ({
    kind,
    hp: MONSTERS[kind].hp,
    attack: MONSTERS[kind].attack + MONSTER_ATTACK_BONUS[difficulty],
  })
  const rooms: Room[] = []
  for (let index = 0; index < DUNGEON_LENGTH - 1; index++) {
    const roll = random()
    if (roll < ROOM_ODDS.empty) {
      rooms.push({ kind: 'empty' })
    } else if (roll < ROOM_ODDS.empty + ROOM_ODDS.treasure) {
      rooms.push({
        kind: 'treasure',
        gold: randomInt(random, TREASURE_GOLD.min, TREASURE_GOLD.max),
      })
    } else if (roll < ROOM_ODDS.empty + ROOM_ODDS.treasure + ROOM_ODDS.shrine) {
      rooms.push({ kind: 'shrine', heal: SHRINE_HEAL })
    } else {
      const count = randomInt(random, 1, Math.min(3, heroCount))
      const monsters = Array.from({ length: count }, () => spec(pick(random, COMMON_MONSTERS)))
      rooms.push({ kind: 'monsters', monsters })
    }
  }
  const boss = spec(BOSSES[difficulty])
  rooms.push({ kind: 'monsters', monsters: [{ ...boss, hp: boss.hp * heroCount }] })
  return rooms
}

/**
 * Draws the damage dealt by a fighter: its attack, plus or minus the allowed spread.
 *
 * @param random - Generator.
 * @param attack - Attack of the fighter.
 * @param spread - Allowed deviation.
 * @returns The damage, never below 1.
 */
const rollDamage = (random: Random, attack: number, spread: number) =>
  Math.max(1, randomInt(random, attack - spread, attack + spread))

/**
 * Hero each standing monster will attack this round, announced before the heroes choose,
 * as monsters show their intent in a dungeon crawler. The derived seed `mix(seed, 2, round)`
 * only serves the intents, so every player reads the same ones, and the resolution follows
 * them. A monster targets with the strategy of the expedition difficulty.
 *
 * @param state - Expedition state, in combat.
 * @returns The targeted hero of each standing monster, by monster identifier.
 */
export function monsterIntents(state: GameState): Record<string, string> {
  const random = seeded(mix(state.seed, 2, state.round))
  const strategy = MONSTER_STRATEGIES[state.difficulty]
  const heroes = standingHeroes(state)
  const intents: Record<string, string> = {}
  if (heroes.length === 0) return intents
  for (const monster of standingMonsters(state)) {
    intents[monster.id] = strategy({ monster, heroes, actions: {}, random }).id
  }
  return intents
}

/**
 * Resolves the current round. The derived seed `mix(seed, 1, round)` only depends
 * on the round, so resolution always gives the same result whenever it is computed.
 * Companions choose their action through their own logic, but only when at least one
 * player has chosen an action; otherwise they defend, like absent players.
 *
 * Heals and the prayer come first, then the attacks of the heroes, with their critical
 * hits and the volley, then the monsters: each strikes the hero it announced, unless a
 * warrior raised the bulwark, which draws every blow. A hero defending, or behind the
 * bulwark, takes half the damage. When the combat is won before the last room, the event
 * carries the deadline to open the next door.
 *
 * @param state - Expedition state, in combat.
 * @param at - Time of the resolution, in milliseconds.
 * @returns The `RoundResolved` event, followed by `GameEnded` when the expedition ends.
 */
export function resolveRound(state: GameState, at: number): GameEvent[] {
  const random = seeded(mix(state.seed, 1, state.round))
  const playersActed = Object.keys(state.choices).length > 0
  const intents = monsterIntents(state)

  const actions: Record<string, Action> = {}
  for (const hero of standingHeroes(state)) {
    if (hero.companion && playersActed) {
      actions[hero.id] = chooseCompanionAction({
        heroes: standingHeroes(state),
        monsters: standingMonsters(state),
        self: hero,
        skillReady: skillWait(state, hero) === 0,
        intents,
      })
    } else {
      actions[hero.id] = state.choices[hero.id] ?? { type: 'defend' }
    }
  }

  let heroes = state.heroes
  let monsters = state.monsters
  const effects: Effect[] = []

  const record = (effect: Effect) => {
    effects.push(effect)
    heroes = applyEffect(heroes, effect)
    monsters = applyEffect(monsters, effect)
  }
  const isStanding = (id: string) => [...heroes, ...monsters].some((f) => f.id === id && f.hp > 0)
  const heroById = (id: string) => state.heroes.find((hero) => hero.id === id)

  for (const [heroId, action] of Object.entries(actions)) {
    const hero = heroById(heroId)
    if (!hero) continue
    if (action.type === 'heal' && isStanding(action.target)) {
      record({ kind: 'heal', source: heroId, target: action.target, amount: hero.heal })
    }
    if (action.type === 'skill' && hero.skill === 'prayer') {
      const amount = Math.round(hero.heal * PRAYER_SHARE)
      for (const ally of heroes.filter((candidate) => candidate.hp > 0)) {
        record({ kind: 'heal', source: heroId, target: ally.id, amount, skill: 'prayer' })
      }
    }
  }

  for (const [heroId, action] of Object.entries(actions)) {
    const hero = heroById(heroId)
    if (!hero) continue
    if (action.type === 'skill' && hero.skill === 'volley') {
      for (const monster of monsters.filter((candidate) => candidate.hp > 0)) {
        const amount = rollDamage(random, hero.attack - VOLLEY_MALUS, DAMAGE_SPREAD.hero)
        record({ kind: 'damage', source: heroId, target: monster.id, amount, skill: 'volley' })
      }
      continue
    }
    if (action.type !== 'attack') continue
    const target = isStanding(action.target)
      ? action.target
      : monsters.find((monster) => monster.hp > 0)?.id
    if (!target) break
    const amount = rollDamage(random, hero.attack, DAMAGE_SPREAD.hero)
    if (hero.critical > 0 && random() < hero.critical) {
      record({ kind: 'damage', source: heroId, target, amount: amount * 2, critical: true })
    } else {
      record({ kind: 'damage', source: heroId, target, amount })
    }
  }

  const strategy = MONSTER_STRATEGIES[state.difficulty]
  const bulwark = Object.entries(actions).find(
    ([heroId, action]) => action.type === 'skill' && heroById(heroId)?.skill === 'bulwark',
  )?.[0]
  const shielded = (heroId: string) =>
    actions[heroId]?.type === 'defend' || (heroId === bulwark && actions[heroId]?.type === 'skill')

  for (const monster of monsters) {
    const targets = heroes.filter((hero) => hero.hp > 0)
    if (monster.hp <= 0 || targets.length === 0) continue
    const guard = targets.find((hero) => hero.id === bulwark)
    const announced = targets.find((hero) => hero.id === intents[monster.id])
    const target = guard ?? announced ?? strategy({ monster, heroes: targets, actions, random })
    let amount = rollDamage(random, monster.attack, DAMAGE_SPREAD.monster)
    if (shielded(target.id)) amount = Math.ceil(amount / 2)
    record({ kind: 'damage', source: monster.id, target: target.id, amount })
  }

  const playersLeft = heroes.some((hero) => hero.hp > 0 && !hero.companion)
  const monstersLeft = monsters.some((monster) => monster.hp > 0)
  const combatGoesOn = playersLeft && monstersLeft
  const lastRoom = state.room === DUNGEON_LENGTH - 1
  const explorationGoesOn = playersLeft && !monstersLeft && !lastRoom
  const events: GameEvent[] = [
    {
      type: 'RoundResolved',
      data: {
        round: state.round,
        actions,
        effects,
        nextDeadline: combatGoesOn ? at + ROUND_MS : null,
        exploreDeadline: explorationGoesOn ? at + EXPLORE_MS : null,
        at,
      },
    },
  ]
  if (!playersLeft || (!monstersLeft && lastRoom)) {
    const result = playersLeft ? 'won' : 'lost'
    const heroIds = state.heroes.map((hero) => hero.id)
    events.push({ type: 'GameEnded', data: { result, loot: state.loot, heroIds, at } })
  }
  return events
}

/**
 * Opens the next door on behalf of a hero. The recorded deadline is the first
 * round's when the room holds monsters, otherwise the next exploration turn's.
 *
 * @param state - Expedition state, while exploring.
 * @param heroId - Identifier of the hero opening the door.
 * @param at - Time the door is opened, in milliseconds.
 * @returns The `RoomEntered` event.
 */
function enterNextRoom(state: GameState, heroId: string, at: number): GameEvent {
  const room = state.room + 1
  const fight = state.rooms[room].kind === 'monsters'
  const deadline = at + (fight ? ROUND_MS : EXPLORE_MS)
  return { type: 'RoomEntered', data: { heroId, room, deadline, at } }
}

/**
 * Lazy deadlines: resolves every round whose deadline has passed, and opens the
 * next door when an exploration turn runs out. Each overdue deadline is handled
 * at its own time, not at `now`, so the result does not depend on when it is computed.
 *
 * @param state - Expedition state.
 * @param now - Current time in milliseconds.
 * @returns The events settling the overdue deadlines; empty if none is due.
 */
export function settle(state: GameState, now: number): GameEvent[] {
  const events: GameEvent[] = []
  let current = state
  while (current.deadline !== null && current.deadline <= now) {
    const at = current.deadline
    let due: GameEvent[]
    if (current.phase === 'combat') due = resolveRound(current, at)
    else if (current.phase === 'exploring')
      due = [enterNextRoom(current, current.heroes[current.turn].id, at)]
    else break
    events.push(...due)
    current = due.reduce(evolve, current)
  }
  return events
}

/**
 * Decides whether a command is accepted, after settling the overdue rounds.
 *
 * @param state - Current expedition state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record (overdue resolutions first), or the domain error.
 */
export function decide(state: GameState, command: GameCommand, now: number): Decision {
  const due = settle(state, now)
  const current = due.reduce(evolve, state)
  const decision = decideCommand(current, command, now)
  return decision.ok ? { ok: true, events: [...due, ...decision.events] } : decision
}

/**
 * Tells whether a player takes part in the expedition. Companions are not members.
 *
 * @param state - Expedition state.
 * @param playerId - Player identifier.
 * @returns True if the player plays a hero.
 */
const isMember = (state: GameState, playerId: string) =>
  state.heroes.some((hero) => hero.id === playerId && !hero.companion)

/**
 * Decides a command on a state where overdue rounds are already settled.
 *
 * @param state - Settled expedition state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record, or the domain error.
 */
function decideCommand(state: GameState, command: GameCommand, now: number): Decision {
  if (command.type === 'CreateGame') {
    if (state.exists) return fail({ code: 'ALREADY_EXISTS' })
    const { playerId, name, difficulty, seed } = command
    const hero = heroOf(command.heroClass ?? 'warrior')
    return {
      ok: true,
      events: [
        {
          type: 'GameCreated',
          data: { hostId: playerId, hostName: name, hero, difficulty, seed, at: now },
        },
      ],
    }
  }

  if (!state.exists) return fail({ code: 'GAME_NOT_FOUND' })

  switch (command.type) {
    case 'JoinGame':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (isMember(state, command.playerId)) return fail({ code: 'ALREADY_JOINED' })
      if (state.heroes.length >= MAX_HEROES) return fail({ code: 'GAME_FULL' })
      return {
        ok: true,
        events: [
          {
            type: 'PlayerJoined',
            data: {
              playerId: command.playerId,
              name: command.name,
              hero: heroOf(command.heroClass ?? 'warrior'),
              at: now,
            },
          },
        ],
      }
    case 'AddCompanion': {
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (command.playerId !== state.hostId) return fail({ code: 'NOT_HOST' })
      if (state.heroes.length >= MAX_HEROES) return fail({ code: 'GAME_FULL' })
      const number = state.heroes.filter((hero) => hero.companion).length + 1
      return {
        ok: true,
        events: [
          {
            type: 'CompanionAdded',
            data: {
              companionId: `companion-${number}`,
              name: `Compagnon ${number}`,
              hero: heroOf(companionClass(state.heroes)),
              at: now,
            },
          },
        ],
      }
    }

    case 'StartGame':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (command.playerId !== state.hostId) return fail({ code: 'NOT_HOST' })
      return {
        ok: true,
        events: [
          {
            type: 'GameStarted',
            data: {
              rooms: generateRooms(state.seed, state.heroes.length, state.difficulty),
              deadline: now + EXPLORE_MS,
              at: now,
            },
          },
        ],
      }

    case 'OpenDoor': {
      if (state.phase !== 'exploring') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (!isMember(state, command.playerId)) return fail({ code: 'NOT_A_MEMBER' })
      if (state.heroes[state.turn].id !== command.playerId) return fail({ code: 'NOT_YOUR_TURN' })
      return { ok: true, events: [enterNextRoom(state, command.playerId, now)] }
    }

    case 'SubmitAction': {
      if (state.phase !== 'combat') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      const hero = state.heroes.find((candidate) => candidate.id === command.playerId)
      if (!hero || hero.companion) return fail({ code: 'NOT_A_MEMBER' })
      if (hero.hp <= 0) return fail({ code: 'HERO_DOWN' })
      if (command.round !== state.round) return fail({ code: 'ROUND_OVER', round: state.round })
      if (state.choices[hero.id]) return fail({ code: 'ALREADY_CHOSEN' })
      if (!isValidTarget(state, command.action)) return fail({ code: 'INVALID_TARGET' })
      if (command.action.type === 'skill') {
        const wait = skillWait(state, hero)
        if (wait === null) return fail({ code: 'INVALID_TARGET' })
        if (wait > 0) return fail({ code: 'SKILL_NOT_READY', rounds: wait })
      }

      const submitted: GameEvent = {
        type: 'ActionSubmitted',
        data: { heroId: hero.id, round: state.round, action: command.action, at: now },
      }
      const after = evolve(state, submitted)
      const everyoneReady = standingPlayerHeroes(after).every(
        (h) => after.choices[h.id] !== undefined,
      )
      return {
        ok: true,
        events: everyoneReady ? [submitted, ...resolveRound(after, now)] : [submitted],
      }
    }

    case 'CheckDeadline':
      return { ok: true, events: [] }
  }
}

/**
 * Checks an action target: an attack aims at a standing monster, a heal at a
 * standing hero.
 *
 * @param state - Expedition state.
 * @param action - Chosen action.
 * @returns True if the target is valid, always true for a defense or a skill.
 */
function isValidTarget(state: GameState, action: Action): boolean {
  if (action.type === 'attack') {
    return standingMonsters(state).some((monster) => monster.id === action.target)
  }
  if (action.type === 'heal') {
    return standingHeroes(state).some((hero) => hero.id === action.target)
  }
  return true
}
