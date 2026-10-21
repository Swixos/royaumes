import { withOptimisticRetry } from '@/platform/event-store/retry'
import { DEFAULT_DIFFICULTY, type Difficulty, MAX_HEROES } from '../domain/content'
import { decide, type GameCommand, type GameError } from '../domain/rules'
import { type GameView, toView } from '../domain/view'
import type { GameRepository } from './game-repository'
import type { OpenGamesReader } from './open-games-reader'

/** Result of a command: the updated view for the player, or the domain error. */
export type CommandResult = { ok: true; view: GameView } | { ok: false; error: GameError }

/**
 * Maximum number of attempts of a command. Every hero may act at the same time
 * and, in the worst case, each attempt only satisfies one of them: at least as
 * many attempts as heroes are needed, plus one for the deadline command.
 */
const MAX_ATTEMPTS = MAX_HEROES + 1

/** Options of the dungeon service. */
export interface DungeonServiceOptions {
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
  /** Identifier of a new expedition; a random UUID by default. */
  newId?: () => string
  /** Seed of a new expedition; a random 32-bit integer by default. */
  newSeed?: () => number
}

/**
 * Dungeon application service, orchestrating the domain and persistence. The
 * expedition identifier and seed are drawn by the server, never taken from the
 * request: a player choosing the seed could choose the dungeon content.
 *
 * @param repo - Persistence port, serving the commands.
 * @param openGames - Read port of the open expeditions.
 * @param options - Clock, identifier and seed generators; replaced in tests.
 * @returns The `execute`, `create`, `getView` and `listOpenGames` operations.
 */
export function createDungeonService(
  repo: GameRepository,
  openGames: OpenGamesReader,
  {
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0],
  }: DungeonServiceOptions = {},
) {
  /**
   * Handles a command on an expedition: load, decide, save, then return the
   * viewer's filtered view. On a write conflict, the whole handling is replayed
   * on the fresh state.
   *
   * @param gameId - Expedition identifier.
   * @param viewerId - Player receiving the view.
   * @param command - Command to apply.
   * @returns The updated view, or the domain error if the command is refused.
   */
  function execute(gameId: string, viewerId: string, command: GameCommand) {
    return withOptimisticRetry(async (): Promise<CommandResult> => {
      const { state, version } = await repo.load(gameId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok) return decision
      await repo.save(gameId, version, decision.events)
      const updated = await repo.load(gameId)
      const view = toView(updated.state, viewerId, now)
      return view ? { ok: true, view } : { ok: false, error: { code: 'GAME_NOT_FOUND' } }
    }, MAX_ATTEMPTS)
  }

  /**
   * Opens a new expedition hosted by the player.
   *
   * @param player - Signed-in player, becoming the host.
   * @param player.id - Player identifier.
   * @param player.name - Player name.
   * @param difficulty - Difficulty level; easy by default.
   * @returns The new expedition identifier and the command result.
   */
  async function create(
    player: { id: string; name: string },
    difficulty: Difficulty = DEFAULT_DIFFICULTY,
  ) {
    const gameId = newId()
    const result = await execute(gameId, player.id, {
      type: 'CreateGame',
      playerId: player.id,
      name: player.name,
      difficulty,
      seed: newSeed(),
    })
    return { gameId, result }
  }

  /**
   * Reads an expedition for a player.
   *
   * @param gameId - Expedition identifier.
   * @param viewerId - Player reading the view.
   * @returns The filtered view, or `null` if the expedition does not exist.
   */
  async function getView(gameId: string, viewerId: string): Promise<GameView | null> {
    const { state } = await repo.load(gameId)
    return toView(state, viewerId, clock())
  }

  /**
   * Lists the expeditions that can still be joined.
   *
   * @returns The open expeditions, most recent first.
   */
  function listOpenGames() {
    return openGames.list(clock())
  }

  return { execute, create, getView, listOpenGames }
}

/** Service type inferred from its factory, used by the module API. */
export type DungeonService = ReturnType<typeof createDungeonService>
