/**
 * State and events of an expedition, and the `evolve` function. The game rules
 * (`decide`) live in `rules.ts`, and each player's view in `view.ts`.
 *
 * @packageDocumentation
 */
import {
  CLASSES,
  DEFAULT_DIFFICULTY,
  type Difficulty,
  HEAL_AMOUNT,
  type HeroClass,
  type MonsterKind,
  SKILL_COOLDOWN,
  type Skill,
} from './content'

/** Phase of an expedition. */
export type Phase = 'lobby' | 'exploring' | 'combat' | 'won' | 'lost'

/** Content of a room, drawn when the expedition starts. */
export type Room =
  | { kind: 'empty' }
  | { kind: 'treasure'; gold: number }
  | { kind: 'shrine'; heal: number }
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
  /** Identifier of the player playing the hero, or of the companion. */
  id: string
  /** Display name. */
  name: string
  /** Current hit points. */
  hp: number
  /** Maximum hit points. */
  maxHp: number
  /** Attack value. */
  attack: number
  /** Whether the hero is a companion driven by the game rather than a player. */
  companion: boolean
  /** Class of the hero; null for a hero recorded before the classes existed. */
  heroClass: HeroClass | null
  /** Hit points restored by a heal. */
  heal: number
  /** Chance of a critical hit, from 0 to 1. */
  critical: number
  /** Signature skill; null for a hero without class. */
  skill: Skill | null
}

/** Starting stats of a hero, recorded when they join the expedition. */
export interface HeroSpec {
  /** Starting hit points. */
  hp: number
  /** Attack value. */
  attack: number
  /** Class of the hero; missing from events recorded before the classes existed. */
  heroClass?: HeroClass
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
  | { type: 'skill' }

/** Effect produced when a round is resolved. */
export type Effect =
  | {
      kind: 'damage'
      source: string
      target: string
      amount: number
      /** True for a critical hit, which doubled the damage. */
      critical?: boolean
      /** Skill dealing the damage, if any. */
      skill?: Skill
    }
  | {
      kind: 'heal'
      source: string
      target: string
      amount: number
      /** Skill giving the heal, if any. */
      skill?: Skill
    }

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
  /** Deadline of the current round or exploration turn, in milliseconds; `null` when none applies. */
  deadline: number | null
  /** Actions already chosen for the current round, by hero identifier. */
  choices: Record<string, Action>
  /** Outcome of the last resolved round, shown to players. */
  lastRound: { round: number; actions: Record<string, Action>; effects: Effect[] } | null
  /** Gold picked up from treasures. */
  loot: number
  /** Round each hero last used their skill in, by hero identifier. */
  skillRounds: Record<string, number>
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
  skillRounds: {},
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
  | {
      type: 'CompanionAdded'
      data: { companionId: string; name: string; hero: HeroSpec; at: number }
    }
  | {
      type: 'GameStarted'
      data: {
        rooms: Room[]
        /** Deadline of the first exploration turn; missing from older events. */
        deadline?: number
        at: number
      }
    }
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
        /** Deadline to open the next door once the combat is won; missing from older events. */
        exploreDeadline?: number | null
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
 * Lists the standing heroes played by a player, leaving companions out.
 *
 * @param state - Expedition state.
 * @returns Standing heroes that are not companions.
 */
export const standingPlayerHeroes = (state: GameState) =>
  state.heroes.filter((hero) => hero.hp > 0 && !hero.companion)

/**
 * Rounds a hero still waits before using their skill again.
 *
 * @param state - Expedition state.
 * @param hero - Hero to check.
 * @returns 0 when the skill is ready, the rounds left otherwise; null for a hero without skill.
 */
export function skillWait(state: GameState, hero: Hero): number | null {
  if (!hero.skill) return null
  const last = state.skillRounds[hero.id]
  return last === undefined ? 0 : Math.max(0, SKILL_COOLDOWN - (state.round - last))
}

/**
 * Finds the next explorer after an index, wrapping around if needed: a standing hero
 * played by a player. Companions never take an exploration turn.
 *
 * @param heroes - Heroes of the expedition.
 * @param from - Index to start after.
 * @returns Index of the next explorer, or `from` if there is none.
 */
export function nextExplorer(heroes: Hero[], from: number): number {
  for (let step = 1; step <= heroes.length; step++) {
    const index = (from + step) % heroes.length
    if (heroes[index].hp > 0 && !heroes[index].companion) return index
  }
  return from
}

/**
 * Creates a hero from the stats recorded in the event.
 *
 * @param id - Player identifier.
 * @param name - Display name.
 * @param spec - Starting stats.
 * @param companion - Whether the hero is a companion driven by the game.
 * @returns The hero, at full health.
 */
const newHero = (id: string, name: string, spec: HeroSpec, companion = false): Hero => {
  const kind = spec.heroClass ? CLASSES[spec.heroClass] : null
  return {
    id,
    name,
    hp: spec.hp,
    maxHp: spec.hp,
    attack: spec.attack,
    companion,
    heroClass: spec.heroClass ?? null,
    heal: kind?.heal ?? HEAL_AMOUNT,
    critical: kind?.critical ?? 0,
    skill: kind?.skill ?? null,
  }
}

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
    case 'CompanionAdded': {
      const { companionId, name, hero } = event.data
      return { ...state, heroes: [...state.heroes, newHero(companionId, name, hero, true)] }
    }

    case 'GameStarted':
      return {
        ...state,
        phase: 'exploring',
        rooms: event.data.rooms,
        turn: 0,
        deadline: event.data.deadline ?? null,
      }

    case 'RoomEntered': {
      const room = state.rooms[event.data.room]
      const turn = nextExplorer(state.heroes, state.turn)
      const deadline = event.data.deadline
      if (room.kind === 'treasure') {
        return { ...state, room: event.data.room, turn, deadline, loot: state.loot + room.gold }
      }
      if (room.kind === 'shrine') {
        const heroes = state.heroes.map((hero) =>
          hero.hp > 0 ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + room.heal) } : hero,
        )
        return { ...state, heroes, room: event.data.room, turn, deadline }
      }
      if (room.kind === 'monsters') {
        return {
          ...state,
          room: event.data.room,
          turn,
          phase: 'combat',
          monsters: spawn(room.monsters),
          round: state.round + 1,
          deadline,
          choices: {},
          lastRound: null,
        }
      }
      return { ...state, room: event.data.room, turn, deadline }
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
      const skillRounds = { ...state.skillRounds }
      for (const [heroId, action] of Object.entries(event.data.actions)) {
        if (action.type === 'skill') skillRounds[heroId] = event.data.round
      }
      return {
        ...state,
        skillRounds,
        heroes,
        monsters,
        lastRound,
        choices: {},
        phase: combatOver ? 'exploring' : 'combat',
        round: combatOver ? state.round : state.round + 1,
        deadline: combatOver ? (event.data.exploreDeadline ?? null) : event.data.nextDeadline,
        turn: heroes[state.turn]?.hp > 0 ? state.turn : nextExplorer(heroes, state.turn),
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
