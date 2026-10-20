/**
 * List of open expeditions, computed from the events of every expedition: a
 * read view spanning several streams at once, not a single one.
 *
 * @packageDocumentation
 */
import { MAX_HEROES, OPEN_GAME_MS } from './content'
import type { GameEvent } from './game'

/** Expedition that can still be joined. */
export interface OpenGame {
  /** Expedition identifier. */
  gameId: string
  /** Name of the host. */
  hostName: string
  /** Number of heroes who joined. */
  heroCount: number
  /** Creation time in milliseconds. */
  createdAt: number
}

/** Event with the identifier of the expedition it comes from. */
export interface GameEventOf {
  /** Expedition identifier. */
  gameId: string
  /** Domain event. */
  event: GameEvent
}

/**
 * Walks the events of every expedition in recording order and keeps those
 * neither started, nor full, nor too old.
 *
 * @param events - Events of every expedition, in global order.
 * @param now - Current time in milliseconds.
 * @returns The open expeditions, most recent first.
 */
export function openGames(events: GameEventOf[], now: number): OpenGame[] {
  const games = new Map<string, OpenGame & { started: boolean }>()
  for (const { gameId, event } of events) {
    const game = games.get(gameId)
    switch (event.type) {
      case 'GameCreated':
        games.set(gameId, {
          gameId,
          hostName: event.data.hostName,
          heroCount: 1,
          createdAt: event.data.at,
          started: false,
        })
        break
      case 'PlayerJoined':
        if (game) game.heroCount++
        break
      case 'GameStarted':
        if (game) game.started = true
        break
    }
  }
  return [...games.values()]
    .filter((game) => !game.started && game.heroCount < MAX_HEROES)
    .filter((game) => now - game.createdAt < OPEN_GAME_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ gameId, hostName, heroCount, createdAt }) => ({
      gameId,
      hostName,
      heroCount,
      createdAt,
    }))
}
