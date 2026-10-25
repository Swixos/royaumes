/**
 * Shared public entry of the tutorial module, usable by both the server and the
 * interface.
 *
 * @packageDocumentation
 */

export type { Amounts, Chapter, Deed, GoalProgress, Progress, Quest } from './domain/quests'
export { CHAPTERS, QUESTS } from './domain/quests'
export type {
  QuestStatus,
  QuestView,
  TutorialError,
  TutorialView,
} from './domain/tutorial'

/** Prefix of the streams holding the tutorial of each player. */
export const TUTORIAL_STREAM_PREFIX = 'tutorial-'

/**
 * Builds the name of the stream holding the tutorial of a player.
 *
 * @param playerId - Player identifier.
 * @returns The stream name.
 */
export const tutorialStream = (playerId: string) => `${TUTORIAL_STREAM_PREFIX}${playerId}`
