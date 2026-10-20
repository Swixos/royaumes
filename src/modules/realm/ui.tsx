'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'

/** Typed HTTP client inferred from the realm Hono sub-app. */
const client = hc<RealmApi>('/api/realm')

/** Errors the API can return: domain errors and the validation error. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message shown to the player for each error. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/**
 * Tells whether a stock covers a cost.
 *
 * @param stock - Available stock.
 * @param cost - Cost to cover; `null` at max level.
 * @returns True if every amount is covered, false if not or if `cost` is `null`.
 */
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/**
 * Village screen: founding form, ticking stock and buildings, kept up to date in
 * real time. Every event of the village, including from another tab or device,
 * triggers a reload of the view ("notify, then reread").
 *
 * @param props - Component props.
 * @param props.userId - Signed-in player, naming the village channel.
 * @returns The village screen.
 */
export function VillageScreen({ userId }: { userId: string }) {
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  /** Reloads the village view from the API. */
  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(villageChannel(userId), refresh)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  /**
   * Founds the village.
   *
   * @param name - Village name.
   */
  async function found(name: string) {
    const res = await client.village.$post({ json: { name } })
    handle(await res.json())
  }
  /**
   * Upgrades a building.
   *
   * @param building - Building to upgrade.
   */
  async function upgrade(building: Building) {
    const res = await client.village.upgrade.$post({ json: { building } })
    handle(await res.json())
  }
  /**
   * Applies an API response: shows the error, or stores the new view.
   *
   * @param body - Response body.
   */
  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }

  const title = (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h1>
        <Entity kind="village" /> {view?.name ?? 'Royaumes'}
      </h1>
      <span className="status" data-status={status}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  )

  if (view === undefined) return title

  if (view === null) {
    return (
      <>
        {title}
        <div className="panel">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              found(String(new FormData(e.currentTarget).get('name')))
            }}
          >
            <label htmlFor="name">Nommez votre village</label>
            <input id="name" name="name" required minLength={2} maxLength={30} />
            <button type="submit">Fonder</button>
            {error && <p className="error">{error}</p>}
          </form>
        </div>
      </>
    )
  }

  const stock = stockAt(view, now)
  return (
    <>
      {title}
      <section className="panel stock" aria-label="Ressources">
        {RESOURCES.map((r) => (
          <div key={r}>
            <Entity kind={r} /> {Math.floor(stock[r])}
            <small>+{view.ratesPerMinute[r]} / min</small>
          </div>
        ))}
      </section>
      <section className="panel buildings" aria-label="Bâtiments">
        {BUILDINGS.map((b) => {
          const cost = view.nextCosts[b]
          return (
            <div key={b} className="building">
              <span>
                <Entity kind={b} showLabel /> <span className="muted">niveau {view.levels[b]}</span>
              </span>
              <span className="row">
                {cost &&
                  Object.entries(cost).map(([r, n]) => (
                    <span key={r} className="muted">
                      <Entity kind={r} /> {n}
                    </span>
                  ))}
                <button type="button" disabled={!canAfford(stock, cost)} onClick={() => upgrade(b)}>
                  {view.levels[b] === 0 ? 'Construire' : 'Améliorer'}
                </button>
              </span>
            </div>
          )
        })}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  )
}
