/**
 * Simulation of expeditions, played entirely in memory by simulated players.
 * Since the domain is made of pure functions, a whole expedition is played in a
 * fraction of a millisecond: thousands of games measure the balance of the game.
 *
 * @packageDocumentation
 */
import type { Difficulty } from './content'
import {
  type Action,
  evolve,
  type GameState,
  type Hero,
  initialState,
  standingMonsters,
} from './game'
import { decide, type GameCommand } from './rules'

/** Behaviour of the simulated players: active, or absent for the whole expedition. */
export type PlayerBehaviour = 'active' | 'absent'

/** Composition and conditions of a simulated expedition. */
export interface SimulationSetup {
  /** Difficulty level of the expedition. */
  difficulty: Difficulty
  /** Number of players, host included. */
  players: number
  /** Number of companions added by the host. */
  companions: number
  /** Behaviour of the players. */
  behaviour: PlayerBehaviour
}

/**
 * Chooses the action of a simulated active player: they defend when in danger,
 * and otherwise attack the weakest monster. They never heal anyone.
 *
 * @param state - Expedition state, in combat.
 * @param hero - Hero of the player.
 * @returns The chosen action.
 */
function activeAction(state: GameState, hero: Hero): Action {
  if (hero.hp < hero.maxHp * 0.3) return { type: 'defend' }
  const target = standingMonsters(state).reduce((a, b) => (b.hp < a.hp ? b : a))
  return { type: 'attack', target: target.id }
}

/**
 * Plays a whole expedition with the given seed.
 *
 * @param setup - Composition and conditions of the expedition.
 * @param seed - Seed of the expedition.
 * @returns The outcome of the expedition.
 * @throws Error if the rules refuse a command of the simulated players.
 */
export function playExpedition(setup: SimulationSetup, seed: number): 'won' | 'lost' {
  let state = initialState
  let now = 0
  const run = (command: GameCommand) => {
    const decision = decide(state, command, now)
    if (!decision.ok) throw new Error(`Commande refusée : ${decision.error.code}`)
    state = decision.events.reduce(evolve, state)
  }

  const players = Array.from({ length: setup.players }, (_, i) => `player-${i + 1}`)
  run({
    type: 'CreateGame',
    playerId: players[0],
    name: players[0],
    difficulty: setup.difficulty,
    seed,
  })
  for (const id of players.slice(1)) run({ type: 'JoinGame', playerId: id, name: id })
  for (let i = 0; i < setup.companions; i++) run({ type: 'AddCompanion', playerId: players[0] })
  run({ type: 'StartGame', playerId: players[0] })

  while (state.phase !== 'won' && state.phase !== 'lost') {
    now += 1000
    if (setup.behaviour === 'absent') {
      now = Math.max(now, state.deadline ?? now)
      run({ type: 'CheckDeadline' })
    } else if (state.phase === 'exploring') {
      run({ type: 'OpenDoor', playerId: state.heroes[state.turn].id })
    } else {
      for (const hero of state.heroes) {
        if (state.phase !== 'combat') break
        if (hero.companion || hero.hp <= 0 || state.choices[hero.id]) continue
        run({
          type: 'SubmitAction',
          playerId: hero.id,
          round: state.round,
          action: activeAction(state, hero),
        })
      }
    }
  }
  return state.phase
}

/**
 * Measures the share of won expeditions over the seeds 1 to `count`.
 *
 * @param setup - Composition and conditions of the expeditions.
 * @param count - Number of expeditions to play.
 * @returns The share of won expeditions, as a rounded percentage.
 */
export function winRate(setup: SimulationSetup, count: number): number {
  let won = 0
  for (let seed = 1; seed <= count; seed++) {
    if (playExpedition(setup, seed) === 'won') won++
  }
  return Math.round((won / count) * 100)
}
