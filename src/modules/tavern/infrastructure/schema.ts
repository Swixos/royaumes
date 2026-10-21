import { bigint, bigserial, index, pgSchema, text } from 'drizzle-orm/pg-core'

/**
 * PostgreSQL schema of the tavern module. Unlike the other modules, the tavern records
 * no events: its tables are its only source of truth.
 */
export const tavern = pgSchema('tavern')

/**
 * Messages of the room, deleted when their retention period expires. The index on the
 * author serves the rate limit, which counts an author's recent messages, and erasure,
 * which deletes them all; the index on the posting time serves the retention period,
 * which deletes the oldest messages.
 */
export const messages = tavern.table(
  'messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    authorId: text('author_id').notNull(),
    /** Name of the author when posting; erased with the author's messages. */
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    postedAt: bigint('posted_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('messages_author_idx').on(t.authorId, t.postedAt),
    index('messages_posted_at_idx').on(t.postedAt),
  ],
)

/**
 * Present players: one row per player, updated on each presence signal, and deleted when
 * the player has left. No history of visits is kept.
 */
export const presence = tavern.table('presence', {
  playerId: text('player_id').primaryKey(),
  playerName: text('player_name').notNull(),
  /** Time of the last presence signal, in milliseconds. */
  lastSeen: bigint('last_seen', { mode: 'number' }).notNull(),
})
