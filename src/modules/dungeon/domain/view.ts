/**
 * Filtered view of an expedition: what a given player is allowed to know. The
 * API never returns the full state, only this view.
 *
 * @packageDocumentation
 */
import { type Difficulty, DUNGEON_LENGTH } from './content'
import { type Action, evolve, type GameState, type Monster, type Phase, type Room } from './game'
import { settle } from './rules'

/** A hero as seen by a player. */
export interface HeroView {
  /** Identifier of the player playing the hero. */
  id: string
  /** Display name. */
  name: string
  /** Current hit points. */
  hp: number
  /** Maximum hit points. */
  maxHp: number
  /** True if the hero is a companion driven by the game. */
  companion: boolean
  /** True if the hero has chosen an action for the current round; always true for a companion in combat. */
  ready: boolean
  /** Chosen action: only known to the hero's own player, `null` for the others. */
  action: Action | null
}

/** An expedition as seen by a player. */
export interface GameView {
  /** Current phase. */
  phase: Phase
  /** Difficulty level, chosen by the host; not secret. */
  difficulty: Difficulty
  /** Player who opened the expedition. */
  hostId: string
  /** True if the viewer is the host. */
  isHost: boolean
  /** True if the viewer plays a hero of the expedition. */
  isMember: boolean
  /** Heroes, filtered for the viewer. */
  heroes: HeroView[]
  /** Hero who opens the next door; `null` outside exploration. */
  turnHeroId: string | null
  /** Index of the current room; -1 before the first door. */
  room: number
  /** Total number of rooms. */
  roomCount: number
  /** Content of the current room; the next rooms are never sent. */
  currentRoom: Room | null
  /** Monsters of the current room. */
  monsters: Monster[]
  /** Number of the current round. */
  round: number
  /** Deadline of the current round, in milliseconds; `null` outside combat. */
  deadline: number | null
  /** Outcome of the last resolved round. */
  lastRound: GameState['lastRound']
  /** Gold picked up so far. */
  loot: number
}

/**
 * Computes the view of an expedition for a player. Overdue rounds are resolved
 * in the view, but nothing is recorded: a read never writes.
 *
 * @param state - Expedition state.
 * @param viewerId - Player reading the view.
 * @param now - Current time in milliseconds.
 * @returns The filtered view, or `null` if the expedition does not exist.
 */
export function toView(state: GameState, viewerId: string, now: number): GameView | null {
  if (!state.exists) return null
  const current = settle(state, now).reduce(evolve, state)
  const inCombat = current.phase === 'combat'

  return {
    phase: current.phase,
    difficulty: current.difficulty,
    hostId: current.hostId,
    isHost: current.hostId === viewerId,
    isMember: current.heroes.some((hero) => hero.id === viewerId && !hero.companion),
    heroes: current.heroes.map((hero) => ({
      id: hero.id,
      name: hero.name,
      hp: hero.hp,
      maxHp: hero.maxHp,
      companion: hero.companion,
      ready: inCombat && (hero.companion || current.choices[hero.id] !== undefined),
      action: hero.id === viewerId ? (current.choices[hero.id] ?? null) : null,
    })),
    turnHeroId: current.phase === 'exploring' ? current.heroes[current.turn].id : null,
    room: current.room,
    roomCount: DUNGEON_LENGTH,
    currentRoom: current.room >= 0 ? current.rooms[current.room] : null,
    monsters: current.monsters,
    round: current.round,
    deadline: current.deadline,
    lastRound: current.lastRound,
    loot: current.loot,
  }
}
