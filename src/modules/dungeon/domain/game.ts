/**
 * State and events of an expedition, and the `evolve` function. The game rules
 * (`decide`) live in `rules.ts`, and each player's view in `view.ts`.
 *
 * @packageDocumentation
 */
import { DEFAULT_DIFFICULTY, type Difficulty, type MonsterKind } from './content'

/** Phase of an expedition. */
export type Phase = 'lobby' | 'exploring' | 'combat' | 'won' | 'lost'

/** Content of a room, drawn when the expedition starts. */
export type Room =
  | { kind: 'empty' }
  | { kind: 'treasure'; gold: number }
  | { kind: 'monsters'; monsters: MonsterSpec[] }

/** Stats of a monster, fixed when the rooms are drawn. */
export interface MonsterSpec {
  /** Kind of monster. */
  kind: MonsterKind
  /** Starting hit points. */
  hp: number
  /** Attack value. */
  attack: number
}

/** A hero taking part in the expedition. */
export interface Hero {
  /** Identifier of the player playing the hero. */
  id: string
  /** Display name. */
  name: string
  /** Current hit points. */
  hp: number
  /** Maximum hit points. */
  maxHp: number
  /** Attack value. */
  attack: number
}

/** Starting stats of a hero, recorded when they join the expedition. */
export interface HeroSpec {
  /** Starting hit points. */
  hp: number
  /** Attack value. */
  attack: number
}

/** A monster of the current room. */
export interface Monster {
  /** Identifier, unique within the room: "m0", "m1"... */
  id: string
  /** Kind of monster. */
  kind: MonsterKind
  /** Current hit points. */
  hp: number
  /** Maximum hit points. */
  maxHp: number
  /** Attack value. */
  attack: number
}

/** Action chosen by a hero for a combat round. */
export type Action =
  | { type: 'attack'; target: string }
  | { type: 'defend' }
  | { type: 'heal'; target: string }

/** Effect produced when a round is resolved. */
export type Effect =
  | { kind: 'damage'; source: string; target: string; amount: number }
  | { kind: 'heal'; source: string; target: string; amount: number }

/** State of an expedition, rebuilt from its events. */
export interface GameState {
  /** False until the expedition is opened. */
  exists: boolean
  /** Player who opened the expedition. */
  hostId: string
  /** Difficulty level, which sets the monster strategy. */
  difficulty: Difficulty
  /** Random seed of the expedition: secret, never sent to players. */
  seed: number
  /** Current phase. */
  phase: Phase
  /** Heroes, in joining order. */
  heroes: Hero[]
  /** Every room of the dungeon, including those not opened yet. */
  rooms: Room[]
  /** Index of the current room; -1 until a door is opened. */
  room: number
  /** Monsters of the current room, defeated ones included. */
  monsters: Monster[]
  /** Index, in `heroes`, of the hero who opens the next door. */
  turn: number
  /** Number of the current round; it never restarts at 1 from one room to the next. */
  round: number
  /** Deadline of the current round, in milliseconds; `null` outside combat. */
  deadline: number | null
  /** Actions already chosen for the current round, by hero identifier. */
  choices: Record<string, Action>
  /** Outcome of the last resolved round, shown to players. */
  lastRound: { round: number; actions: Record<string, Action>; effects: Effect[] } | null
  /** Gold picked up from treasures. */
  loot: number
}

/** State of an expedition before any event. */
export const initialState: GameState = {
  exists: false,
  hostId: '',
  difficulty: DEFAULT_DIFFICULTY,
  seed: 0,
  phase: 'lobby',
  heroes: [],
  rooms: [],
  room: -1,
  monsters: [],
  turn: 0,
  round: 0,
  deadline: null,
  choices: {},
  lastRound: null,
  loot: 0,
}

/** Facts recorded for an expedition. */
export type GameEvent =
  | {
      type: 'GameCreated'
      data: {
        hostId: string
        hostName: string
        hero: HeroSpec
        /** Optional: missing from events recorded before difficulty levels existed. */
        difficulty?: Difficulty
        seed: number
        at: number
      }
    }
  | { type: 'PlayerJoined'; data: { playerId: string; name: string; hero: HeroSpec; at: number } }
  | { type: 'GameStarted'; data: { rooms: Room[]; at: number } }
  | {
      type: 'RoomEntered'
      data: { heroId: string; room: number; deadline: number | null; at: number }
    }
  | { type: 'ActionSubmitted'; data: { heroId: string; round: number; action: Action; at: number } }
  | {
      type: 'RoundResolved'
      data: {
        round: number
        /** Actions of every standing hero, including the defense of heroes without a choice. */
        actions: Record<string, Action>
        /** Effects drawn at resolution, applied as is by `evolve`. */
        effects: Effect[]
        /** Deadline of the next round; `null` when the combat is over. */
        nextDeadline: number | null
        at: number
      }
    }
  | {
      type: 'GameEnded'
      data: { result: 'won' | 'lost'; loot: number; heroIds: string[]; at: number }
    }

/**
 * Lists the heroes still standing.
 *
 * @param state - Expedition state.
 * @returns Heroes with hit points left.
 */
export const standingHeroes = (state: GameState) => state.heroes.filter((hero) => hero.hp > 0)

/**
 * Lists the monsters still standing.
 *
 * @param state - Expedition state.
 * @returns Monsters with hit points left.
 */
export const standingMonsters = (state: GameState) =>
  state.monsters.filter((monster) => monster.hp > 0)

/**
 * Finds the next standing hero after an index, wrapping around if needed.
 *
 * @param heroes - Heroes of the expedition.
 * @param from - Index to start after.
 * @returns Index of the next standing hero, or `from` if none is standing.
 */
export function nextStandingHero(heroes: Hero[], from: number): number {
  for (let step = 1; step <= heroes.length; step++) {
    const index = (from + step) % heroes.length
    if (heroes[index].hp > 0) return index
  }
  return from
}

/**
 * Creates a hero from the stats recorded in the event.
 *
 * @param id - Player identifier.
 * @param name - Display name.
 * @param spec - Starting stats.
 * @returns The hero, at full health.
 */
const newHero = (id: string, name: string, spec: HeroSpec): Hero => ({
  id,
  name,
  hp: spec.hp,
  maxHp: spec.hp,
  attack: spec.attack,
})

/**
 * Creates the monsters of a room from the stats recorded in the rooms.
 *
 * @param specs - Monster stats of the room.
 * @returns The monsters, at full health, with identifiers "m0", "m1"...
 */
const spawn = (specs: MonsterSpec[]): Monster[] =>
  specs.map((spec, index) => ({
    id: `m${index}`,
    kind: spec.kind,
    hp: spec.hp,
    maxHp: spec.hp,
    attack: spec.attack,
  }))

/**
 * Applies an effect to fighters, never going below 0 nor above the maximum.
 *
 * @param fighters - Heroes or monsters.
 * @param effect - Damage or heal to apply.
 * @returns The fighters, with the target updated.
 */
export function applyEffect<T extends { id: string; hp: number; maxHp: number }>(
  fighters: T[],
  effect: Effect,
): T[] {
  return fighters.map((fighter) => {
    if (fighter.id !== effect.target) return fighter
    const change = effect.kind === 'damage' ? -effect.amount : effect.amount
    return { ...fighter, hp: Math.max(0, Math.min(fighter.maxHp, fighter.hp + change)) }
  })
}

/**
 * Applies an event to a state.
 *
 * @param state - Current expedition state.
 * @param event - Event to apply.
 * @returns The new state; the given state is never modified.
 */
export function evolve(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GameCreated':
      return {
        ...initialState,
        exists: true,
        hostId: event.data.hostId,
        difficulty: event.data.difficulty ?? DEFAULT_DIFFICULTY,
        seed: event.data.seed,
        heroes: [newHero(event.data.hostId, event.data.hostName, event.data.hero)],
      }

    case 'PlayerJoined':
      return {
        ...state,
        heroes: [...state.heroes, newHero(event.data.playerId, event.data.name, event.data.hero)],
      }

    case 'GameStarted':
      return { ...state, phase: 'exploring', rooms: event.data.rooms, turn: 0 }

    case 'RoomEntered': {
      const room = state.rooms[event.data.room]
      const turn = nextStandingHero(state.heroes, state.turn)
      if (room.kind === 'treasure') {
        return { ...state, room: event.data.room, turn, loot: state.loot + room.gold }
      }
      if (room.kind === 'monsters') {
        return {
          ...state,
          room: event.data.room,
          turn,
          phase: 'combat',
          monsters: spawn(room.monsters),
          round: state.round + 1,
          deadline: event.data.deadline,
          choices: {},
          lastRound: null,
        }
      }
      return { ...state, room: event.data.room, turn }
    }

    case 'ActionSubmitted':
      return { ...state, choices: { ...state.choices, [event.data.heroId]: event.data.action } }

    case 'RoundResolved': {
      let heroes = state.heroes
      let monsters = state.monsters
      for (const effect of event.data.effects) {
        heroes = applyEffect(heroes, effect)
        monsters = applyEffect(monsters, effect)
      }
      const lastRound = {
        round: event.data.round,
        actions: event.data.actions,
        effects: event.data.effects,
      }
      const combatOver = event.data.nextDeadline === null
      return {
        ...state,
        heroes,
        monsters,
        lastRound,
        choices: {},
        phase: combatOver ? 'exploring' : 'combat',
        round: combatOver ? state.round : state.round + 1,
        deadline: event.data.nextDeadline,
        turn: heroes[state.turn]?.hp > 0 ? state.turn : nextStandingHero(heroes, state.turn),
      }
    }

    case 'GameEnded':
      return { ...state, phase: event.data.result, deadline: null, choices: {} }
  }
}

/**
 * Rebuilds an expedition from its events.
 *
 * @param events - Events of the expedition, in order.
 * @returns The resulting state.
 */
export function replay(events: GameEvent[]): GameState {
  return events.reduce(evolve, initialState)
}
