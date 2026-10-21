import { and, desc, eq, gt, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { OffersReader } from '../application/offers-reader'
import type { OfferSummary } from '../contracts'
import type { Amounts } from '../domain/offer'
import { offersProjection } from './offers-projection'
import { offers } from './schema'

/** Maximum number of offers shown. */
const LIST_SIZE = 50

/**
 * Creates the adapter of the `OffersReader` port, backed by the ongoing offers table. It
 * catches the projection up before each read, and reads the checkpoint position before
 * the table, which reflects at least that position. It lists the ongoing offers of the
 * player, whatever their state, and the open, unexpired offers of the other players.
 *
 * @param db - Database holding the offers table.
 * @param projections - Projection runner of the platform.
 * @returns The offers reader.
 */
export function createDrizzleOffersReader(db: Db, projections: ProjectionRunner): OffersReader {
  return {
    async list(viewerId, now) {
      await projections.catchUp(offersProjection)
      const position = await projections.positionOf(offersProjection.name)

      const rows = await db
        .select()
        .from(offers)
        .where(
          or(
            eq(offers.sellerId, viewerId),
            and(eq(offers.status, 'open'), gt(offers.expiresAt, now)),
          ),
        )
        .orderBy(desc(offers.publishedAt))
        .limit(LIST_SIZE)

      return {
        position,
        offers: rows.map(
          (row): OfferSummary => ({
            offerId: row.offerId,
            sellerName: row.sellerName,
            give: row.give as Amounts,
            want: row.want as Amounts,
            status: row.status as OfferSummary['status'],
            mine: row.sellerId === viewerId,
            expiresAt: row.expiresAt,
          }),
        ),
      }
    },
  }
}
