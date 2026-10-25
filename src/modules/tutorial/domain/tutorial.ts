/**
 * Tutorial of a player, an aggregate of the log: when it started, whether its guide is
 * paused, and the rewards already claimed. The quests are given one after the other: only
 * the first quest whose reward is not claimed can be claimed.
 *
 * @packageDocumentation
 */
import {
  type Amounts,
  CHAPTERS,
  type GoalProgress,
  goalProgress,
  type Progress,
  QUESTS,
  questOf,
} from './quests'

/** Events of a tutorial. */
export type TutorialEvent =
  | { type: 'TutorialStarted'; data: { at: number } }
  | { type: 'TutorialPaused'; data: { at: number } }
  | { type: 'TutorialResumed'; data: { at: number } }
  | {
      type: 'QuestRewarded'
      data: { questId: string; reward: Amounts; transferId: string; at: number }
    }

/** Requests of a player on their tutorial. */
export type TutorialCommand =
  | { type: 'StartTutorial' }
  | { type: 'PauseTutorial' }
  | { type: 'ResumeTutorial' }
  | { type: 'ClaimReward'; questId: string; transferId: string; progress: Progress }

/** Business reasons for refusing a command. */
export type TutorialError =
  | { code: 'UNKNOWN_QUEST' }
  | { code: 'QUEST_LOCKED' }
  | { code: 'ALREADY_CLAIMED' }
  | { code: 'QUEST_NOT_DONE' }

/** State of a tutorial. */
export interface TutorialState {
  /** True once the player started the tutorial. */
  started: boolean
  /** True while the guide is paused: the quests go on, the hints are hidden. */
  paused: boolean
  /** Quests whose reward was claimed. */
  claimed: string[]
}

/** Tutorial of a player who never opened it. */
export const initialState: TutorialState = { started: false, paused: false, claimed: [] }

/** Outcome of {@link decide}: the events to record, or the refusal. */
export type Decision = { ok: true; events: TutorialEvent[] } | { ok: false; error: TutorialError }

/**
 * Applies an event to a tutorial.
 *
 * @param state - Current state.
 * @param event - Event to apply.
 * @returns The new state; the given state is never modified.
 */
export function evolve(state: TutorialState, event: TutorialEvent): TutorialState {
  switch (event.type) {
    case 'TutorialStarted':
      return { ...state, started: true, paused: false }
    case 'TutorialPaused':
      return { ...state, paused: true }
    case 'TutorialResumed':
      return { ...state, started: true, paused: false }
    case 'QuestRewarded':
      return { ...state, started: true, claimed: [...state.claimed, event.data.questId] }
  }
}

/**
 * Rebuilds a tutorial from its events.
 *
 * @param events - Events of the tutorial, in order.
 * @returns The current state.
 */
export const replay = (events: TutorialEvent[]) => events.reduce(evolve, initialState)

/**
 * Finds the quest given to the player: the first one whose reward is not claimed.
 *
 * @param state - State of the tutorial.
 * @returns The quest, or undefined once every reward is claimed.
 */
export const currentQuest = (state: TutorialState) =>
  QUESTS.find((quest) => !state.claimed.includes(quest.id))

/**
 * Decides whether a command is accepted. Starting, pausing or resuming twice records
 * nothing. A reward is paid once, for the quest given to the player, once its goal is
 * reached.
 *
 * @param state - Current state.
 * @param command - Command to decide on.
 * @param now - Current time in milliseconds.
 * @returns The events to record, or the refusal.
 */
export function decide(state: TutorialState, command: TutorialCommand, now: number): Decision {
  switch (command.type) {
    case 'StartTutorial':
      return {
        ok: true,
        events: state.started ? [] : [{ type: 'TutorialStarted', data: { at: now } }],
      }
    case 'PauseTutorial':
      return {
        ok: true,
        events: state.paused ? [] : [{ type: 'TutorialPaused', data: { at: now } }],
      }
    case 'ResumeTutorial':
      return {
        ok: true,
        events:
          state.started && !state.paused ? [] : [{ type: 'TutorialResumed', data: { at: now } }],
      }
    case 'ClaimReward': {
      const quest = questOf(command.questId)
      if (!quest) return { ok: false, error: { code: 'UNKNOWN_QUEST' } }
      if (state.claimed.includes(quest.id)) return { ok: false, error: { code: 'ALREADY_CLAIMED' } }
      if (currentQuest(state)?.id !== quest.id)
        return { ok: false, error: { code: 'QUEST_LOCKED' } }
      if (!goalProgress(quest.goal, command.progress, now).done) {
        return { ok: false, error: { code: 'QUEST_NOT_DONE' } }
      }
      return {
        ok: true,
        events: [
          {
            type: 'QuestRewarded',
            data: {
              questId: quest.id,
              reward: quest.reward,
              transferId: command.transferId,
              at: now,
            },
          },
        ],
      }
    }
  }
}

/** Status of a quest for the player. */
export type QuestStatus = 'claimed' | 'ready' | 'active' | 'locked'

/** Quest as shown to the player. */
export interface QuestView {
  id: string
  chapter: string
  title: string
  advice: string
  task: string
  reward: Amounts
  /** `claimed`, `ready` to claim, `active` for the quest under way, `locked` after it. */
  status: QuestStatus
  /** Progress on its goal. */
  progress: GoalProgress
  /** Building of the goal, if the goal is a building. */
  building: string | null
}

/** Tutorial as shown to the player. */
export interface TutorialView {
  started: boolean
  paused: boolean
  /** Identifier of the quest given to the player, or null once the tutorial is over. */
  current: string | null
  /** Number of rewards claimed. */
  claimed: number
  chapters: typeof CHAPTERS
  quests: QuestView[]
}

/**
 * Builds the view of a tutorial.
 *
 * @param state - State of the tutorial.
 * @param progress - What the player achieved.
 * @param now - Current time in milliseconds.
 * @returns The view.
 */
export function viewOf(state: TutorialState, progress: Progress, now: number): TutorialView {
  const current = currentQuest(state)
  return {
    started: state.started,
    paused: state.paused,
    current: current?.id ?? null,
    claimed: state.claimed.length,
    chapters: CHAPTERS,
    quests: QUESTS.map((quest) => {
      const reached = goalProgress(quest.goal, progress, now)
      const status: QuestStatus = state.claimed.includes(quest.id)
        ? 'claimed'
        : quest === current
          ? reached.done
            ? 'ready'
            : 'active'
          : 'locked'
      return {
        id: quest.id,
        chapter: quest.chapter,
        title: quest.title,
        advice: quest.advice,
        task: quest.task,
        reward: quest.reward,
        status,
        progress: reached,
        building: quest.goal.kind === 'building' ? quest.goal.building : null,
      }
    }),
  }
}
