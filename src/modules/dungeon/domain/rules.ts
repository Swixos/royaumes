/**
 * Dungeon rules, following the decider pattern:
 *   decide(state, command, now) -> events or domain error
 * All game randomness is drawn here with a seeded generator and recorded in the
 * events: `evolve` (`game.ts`) only applies the results.
 *
 * @packageDocumentation
 */
import {
  BOSS,
  COMMON_MONSTERS,
  DAMAGE_SPREAD,
  DUNGEON_LENGTH,
  HEAL_AMOUNT,
  HERO,
  MAX_HEROES,
  MONSTERS,
  type MonsterKind,
  ROOM_ODDS,
  ROUND_MS,
  TREASURE_GOLD,
} from './content'
import {
  type Action,
  applyEffect,
  type Effect,
  evolve,
  type GameEvent,
  type GameState,
  type Hero,
  type Monster,
  type MonsterSpec,
  type Phase,
  type Room,
  standingHeroes,
  standingMonsters,
} from './game'
import { mix, pick, type Random, randomInt, seeded } from './random'

/**
 * Requests on an expedition. In `SubmitAction`, `round` is the round the player
 * chose for, as shown on their screen. `CheckDeadline` has no other effect than
 * recording the rounds whose deadline has passed.
 */
export type GameCommand =
  | { type: 'CreateGame'; playerId: string; name: string; seed: number }
  | { type: 'JoinGame'; playerId: string; name: string }
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
 * Draws the content of the rooms. The derived seed `mix(seed, 0)` is only used for
 * rooms, so the same seed and hero count always give the same dungeon.
 *
 * @param seed - Expedition seed.
 * @param heroCount - Number of heroes, which scales monster rooms and the boss.
 * @returns The rooms, the last one holding the boss.
 */
export function generateRooms(seed: number, heroCount: number): Room[] {
  const random = seeded(mix(seed, 0))
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
    } else {
      const count = randomInt(random, 1, Math.min(3, heroCount))
      const monsters = Array.from({ length: count }, () => spec(pick(random, COMMON_MONSTERS)))
      rooms.push({ kind: 'monsters', monsters })
    }
  }
  const boss = spec(BOSS)
  rooms.push({ kind: 'monsters', monsters: [{ ...boss, hp: boss.hp * heroCount }] })
  return rooms
}

/**
 * Reads the stats of a monster from the game content at draw time.
 *
 * @param kind - Kind of monster.
 * @returns Its stats.
 */
const spec = (kind: MonsterKind): MonsterSpec => ({
  kind,
  hp: MONSTERS[kind].hp,
  attack: MONSTERS[kind].attack,
})

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
 * Picks a monster's target: the standing hero with the fewest hit points, the
 * first in hero order on a tie. Fixed rule, replaced by an AI in TD7.
 *
 * @param _monster - Monster choosing its target.
 * @param heroes - Standing heroes.
 * @returns The targeted hero.
 */
export function chooseMonsterTarget(_monster: Monster, heroes: Hero[]): Hero {
  return heroes.reduce((weakest, hero) => (hero.hp < weakest.hp ? hero : weakest))
}

/**
 * Resolves the current round. The derived seed `mix(seed, 1, round)` only depends
 * on the round, so resolution always gives the same result whenever it is computed.
 *
 * @param state - Expedition state, in combat.
 * @param at - Time of the resolution, in milliseconds.
 * @returns The `RoundResolved` event, followed by `GameEnded` when the expedition ends.
 */
export function resolveRound(state: GameState, at: number): GameEvent[] {
  const random = seeded(mix(state.seed, 1, state.round))

  const actions: Record<string, Action> = {}
  for (const hero of standingHeroes(state)) {
    actions[hero.id] = state.choices[hero.id] ?? { type: 'defend' }
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

  for (const [heroId, action] of Object.entries(actions)) {
    if (action.type !== 'heal' || !isStanding(action.target)) continue
    record({ kind: 'heal', source: heroId, target: action.target, amount: HEAL_AMOUNT })
  }

  for (const [heroId, action] of Object.entries(actions)) {
    if (action.type !== 'attack') continue
    const target = isStanding(action.target)
      ? action.target
      : monsters.find((monster) => monster.hp > 0)?.id
    if (!target) break
    const attack = heroes.find((hero) => hero.id === heroId)?.attack ?? 0
    const amount = rollDamage(random, attack, DAMAGE_SPREAD.hero)
    record({ kind: 'damage', source: heroId, target, amount })
  }

  for (const monster of monsters) {
    const targets = heroes.filter((hero) => hero.hp > 0)
    if (monster.hp <= 0 || targets.length === 0) continue
    const target = chooseMonsterTarget(monster, targets)
    let amount = rollDamage(random, monster.attack, DAMAGE_SPREAD.monster)
    if (actions[target.id]?.type === 'defend') amount = Math.ceil(amount / 2)
    record({ kind: 'damage', source: monster.id, target: target.id, amount })
  }

  const heroesLeft = heroes.some((hero) => hero.hp > 0)
  const monstersLeft = monsters.some((monster) => monster.hp > 0)
  const combatGoesOn = heroesLeft && monstersLeft
  const events: GameEvent[] = [
    {
      type: 'RoundResolved',
      data: {
        round: state.round,
        actions,
        effects,
        nextDeadline: combatGoesOn ? at + ROUND_MS : null,
        at,
      },
    },
  ]
  const lastRoom = state.room === DUNGEON_LENGTH - 1
  if (!heroesLeft || (!monstersLeft && lastRoom)) {
    const result = heroesLeft ? 'won' : 'lost'
    const heroIds = state.heroes.map((hero) => hero.id)
    events.push({ type: 'GameEnded', data: { result, loot: state.loot, heroIds, at } })
  }
  return events
}

/**
 * Lazy deadlines: resolves every round whose deadline has passed. Each overdue
 * round is resolved at its own deadline, not at `now`, so the result does not
 * depend on when it is computed.
 *
 * @param state - Expedition state.
 * @param now - Current time in milliseconds.
 * @returns The events resolving the overdue rounds; empty if none is due.
 */
export function settle(state: GameState, now: number): GameEvent[] {
  const events: GameEvent[] = []
  let current = state
  while (current.phase === 'combat' && current.deadline !== null && current.deadline <= now) {
    const resolution = resolveRound(current, current.deadline)
    events.push(...resolution)
    current = resolution.reduce(evolve, current)
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
 * Tells whether a player takes part in the expedition.
 *
 * @param state - Expedition state.
 * @param playerId - Player identifier.
 * @returns True if the player has a hero.
 */
const isMember = (state: GameState, playerId: string) =>
  state.heroes.some((hero) => hero.id === playerId)

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
    const { playerId, name, seed } = command
    return {
      ok: true,
      events: [
        {
          type: 'GameCreated',
          data: { hostId: playerId, hostName: name, hero: { ...HERO }, seed, at: now },
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
            data: { playerId: command.playerId, name: command.name, hero: { ...HERO }, at: now },
          },
        ],
      }

    case 'StartGame':
      if (state.phase !== 'lobby') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (command.playerId !== state.hostId) return fail({ code: 'NOT_HOST' })
      return {
        ok: true,
        events: [
          {
            type: 'GameStarted',
            data: { rooms: generateRooms(state.seed, state.heroes.length), at: now },
          },
        ],
      }

    case 'OpenDoor': {
      // DETTE TECHNIQUE DT-006 (docs/qualite/dette-technique.md): exploration has no deadline;
      // a player absent on their turn blocks the whole expedition.
      if (state.phase !== 'exploring') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      if (!isMember(state, command.playerId)) return fail({ code: 'NOT_A_MEMBER' })
      if (state.heroes[state.turn].id !== command.playerId) return fail({ code: 'NOT_YOUR_TURN' })
      const room = state.room + 1
      const deadline = state.rooms[room].kind === 'monsters' ? now + ROUND_MS : null
      return {
        ok: true,
        events: [
          { type: 'RoomEntered', data: { heroId: command.playerId, room, deadline, at: now } },
        ],
      }
    }

    case 'SubmitAction': {
      if (state.phase !== 'combat') return fail({ code: 'WRONG_PHASE', phase: state.phase })
      const hero = state.heroes.find((candidate) => candidate.id === command.playerId)
      if (!hero) return fail({ code: 'NOT_A_MEMBER' })
      if (hero.hp <= 0) return fail({ code: 'HERO_DOWN' })
      if (command.round !== state.round) return fail({ code: 'ROUND_OVER', round: state.round })
      if (state.choices[hero.id]) return fail({ code: 'ALREADY_CHOSEN' })
      if (!isValidTarget(state, command.action)) return fail({ code: 'INVALID_TARGET' })

      const submitted: GameEvent = {
        type: 'ActionSubmitted',
        data: { heroId: hero.id, round: state.round, action: command.action, at: now },
      }
      const after = evolve(state, submitted)
      const everyoneReady = standingHeroes(after).every((h) => after.choices[h.id] !== undefined)
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
 * @returns True if the target is valid, always true for a defense.
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
