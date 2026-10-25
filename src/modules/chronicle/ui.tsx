'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { ChronicleApi } from './api'
import styles from './chronicle.module.css'
import { CATEGORIES, type Category, type ChronicleEntry, categoryOf, tell } from './contracts'

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<ChronicleApi>('/api/chronicle')

/** French label of each filter. */
const FILTERS: Record<Category | 'all', string> = {
  all: 'Tout',
  village: 'Village',
  fleet: 'Flotte',
  dungeon: 'Donjon',
  market: 'Marché',
}

/** Icon of each fact, shown in its badge. */
const ICON_OF: Partial<Record<ChronicleEntry['type'], string>> = {
  'village-founded': 'village',
  'raid-launched': 'trireme',
  'fleet-sighted': 'search',
  'fleet-turned-back': 'wave',
  battle: 'swords',
  'posture-chosen': 'defense',
  'expedition-ended': 'loot',
  'trade-completed': 'market',
}

/**
 * Picks the icon of an entry: the building for a construction, the fact otherwise, or
 * the part of the game it belongs to.
 *
 * @param entry - Entry of the chronicle.
 * @returns The identifier of the icon.
 */
function iconOf(entry: ChronicleEntry): string {
  if (entry.type === 'building-ordered') return entry.building
  if (entry.type === 'battle' && !entry.won) return 'sunk'
  return ICON_OF[entry.type] ?? categoryOf(entry.type)
}

/** Format of the day headings: "samedi 24 octobre". */
const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** Format of the time of an entry: "17:42". */
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Groups entries by day, keeping their order.
 *
 * @param entries - Entries, latest first.
 * @returns The days, each with its heading and its entries.
 */
function byDay(entries: ChronicleEntry[]) {
  const days: Array<{ label: string; entries: ChronicleEntry[] }> = []
  for (const entry of entries) {
    const label = DAY.format(entry.at)
    const last = days[days.length - 1]
    if (last?.label === label) last.entries.push(entry)
    else days.push({ label, entries: [entry] })
  }
  return days
}

/**
 * History screen: everything that happened to the player, in the village, the fleet, the
 * dungeon and the market, latest first and grouped by day. Filters keep one part of the
 * game, and older entries load on demand.
 *
 * @returns The history of the player.
 */
export function ChronicleScreen() {
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [entries, setEntries] = useState<ChronicleEntry[] | null>(null)
  const [next, setNext] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  /**
   * Reads a page of the chronicle.
   *
   * @param before - Position to read before, for an older page; none for the latest.
   * @returns Resolves once the page is shown.
   */
  const load = useCallback(
    async (before?: number) => {
      setLoading(true)
      setFailed(false)
      const res = await client.entries.$get({
        query: {
          ...(filter === 'all' ? {} : { category: filter }),
          ...(before ? { before: String(before) } : {}),
        },
      })
      setLoading(false)
      if (!res.ok) {
        setFailed(true)
        return
      }
      const page = await res.json()
      setEntries((current) => (before && current ? [...current, ...page.entries] : page.entries))
      setNext(page.next)
      setNow(Date.now())
    },
    [filter],
  )

  useEffect(() => {
    setEntries(null)
    load()
  }, [load])

  return (
    <>
      <h1>
        <Entity kind="history" /> Historique
      </h1>
      <fieldset className={styles.filters} aria-label="Partie du jeu">
        {(['all', ...CATEGORIES] as const).map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {FILTERS[category]}
          </button>
        ))}
      </fieldset>
      <section className="panel" aria-label="Événements" aria-busy={loading}>
        {failed && <p role="alert">L'historique n'a pas pu être chargé.</p>}
        {entries === null && !failed && <p className="muted">Chargement...</p>}
        {entries?.length === 0 && <p className="muted">Rien à raconter pour le moment.</p>}
        {entries &&
          byDay(entries).map((day) => (
            <div key={day.label}>
              <h2 className={styles.day}>{day.label}</h2>
              <ul className={styles.list}>
                {day.entries.map((entry) => {
                  const told = tell(entry, now)
                  return (
                    <li key={entry.position} className={styles.entry} data-tone={told.tone}>
                      <span className={styles.badge} aria-hidden="true">
                        <Entity kind={iconOf(entry)} />
                      </span>
                      <span className={styles.text}>
                        <span className={styles.title}>{told.title}</span>
                        {told.detail && <span className={styles.detail}>{told.detail}</span>}
                      </span>
                      <time className={styles.time} dateTime={new Date(entry.at).toISOString()}>
                        {TIME.format(entry.at)}
                      </time>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        {next !== null && (
          <div className={styles.more}>
            <button type="button" className="ghost" disabled={loading} onClick={() => load(next)}>
              Plus ancien
            </button>
          </div>
        )}
      </section>
    </>
  )
}
