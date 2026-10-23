import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '../db/client'
import { ConcurrencyError, createEventStore, type EventStore } from '../event-store/event-store'
import { createProjectionRunner, type Projection } from './projection'
import { projections } from './schema'

let db: Db
let store: EventStore
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS test_counts (type text PRIMARY KEY, count integer NOT NULL)`,
  )
  await db.execute(sql`TRUNCATE test_counts`)
})

/**
 * Test projection: counts the events of types A and B in the `test_counts` table.
 * A BOOM event throws, to simulate a failing projection.
 */
const counting: Projection = {
  name: 'test-counting',
  version: 1,
  eventTypes: ['A', 'B', 'BOOM'],
  async apply(event, tx) {
    if (event.type === 'BOOM') throw new Error('panne de la projection')
    await tx.execute(sql`
      INSERT INTO test_counts (type, count) VALUES (${event.type}, 1)
      ON CONFLICT (type) DO UPDATE SET count = test_counts.count + 1`)
  },
  async reset(tx) {
    await tx.execute(sql`DELETE FROM test_counts`)
  },
}

/**
 * Reads the test table.
 *
 * @returns The count of each event type, as `{ type: count }`.
 */
async function counts() {
  const result = await db.execute(sql`SELECT type, count FROM test_counts ORDER BY type`)
  const rows = (result as unknown as { rows: { type: string; count: number }[] }).rows
  return Object.fromEntries(rows.map((row) => [row.type, row.count]))
}

describe('Moteur des projections', () => {
  it('applique les événements de tous les flux, une seule fois', async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await store.append('s-2', 0, [{ type: 'B', data: {} }])
    await store.append('s-1', 1, [{ type: 'A', data: {} }])

    expect(await runner.catchUp(counting)).toBe(3)
    expect(await runner.catchUp(counting)).toBe(0)
    expect(await counts()).toEqual({ A: 2, B: 1 })
    expect(await runner.positionOf('test-counting')).toBe(3)
  })

  it('ne traite que les événements postérieurs au point de reprise', async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await runner.catchUp(counting)
    await store.append('s-1', 1, [{ type: 'B', data: {} }])

    expect(await runner.catchUp(counting)).toBe(1)
    expect(await counts()).toEqual({ A: 1, B: 1 })
  })

  it("ignore les types qu'elle ne traite pas, mais avance son point de reprise", async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [
      { type: 'A', data: {} },
      { type: 'AUTRE', data: {} },
    ])

    expect(await runner.catchUp(counting)).toBe(1)
    expect(await runner.positionOf('test-counting')).toBe(2)
  })

  it('annule toute la mise à jour, point de reprise compris, si un événement échoue', async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [
      { type: 'A', data: {} },
      { type: 'BOOM', data: {} },
    ])

    await expect(runner.catchUp(counting)).rejects.toThrow('panne de la projection')
    expect(await counts()).toEqual({})
    expect(await runner.positionOf('test-counting')).toBe(0)
  })

  it("n'applique qu'une fois chaque événement lors de deux rattrapages simultanés", async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [
      { type: 'A', data: {} },
      { type: 'A', data: {} },
    ])

    const applied = await Promise.all([runner.catchUp(counting), runner.catchUp(counting)])
    expect(applied.sort()).toEqual([0, 2])
    expect(await counts()).toEqual({ A: 2 })
  })
})

describe('Écarts de positions', () => {
  /**
   * Fills a log whose position 2 is missing, because the insert that got it was refused.
   *
   * @returns Resolves once the log is filled.
   */
  async function journalWithGap() {
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await expect(store.append('s-1', 0, [{ type: 'A', data: {} }])).rejects.toBeInstanceOf(
      ConcurrencyError,
    )
    await store.append('s-2', 0, [{ type: 'B', data: {} }])
  }

  it("s'arrête devant une position manquante tant que l'écart est récent", async () => {
    await journalWithGap()
    const runner = createProjectionRunner(db)

    expect(await runner.catchUp(counting)).toBe(1)
    expect(await runner.positionOf('test-counting')).toBe(1)
  })

  it("franchit l'écart une fois le délai écoulé", async () => {
    await journalWithGap()
    const runner = createProjectionRunner(db, { now: () => Date.now() + 10_000 })

    expect(await runner.catchUp(counting)).toBe(2)
    expect(await runner.positionOf('test-counting')).toBe(3)
  })
})

describe('Reconstruction et évolution', () => {
  it('reconstruit, à partir du journal, les tables obtenues par rattrapages successifs', async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await runner.catchUp(counting)
    await store.append('s-2', 0, [
      { type: 'B', data: {} },
      { type: 'A', data: {} },
    ])
    await runner.catchUp(counting)
    const before = await counts()

    expect(await runner.rebuild(counting)).toBe(3)
    expect(await counts()).toEqual(before)
    expect(await runner.positionOf('test-counting')).toBe(3)
  })

  it('reconstruit les tables lorsque la version de la projection change', async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [
      { type: 'A', data: {} },
      { type: 'B', data: {} },
      { type: 'A', data: {} },
    ])
    await runner.catchUp(counting)

    const evolved: Projection = { ...counting, version: 2, eventTypes: ['A'] }
    expect(await runner.catchUp(evolved)).toBe(2)
    expect(await counts()).toEqual({ A: 2 })
    expect(await runner.catchUp(evolved)).toBe(0)
  })

  it('ne modifie pas les tables construites par une version plus récente', async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await runner.catchUp({ ...counting, version: 2 })
    await store.append('s-1', 1, [{ type: 'B', data: {} }])

    expect(await runner.catchUp(counting)).toBe(0)
    expect(await counts()).toEqual({ A: 1 })
    expect(await runner.positionOf('test-counting')).toBe(1)
  })
})

describe('Budget de performance', () => {
  it("ne verrouille ni n'écrit rien lorsque la projection est à jour", async () => {
    const runner = createProjectionRunner(db)
    await store.append('s-1', 0, [{ type: 'A', data: {} }])
    await runner.catchUp(counting)
    const before = await db.select().from(projections)

    expect(await runner.catchUp(counting)).toBe(0)
    expect(await db.select().from(projections)).toEqual(before)
  })
})
