import type { TavernMessage } from '../contracts'

/** Message to record: its identifier is assigned by the storage. */
export type NewTavernMessage = Omit<TavernMessage, 'id'>

/**
 * Persistence port of the messages, owned by the application layer. It is not based on
 * events: messages are inserted, read, then deleted.
 */
export interface MessageRepository {
  /**
   * Records a message.
   *
   * @param message - Message to record.
   * @returns The message, with its identifier.
   */
  add(message: NewTavernMessage): Promise<TavernMessage>
  /**
   * Reads the latest messages.
   *
   * @param limit - Maximum number of messages.
   * @returns The messages, oldest first.
   */
  latest(limit: number): Promise<TavernMessage[]>
  /**
   * Reads the messages after an identifier.
   *
   * @param id - Identifier to read after.
   * @param limit - Maximum number of messages.
   * @returns The messages, oldest first.
   */
  after(id: number, limit: number): Promise<TavernMessage[]>
  /**
   * Reads the identifier of the last message.
   *
   * @returns The identifier; 0 if there is no message.
   */
  lastId(): Promise<number>
  /**
   * Lists the posting times of an author's messages since a given time.
   *
   * @param authorId - Identifier of the author.
   * @param since - Start time in milliseconds.
   * @returns The posting times.
   */
  postedSince(authorId: string, since: number): Promise<number[]>
  /**
   * Deletes the messages posted before a given time.
   *
   * @param before - Expiry threshold in milliseconds.
   * @returns The number of deleted messages.
   */
  removeOlderThan(before: number): Promise<number>
}
