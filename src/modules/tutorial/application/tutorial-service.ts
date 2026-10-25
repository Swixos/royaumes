import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { Amounts } from '../domain/quests'
import {
  decide,
  type TutorialCommand,
  type TutorialError,
  type TutorialView,
  viewOf,
} from '../domain/tutorial'
import type { ProgressReader, TutorialRepository } from './ports'

/** Options of the tutorial service. */
export interface TutorialServiceOptions {
  /** Outbox dispatch, run after a reward so it reaches the village at once. */
  dispatch: () => Promise<unknown>
  /** Reference clock in milliseconds; real time by default. */
  clock?: () => number
}

/** Outcome of a command: the new view of the tutorial, or the refusal. */
export type TutorialResult =
  | { ok: true; view: TutorialView; reward?: Amounts }
  | { ok: false; error: TutorialError }

/**
 * Creates the application service of the tutorial. A claimed reward is deposited in the
 * village of the player by a `realm.deposit` message, recorded with the event in the same
 * transaction: the reward is paid exactly once.
 *
 * @param repo - Storage of the tutorials.
 * @param reader - Progress of the players.
 * @param options - Outbox dispatch and optional clock.
 * @returns The `view`, `command` and `claim` functions.
 */
export function createTutorialService(
  repo: TutorialRepository,
  reader: ProgressReader,
  { dispatch, clock = () => Date.now() }: TutorialServiceOptions,
) {
  /**
   * Builds the view of the tutorial of a player.
   *
   * @param playerId - Player identifier.
   * @returns The view.
   */
  async function view(playerId: string): Promise<TutorialView> {
    const [{ state }, progress] = await Promise.all([
      repo.load(playerId),
      reader.progressOf(playerId),
    ])
    return viewOf(state, progress, clock())
  }

  /**
   * Runs a command on the tutorial of a player, retried on a write conflict.
   *
   * @param playerId - Player identifier.
   * @param build - Builds the command from the progress of the player.
   * @returns The new view, the reward paid if any, or the refusal.
   */
  async function run(
    playerId: string,
    build: (progress: Awaited<ReturnType<ProgressReader['progressOf']>>) => TutorialCommand,
  ): Promise<TutorialResult> {
    const outcome = await withOptimisticRetry(async () => {
      const [{ state, version }, progress] = await Promise.all([
        repo.load(playerId),
        reader.progressOf(playerId),
      ])
      const decision = decide(state, build(progress), clock())
      if (!decision.ok) return decision
      const messages = decision.events.flatMap((event) =>
        event.type === 'QuestRewarded'
          ? [
              {
                topic: REALM_TOPICS.deposit,
                payload: {
                  transferId: event.data.transferId,
                  playerId,
                  resources: event.data.reward,
                },
              },
            ]
          : [],
      )
      if (decision.events.length > 0) await repo.save(playerId, version, decision.events, messages)
      const paid = decision.events.find((event) => event.type === 'QuestRewarded')
      return {
        ok: true as const,
        reward: paid?.type === 'QuestRewarded' ? paid.data.reward : undefined,
      }
    })
    if (!outcome.ok) return outcome
    if (outcome.reward) await dispatch()
    return { ok: true, view: await view(playerId), reward: outcome.reward }
  }

  return {
    view,
    /**
     * Starts, pauses or resumes the guide of the tutorial.
     *
     * @param playerId - Player identifier.
     * @param type - Command to run.
     * @returns The new view.
     */
    command: (playerId: string, type: 'StartTutorial' | 'PauseTutorial' | 'ResumeTutorial') =>
      run(playerId, () => ({ type })),
    /**
     * Claims the reward of a quest.
     *
     * @param playerId - Player identifier.
     * @param questId - Quest whose reward is claimed.
     * @returns The new view and the reward, or the refusal.
     */
    claim: (playerId: string, questId: string) =>
      run(playerId, (progress) => ({
        type: 'ClaimReward',
        questId,
        transferId: `tutorial-${playerId}-${questId}`,
        progress,
      })),
  }
}

/** Tutorial application service. */
export type TutorialService = ReturnType<typeof createTutorialService>
