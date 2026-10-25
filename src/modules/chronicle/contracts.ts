/**
 * Shared public entry of the chronicle module, usable by both the server and the
 * interface.
 *
 * @packageDocumentation
 */
import { z } from 'zod'
import { CATEGORIES, type Category, type ChronicleEntry } from './domain/entry'

export type {
  Amounts,
  BattleDetail,
  Category,
  ChronicleEntry,
  Fact,
  ReportLine,
  Told,
} from './domain/entry'
export { CATEGORIES, categoryOf, explainBattle, tell, tellAmounts } from './domain/entry'

/** Number of entries returned by one page of the chronicle. */
export const CHRONICLE_PAGE_SIZE = 30

/** Query of a page of the chronicle: a part of the game, and the position to read before. */
export const ChronicleQuery = z.object({
  category: z.enum(CATEGORIES as [Category, ...Category[]]).optional(),
  before: z.coerce.number().int().positive().optional(),
})

/** Page of the chronicle returned by the API, latest entries first. */
export interface ChroniclePage {
  /** Entries of the page. */
  entries: ChronicleEntry[]
  /** Position to read before for the next page, or null when there is no older entry. */
  next: number | null
}
