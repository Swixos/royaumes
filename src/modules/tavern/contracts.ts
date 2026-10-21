/**
 * Shared public entry of the tavern module, usable by both the server and the
 * interface.
 *
 * @packageDocumentation
 */
import { z } from 'zod'
import { MESSAGE_MAX_LENGTH } from './domain/message'

export type { MessageError } from './domain/message'
export { MESSAGE_MAX_LENGTH } from './domain/message'

/** Tavern message, as players receive it. */
export interface TavernMessage {
  /** Increasing identifier: it orders messages, and serves as position on the real-time channel. */
  id: number
  /** Identifier of the author. */
  authorId: string
  /** Name of the author when posting. */
  authorName: string
  /** Text of the message. */
  body: string
  /** Posting time in milliseconds. */
  postedAt: number
}

/** Expected body to post a message. The exact length is checked by the domain. */
export const PostMessageInput = z.object({
  body: z.string().max(MESSAGE_MAX_LENGTH * 4),
})

/** Name of the real-time channel of the tavern. */
export const TAVERN_CHANNEL = 'tavern'

/** Type under which a new message is announced on the channel. */
export const MESSAGE_POSTED = 'MessagePosted'
