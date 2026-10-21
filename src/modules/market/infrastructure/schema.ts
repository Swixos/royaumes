import { bigint, index, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/** PostgreSQL schema of the market module. Its events stay in the platform log. */
export const market = pgSchema('market')

/**
 * Ongoing offers, kept up to date by the offers projection: an offer enters at
 * publication, and leaves when it reaches a final state (completed, rejected or withdrawn).
 */
export const offers = market.table(
  'offers',
  {
    offerId: text('offer_id').primaryKey(),
    sellerId: text('seller_id').notNull(),
    sellerName: text('seller_name').notNull(),
    give: jsonb('give').notNull(),
    want: jsonb('want').notNull(),
    /** `reserving`, `open` or `settling`: the only states that are not final. */
    status: text('status').notNull(),
    publishedAt: bigint('published_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('offers_seller_idx').on(t.sellerId)],
)
