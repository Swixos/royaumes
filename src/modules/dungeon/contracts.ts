/**
 * Shared public entry of the dungeon module, usable by both the server and the
 * interface. It only holds types, constants, validation schemas and pure functions.
 *
 * @packageDocumentation
 */
import { z } from 'zod'

export type { MonsterKind } from './domain/content'
export { MAX_HEROES, MONSTERS, ROUND_MS } from './domain/content'
export type { Action, Effect, Monster, Phase, Room } from './domain/game'
export type { OpenGame } from './domain/lobby'
export type { GameError } from './domain/rules'
export type { GameView, HeroView } from './domain/view'

/** Expected body to choose an action: the targeted round and the action itself. */
export const SubmitActionInput = z.object({
  round: z.number().int().positive(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('attack'), target: z.string().min(1) }),
    z.object({ type: z.literal('defend') }),
    z.object({ type: z.literal('heal'), target: z.string().min(1) }),
  ]),
})

/** Prefix shared by the stream and channel names of every expedition. */
export const GAME_CHANNEL_PREFIX = 'dungeon-'

/**
 * Builds the name of the real-time channel of an expedition, equal to the name
 * of the event store stream holding its events.
 *
 * @param gameId - Expedition identifier.
 * @returns The channel name, `dungeon-<gameId>`.
 */
export const gameChannel = (gameId: string) => `${GAME_CHANNEL_PREFIX}${gameId}`
