import {
  type DomainError,
  decide,
  toView,
  type VillageCommand,
  type VillageView,
} from '../domain/village'
import type { VillageRepository } from './village-repository'

/** Result of a command: the updated view, or the domain error. */
export type CommandResult = { ok: true; view: VillageView } | { ok: false; error: DomainError }

/**
 * Village application service, orchestrating the domain and persistence.
 *
 * @param repo - Persistence port.
 * @param clock - Returns the current time in milliseconds; real time by default.
 * @returns The `execute` command handler and the `getView` query.
 */
export function createVillageService(repo: VillageRepository, clock = () => Date.now()) {
  /**
   * Handles a command: load, decide, save, then return the view.
   *
   * @param userId - Player issuing the command.
   * @param command - Command to apply.
   * @returns The updated view, or the domain error if the command is refused.
   */
  async function execute(userId: string, command: VillageCommand): Promise<CommandResult> {
    const { state, version } = await repo.load(userId)

    const now = clock()

    const decision = decide(state, command, now)
    if (!decision.ok) return decision

    // DETTE TECHNIQUE DT-003 (docs/qualite/dette-technique.md): a version conflict
    // throws an unhandled error; it will be retried in TD3.
    await repo.save(userId, version, decision.events)

    const updated = await repo.load(userId)
    return { ok: true, view: toView(updated.state, now) }
  }

  /**
   * Reads a player's village.
   *
   * @param userId - Player identifier.
   * @returns The village view, or `null` if no village was founded yet.
   */
  async function getView(userId: string): Promise<VillageView | null> {
    const { state } = await repo.load(userId)
    return state.founded ? toView(state, clock()) : null
  }

  return { execute, getView }
}

/** Service type inferred from its factory, used by the module API. */
export type VillageService = ReturnType<typeof createVillageService>
