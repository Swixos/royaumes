'use client'
import { hc } from 'hono/client'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { VILLAGE_CHANGED } from '@/ui/events'
import { look } from '@/ui/theme'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  CATALOG,
  type DomainError,
  MAX_LEVEL,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'
import { VillageMap } from './scene/village-map'

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

/** What each building does, told on its card. */
const STORIES: Record<Building, string> = {
  sawmill: "Les bûcherons abattent la forêt de l'ouest et débitent les troncs.",
  quarry: 'Les tailleurs découpent la falaise en blocs prêts à bâtir.',
  mine: "Les mineurs creusent la montagne de l'est pour en tirer de l'or.",
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
  const [selected, setSelected] = useState<Building>('sawmill')

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
   * Applies an API response: shows the error, or stores the new view and announces the
   * change to the resource bar.
   *
   * @param body - Response body.
   */
  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
      window.dispatchEvent(new Event(VILLAGE_CHANGED))
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
      <VillageStage view={view} selected={selected} onSelect={setSelected}>
        <BuildingCard
          building={selected}
          view={view}
          affordable={canAfford(stock, view.nextCosts[selected])}
          onUpgrade={() => upgrade(selected)}
          error={error}
        />
      </VillageStage>
      <section className="panel buildings" aria-label="Bâtiments">
        {BUILDINGS.map((b) => {
          const cost = view.nextCosts[b]
          return (
            <button
              key={b}
              type="button"
              className="building"
              aria-pressed={selected === b}
              onClick={() => setSelected(b)}
            >
              <span>
                <Entity kind={b} showLabel /> <span className="muted">niveau {view.levels[b]}</span>
              </span>
              <span className="row">
                {cost ? (
                  Object.entries(cost).map(([r, n]) => (
                    <span key={r} className="muted" data-short={stock[r as keyof Stock] < (n ?? 0)}>
                      <Entity kind={r} /> {n}
                    </span>
                  ))
                ) : (
                  <span className="muted">Niveau maximum</span>
                )}
              </span>
            </button>
          )
        })}
      </section>
    </>
  )
}

/**
 * Village scene, with the card of the selected building laid over it.
 *
 * @param props - Component props.
 * @param props.view - Current village view.
 * @param props.selected - Selected building.
 * @param props.onSelect - Called when the player picks a building in the scene.
 * @param props.children - Card laid over the scene.
 * @returns The scene and its card.
 */
function VillageStage({
  view,
  selected,
  onSelect,
  children,
}: {
  view: VillageView
  selected: Building
  onSelect: (building: Building) => void
  children: ReactNode
}) {
  const state = useMemo(
    () => ({ name: view.name, levels: view.levels, rates: view.ratesPerMinute, selected }),
    [view.name, view.levels, view.ratesPerMinute, selected],
  )
  return (
    <section className="village-stage" aria-label="Vue du village">
      <VillageMap state={state} handlers={{ onSelect }} />
      {children}
    </section>
  )
}

/**
 * Card of a building: its level, what it produces now and at the next level, and the
 * cost of the next level with the button to pay it.
 *
 * @param props - Component props.
 * @param props.building - Building shown.
 * @param props.view - Current village view.
 * @param props.affordable - True if the stock covers the next level.
 * @param props.onUpgrade - Called when the player builds or upgrades it.
 * @param props.error - Error of the last command, if any.
 * @returns The card.
 */
function BuildingCard({
  building,
  view,
  affordable,
  onUpgrade,
  error,
}: {
  building: Building
  view: VillageView
  affordable: boolean
  onUpgrade: () => void
  error: string | null
}) {
  const level = view.levels[building]
  const cost = view.nextCosts[building]
  const { produces, perMinute } = CATALOG[building]
  return (
    <article className="building-card" aria-live="polite">
      <header>
        <Entity kind={building} />
        <div>
          <h2>{look(building).label}</h2>
          <span className="level">
            Niveau {level} / {MAX_LEVEL}
          </span>
        </div>
      </header>
      <p>{STORIES[building]}</p>
      <dl>
        <div>
          <dt>Production</dt>
          <dd>
            <Entity kind={produces} /> {perMinute * level} / min
          </dd>
        </div>
        {cost && (
          <div>
            <dt>Niveau suivant</dt>
            <dd>
              <Entity kind={produces} /> {perMinute * (level + 1)} / min
            </dd>
          </div>
        )}
      </dl>
      {cost ? (
        <div className="building-cost">
          <span className="amounts">
            {Object.entries(cost).map(([r, n]) => (
              <span key={r}>
                <Entity kind={r} /> {n}
              </span>
            ))}
          </span>
          <button type="button" className="primary" disabled={!affordable} onClick={onUpgrade}>
            {level === 0 ? 'Construire' : 'Améliorer'}
          </button>
        </div>
      ) : (
        <p className="level">Ce bâtiment a atteint son niveau maximum.</p>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  )
}
