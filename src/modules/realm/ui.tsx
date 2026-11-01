'use client'
import { hc } from 'hono/client'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fleetLimits, WALL_BONUS } from '@/modules/fleet/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { VILLAGE_CHANGED } from '@/ui/events'
import { GameWindow, HOME } from '@/ui/game-window'
import { Icon } from '@/ui/icons'
import { useSceneControls } from '@/ui/pixi/scene-host'
import { ZoomControls } from '@/ui/pixi/zoom-controls'
import { look } from '@/ui/theme'
import type { RealmApi } from './api'
import {
  type Army,
  addArmy,
  BUILDINGS,
  type Building,
  type DomainError,
  farmCapacity,
  hiddenAmount,
  isLand,
  LAND_STATS,
  LAND_UNITS,
  type Levels,
  MAX_LEVEL,
  MAX_ORDER,
  NAVAL_STATS,
  NAVAL_UNITS,
  PRODUCTION,
  type Producer,
  type Stock,
  stockAt,
  TRAINING_SLOTS,
  trainedAt,
  trainedBy,
  trainingEnd,
  UNIT_COSTS,
  UNIT_LEVELS,
  UNIT_POPULATION,
  type Unit,
  unitsOf,
  type VillageView,
  villageChannel,
  warehouseCapacity,
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
  REQUIREMENTS_NOT_MET: 'Les bâtiments nécessaires ne sont pas encore construits.',
  QUEUE_FULL: 'La file est pleine : attendez la fin d’un ordre.',
  UNIT_LOCKED: 'Ce bâtiment n’a pas encore le niveau voulu pour cette unité.',
  INVALID_ORDER: 'Un ordre compte de 1 à 50 unités.',
  POPULATION_EXCEEDED: 'La ferme ne nourrit pas autant de monde : agrandissez-la.',
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
  senate: 'Le conseil des anciens organise les chantiers : plus il grandit, plus on bâtit vite.',
  sawmill: "Les bûcherons abattent la forêt de l'ouest et débitent les troncs.",
  quarry: 'Les tailleurs découpent la falaise en blocs prêts à bâtir.',
  mine: "Les mineurs creusent la montagne de l'est pour en tirer de l'or.",
  farm: 'La ferme nourrit le peuple : chaque unité, formée, en formation ou en raid, y prend sa place.',
  barracks:
    'Les recrues y apprennent le maniement des armes : épéistes, frondeurs, archers et hoplites.',
  warehouse:
    "L'entrepôt garde les récoltes : la production s'arrête quand il est plein, et une part y reste cachée aux pillards.",
  wall: 'Le rempart protège la ville : chaque niveau renforce la défense de la garnison.',
  shipyard:
    'Les charpentiers construisent bateaux de transport, birèmes et navires légers, et mettent plus de flottes en mer.',
}

/** Effect of a building, compared between its current level and the next one. */
interface Effect {
  /** Name of the effect. */
  label: string
  /** Icon of the effect. */
  icon: string
  /**
   * Value of the effect at a level.
   *
   * @param level - Level of the building.
   * @returns The value, as shown to the player.
   */
  at(level: number): string
}

/**
 * Lists the effects of a building: what its level gives to the village, its port or its
 * fleets.
 *
 * @param building - Building concerned.
 * @returns Its effects.
 */
function effectsOf(building: Building): Effect[] {
  switch (building) {
    case 'senate':
      return [{ label: 'Chantiers', icon: 'time', at: (level) => `-${level * 5} % de durée` }]
    case 'warehouse':
      return [
        { label: 'Capacité', icon: 'capacity', at: (level) => `${warehouseCapacity(level)}` },
        { label: 'Cachette', icon: 'defense', at: (level) => `${hiddenAmount(level)}` },
      ]
    case 'wall':
      return [
        {
          label: 'Défense de la garnison',
          icon: 'defense',
          at: (level) => `+${Math.round(WALL_BONUS * level * 100)} %`,
        },
      ]
    case 'farm':
      return [{ label: 'Population', icon: 'population', at: (level) => `${farmCapacity(level)}` }]
    case 'barracks':
      return [{ label: 'Formation', icon: 'time', at: (level) => `-${level * 5} % de durée` }]
    case 'shipyard':
      return [
        { label: 'Formation', icon: 'time', at: (level) => `-${level * 5} % de durée` },
        { label: 'Flottes en mer', icon: 'fleet', at: (level) => `${fleetLimits(level).maxRaids}` },
        {
          label: 'Traversées',
          icon: 'wave',
          at: (level) => `-${Math.round((1 - fleetLimits(level).speed) * 100)} %`,
        },
      ]
    default: {
      const { produces, perMinute } = PRODUCTION[building as Producer]
      return [{ label: 'Production', icon: produces, at: (level) => `${perMinute * level} / min` }]
    }
  }
}

/**
 * Formats a duration as minutes and seconds.
 *
 * @param ms - Duration in milliseconds.
 * @returns The duration, such as "2:05".
 */
function duration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Names the levels a building still needs.
 *
 * @param missing - Missing levels, by building.
 * @returns The text, such as "Sénat niveau 3, Scierie niveau 3".
 */
const requirementText = (missing: Partial<Levels>) =>
  Object.entries(missing)
    .map(([building, level]) => `${look(building).label} niveau ${level}`)
    .join(', ')

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/**
 * Village screen, drawn under every window of the game: the scene fills the screen, with
 * the name of the village, the construction queue and the bar of the buildings laid over
 * it; picking a building opens its window. Before founding, the screen asks for a name.
 * The view is kept up to date in real time: every event of the village, including from
 * another tab or device, triggers a reload ("notify, then reread").
 *
 * @param props - Component props.
 * @param props.userId - Signed-in player, naming the village channel.
 * @returns The village screen.
 */
export function VillageScreen({ userId }: { userId: string }) {
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Building | null>(null)
  const windowOpen = usePathname() !== HOME

  /** Reloads the village view from the API. */
  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(villageChannel(userId), refresh)

  const nextCompletion = view?.queue[0]?.completesAt
  useEffect(() => {
    if (nextCompletion === undefined) return
    const timer = setTimeout(
      () => {
        refresh()
        window.dispatchEvent(new Event(VILLAGE_CHANGED))
      },
      Math.max(0, nextCompletion - Date.now()) + 300,
    )
    return () => clearTimeout(timer)
  }, [nextCompletion, refresh])

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
   * Orders units at the barracks or the shipyard.
   *
   * @param unit - Unit to train.
   * @param count - Number of units.
   */
  async function recruit(unit: Unit, count: number) {
    const res = await client.village.recruit.$post({ json: { unit, count } })
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
    <div className="world-title">
      <h1>
        <Entity kind="village" />
        <span className="world-name">{view?.name ?? 'Royaumes'}</span>
      </h1>
      <span className="status" data-status={status} title={STATUS_LABELS[status]}>
        <span className="status-label">{STATUS_LABELS[status]}</span>
      </span>
    </div>
  )

  if (view === undefined) return <div className="village-world">{title}</div>

  if (view === null) {
    return (
      <div className="village-world">
        {title}
        <div className="panel world-found">
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
      </div>
    )
  }

  const stock = stockAt(view, now)
  return (
    <div className="village-world">
      <VillageScene view={view} selected={selected} paused={windowOpen} onSelect={setSelected} />
      {title}
      <Works view={view} now={now} onSelect={setSelected} />
      <section className="village-bar" aria-label="Bâtiments">
        {BUILDINGS.map((building) => (
          <button
            key={building}
            type="button"
            data-guide={`building-${building}`}
            aria-pressed={selected === building}
            onClick={() => setSelected(building)}
          >
            <Entity kind={building} />
            <span className="village-bar-name">{look(building).label}</span>
            <span className="village-bar-level">{view.levels[building]}</span>
            {view.queue.some((item) => item.building === building) && (
              <span className="village-bar-works" title="En chantier">
                <Entity kind="build" />
              </span>
            )}
          </button>
        ))}
      </section>
      {selected && (
        <GameWindow label={look(selected).label} size="side" onClose={() => setSelected(null)}>
          <BuildingCard
            building={selected}
            view={view}
            stock={stock}
            onUpgrade={upgrade}
            onRecruit={recruit}
            onSelect={setSelected}
            error={error}
            now={now}
          />
        </GameWindow>
      )}
    </div>
  )
}

/**
 * Scene of the village, filling the screen and starting on the senate: the player zooms
 * with the wheel, two fingers or the buttons, and slides the village with the mouse or a
 * finger. It pauses while a window covers it.
 *
 * @param props - Component props.
 * @param props.view - Current village view.
 * @param props.selected - Selected building, or null.
 * @param props.paused - True while a window covers the village.
 * @param props.onSelect - Called with the building the player picks in the scene.
 * @returns The scene.
 */
function VillageScene({
  view,
  selected,
  paused,
  onSelect,
}: {
  view: VillageView
  selected: Building | null
  paused: boolean
  onSelect: (building: Building) => void
}) {
  const controls = useSceneControls()
  const state = useMemo(
    () => ({
      name: view.name,
      levels: view.levels,
      rates: view.ratesPerMinute,
      queue: view.queue,
      selected,
    }),
    [view.name, view.levels, view.ratesPerMinute, view.queue, selected],
  )
  return (
    <section className="world-scene" aria-label="Vue du village">
      <VillageMap state={state} handlers={{ onSelect }} paused={paused} controls={controls} />
      <ZoomControls controls={controls} />
    </section>
  )
}

/**
 * Construction queue, laid over the scene: the upgrade under way with its countdown, then
 * the one waiting.
 *
 * @param props - Component props.
 * @param props.view - Current village view.
 * @param props.now - Current time in milliseconds.
 * @param props.onSelect - Called with a building to show its card.
 * @returns The queue.
 */
function Works({
  view,
  now,
  onSelect,
}: {
  view: VillageView
  now: number
  onSelect: (building: Building) => void
}) {
  return (
    <section className="works" aria-label="Chantiers en cours">
      <h2>
        <Entity kind="build" /> Chantiers {view.queue.length} / {view.queueSlots}
      </h2>
      {view.queue.length === 0 && <p>Aucun chantier en cours.</p>}
      <ol>
        {view.queue.map((item, index) => (
          <li key={`${item.building}-${item.toLevel}`}>
            <button type="button" className="link" onClick={() => onSelect(item.building)}>
              <Entity kind={item.building} showLabel />
            </button>
            <span className="muted works-level">niv. {item.toLevel}</span>
            <span className="works-time">
              {index === 0 || view.queue[index - 1].completesAt <= now ? (
                <>
                  <Entity kind="time" /> {duration(item.completesAt - now)}
                </>
              ) : (
                'en attente'
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Card of a building: its level, its effects now and at the next level, what it still
 * needs, and the cost and duration of the next level with the button to order it.
 *
 * @param props - Component props.
 * @param props.building - Building shown.
 * @param props.view - Current village view.
 * @param props.stock - Current stock.
 * @param props.onUpgrade - Called with the building the player builds or upgrades.
 * @param props.onRecruit - Called with the units the player orders.
 * @param props.onSelect - Called with another building to show, from the senate.
 * @param props.error - Error of the last command, if any.
 * @param props.now - Current time in milliseconds, to count the units in training.
 * @returns The card.
 */
function BuildingCard({
  building,
  view,
  stock,
  onUpgrade,
  onRecruit,
  onSelect,
  error,
  now,
}: {
  building: Building
  view: VillageView
  stock: Stock
  onUpgrade: (building: Building) => void
  onRecruit: (unit: Unit, count: number) => void
  onSelect: (building: Building) => void
  error: string | null
  now: number
}) {
  const affordable = canAfford(stock, view.nextCosts[building])
  const level = view.levels[building]
  const planned = view.queue.reduce(
    (top, item) => (item.building === building ? Math.max(top, item.toLevel) : top),
    level,
  )
  const cost = view.nextCosts[building]
  const time = view.nextDurations[building]
  const missing = view.requirements[building]
  const blocked = Object.keys(missing).length > 0
  const full = view.queue.length >= view.queueSlots
  const tooBig = !!cost && Object.values(cost).some((amount) => (amount ?? 0) > view.capacity)
  return (
    <article className="building-card" aria-live="polite">
      <header>
        <Entity kind={building} />
        <div>
          <h2>{look(building).label}</h2>
          <span className="level">
            Niveau {level} / {MAX_LEVEL}
            {planned > level && ` · niveau ${planned} en chantier`}
          </span>
        </div>
      </header>
      <p>{STORIES[building]}</p>
      <table className="effects">
        <thead>
          <tr>
            <th scope="col">Effet</th>
            <th scope="col">Actuel</th>
            {cost && <th scope="col">Niveau {planned + 1}</th>}
          </tr>
        </thead>
        <tbody>
          {effectsOf(building).map((effect) => (
            <tr key={effect.label}>
              <th scope="row">
                <Entity kind={effect.icon} /> {effect.label}
              </th>
              <td>{effect.at(level)}</td>
              {cost && <td>{effect.at(planned + 1)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {blocked && <p className="error">Nécessite : {requirementText(missing)}.</p>}
      {tooBig && !blocked && (
        <p className="error">
          Agrandissez l'entrepôt : il ne peut stocker que {view.capacity} de chaque ressource.
        </p>
      )}
      {cost ? (
        <div className="building-cost">
          <span className="amounts">
            {Object.entries(cost).map(([r, n]) => (
              <span key={r}>
                <Entity kind={r} /> {n}
              </span>
            ))}
            {time !== null && (
              <span>
                <Entity kind="time" /> {duration(time)}
              </span>
            )}
          </span>
          <button
            type="button"
            className="primary"
            data-guide={`upgrade-${building}`}
            disabled={!affordable || blocked || full}
            onClick={() => onUpgrade(building)}
          >
            {full ? 'File pleine' : planned === 0 ? 'Construire' : 'Améliorer'}
          </button>
        </div>
      ) : (
        <p className="level">Ce bâtiment a atteint son niveau maximum.</p>
      )}
      {error && <p className="error">{error}</p>}
      {building === 'senate' && (
        <Constructions view={view} stock={stock} onUpgrade={onUpgrade} onSelect={onSelect} />
      )}
      {(building === 'barracks' || building === 'shipyard') && (
        <Recruitment
          building={building}
          view={view}
          stock={stock}
          now={now}
          onRecruit={onRecruit}
        />
      )}
      {(building === 'farm' || building === 'wall') && <Garrison view={view} now={now} />}
    </article>
  )
}

/**
 * Construction plan of the senate, as in a strategy game: every building of the village
 * with its level and the cost of its next level, ordered from one place.
 *
 * @param props - Component props.
 * @param props.view - Current village view.
 * @param props.stock - Current stock.
 * @param props.onUpgrade - Called with the building the player builds or upgrades.
 * @param props.onSelect - Called with a building to show its card.
 * @returns The construction plan.
 */
function Constructions({
  view,
  stock,
  onUpgrade,
  onSelect,
}: {
  view: VillageView
  stock: Stock
  onUpgrade: (building: Building) => void
  onSelect: (building: Building) => void
}) {
  const full = view.queue.length >= view.queueSlots
  return (
    <section className="constructions" aria-label="Plan de construction">
      <h3>Plan de construction</h3>
      <ul>
        {BUILDINGS.map((building) => {
          const cost = view.nextCosts[building]
          const blocked = Object.keys(view.requirements[building]).length > 0
          return (
            <li key={building}>
              <button type="button" className="link" onClick={() => onSelect(building)}>
                <Entity kind={building} showLabel />
              </button>
              <span className="muted">niv. {view.levels[building]}</span>
              <span className="amounts">
                {cost
                  ? Object.entries(cost).map(([r, n]) => (
                      <span key={r} data-short={stock[r as keyof Stock] < (n ?? 0)}>
                        <Entity kind={r} /> {n}
                      </span>
                    ))
                  : 'max'}
              </span>
              <button
                type="button"
                className="primary"
                aria-label={`Améliorer : ${look(building).label}`}
                disabled={!cost || blocked || full || !canAfford(stock, cost)}
                onClick={() => onUpgrade(building)}
              >
                <Icon kind="build" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Units at home now: those of the view, plus the units out of training since the view was
 * read, so the counts move without asking the server again.
 *
 * @param view - Last view received.
 * @param now - Current time in milliseconds.
 * @returns The units at home.
 */
function armyNow(view: VillageView, now: number): Army {
  let army = view.army
  for (const training of view.trainings) {
    const fresh = trainedBy(training, now) - trainedBy(training, view.asOf)
    if (fresh > 0) army = addArmy(army, { [training.unit]: fresh })
  }
  return army
}

/**
 * Fighting values of a unit, told in a few icons.
 *
 * @param props - Component props.
 * @param props.unit - Unit to describe.
 * @returns The values: attack, defenses and booty of a land unit, values at sea of a ship.
 */
function UnitStats({ unit }: { unit: Unit }) {
  if (isLand(unit)) {
    const { attack, damage, defense, booty } = LAND_STATS[unit]
    return (
      <span className="unit-stats">
        <span title={`Attaque : ${look(damage).label.toLowerCase()}`}>
          <Entity kind={damage} /> {attack}
        </span>
        <span title="Défense contre contondant, tranchant et distance">
          <Entity kind="defense" /> {defense.blunt} · {defense.sharp} · {defense.distance}
        </span>
        <span title="Butin emporté">
          <Entity kind="loot" /> {booty}
        </span>
      </span>
    )
  }
  const { attack, defense, capacity, speed } = NAVAL_STATS[unit]
  return (
    <span className="unit-stats">
      {capacity > 0 ? (
        <span title="Places pour les troupes">
          <Entity kind="troops" /> {capacity}
        </span>
      ) : (
        <>
          <span title="Attaque en mer">
            <Entity kind="swords" /> {attack}
          </span>
          <span title="Défense en mer">
            <Entity kind="defense" /> {defense}
          </span>
        </>
      )}
      <span title="Vitesse">
        <Entity kind="wave" /> {speed}
      </span>
    </span>
  )
}

/**
 * Recruitment of a building, as in a strategy game: the population the farm feeds, the
 * units of the building with their values, cost and training time, the number to order,
 * and the orders under way, counted live.
 *
 * @param props - Component props.
 * @param props.building - Barracks or shipyard.
 * @param props.view - Current village view.
 * @param props.stock - Current stock.
 * @param props.now - Current time in milliseconds.
 * @param props.onRecruit - Called with the units the player orders.
 * @returns The recruitment panel.
 */
function Recruitment({
  building,
  view,
  stock,
  now,
  onRecruit,
}: {
  building: 'barracks' | 'shipyard'
  view: VillageView
  stock: Stock
  now: number
  onRecruit: (unit: Unit, count: number) => void
}) {
  const [counts, setCounts] = useState<Partial<Record<Unit, number>>>({})
  const units = building === 'barracks' ? LAND_UNITS : NAVAL_UNITS
  const title = building === 'barracks' ? 'Formation des troupes' : 'Construction des navires'
  const army = armyNow(view, now)
  const free = view.population.capacity - view.population.used
  const orders = view.trainings.filter(
    (training) => trainedAt(training.unit) === building && trainingEnd(training) > now,
  )
  const full = orders.length >= TRAINING_SLOTS
  /**
   * Largest order of a unit the village can pay and feed.
   *
   * @param unit - Unit to train.
   * @returns The number of units, from 0 to the largest order.
   */
  const most = (unit: Unit) => {
    let count = Math.floor(free / UNIT_POPULATION[unit])
    for (const [resource, amount] of Object.entries(UNIT_COSTS[unit])) {
      if ((amount ?? 0) > 0) {
        count = Math.min(count, Math.floor(stock[resource as keyof Stock] / (amount ?? 1)))
      }
    }
    return Math.max(0, Math.min(MAX_ORDER, count))
  }
  return (
    <section className="recruitment" aria-label={title}>
      <h3>{title}</h3>
      <p className="population">
        <Entity kind="population" showLabel /> {view.population.used} / {view.population.capacity}
        <span className="muted">
          {' '}
          · {Math.max(0, free)} place{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''}
        </span>
      </p>
      <ul className="units">
        {units.map((unit) => {
          const locked = view.levels[building] < UNIT_LEVELS[unit]
          const max = most(unit)
          const count = Math.min(counts[unit] ?? 1, Math.max(1, max))
          return (
            <li key={unit} data-locked={locked}>
              <span className="unit-badge">
                <Entity kind={unit} />
                <span className="unit-owned" title="À la maison">
                  {army[unit] ?? 0}
                </span>
              </span>
              <span className="unit-text">
                <strong>{look(unit).label}</strong>
                <UnitStats unit={unit} />
                <span className="amounts">
                  {Object.entries(UNIT_COSTS[unit]).map(([resource, amount]) => (
                    <span
                      key={resource}
                      data-short={stock[resource as keyof Stock] < (amount ?? 0)}
                    >
                      <Entity kind={resource} /> {amount}
                    </span>
                  ))}
                  <span>
                    <Entity kind="population" /> {UNIT_POPULATION[unit]}
                  </span>
                  <span>
                    <Entity kind="time" /> {duration(view.trainingTimes[unit])}
                  </span>
                </span>
              </span>
              {locked ? (
                <span className="muted unit-lock">
                  {look(building).label} niveau {UNIT_LEVELS[unit]}
                </span>
              ) : (
                <span className="unit-order">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(1, max)}
                    value={count}
                    aria-label={`Nombre : ${look(unit).label}`}
                    onChange={(event) =>
                      setCounts({
                        ...counts,
                        [unit]: Math.max(1, Math.floor(Number(event.target.value) || 1)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="ghost"
                    disabled={max < 1}
                    onClick={() => setCounts({ ...counts, [unit]: max })}
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    className="primary"
                    data-guide={`recruit-${unit}`}
                    disabled={full || max < 1 || count > max}
                    onClick={() => onRecruit(unit, count)}
                  >
                    {building === 'barracks' ? 'Former' : 'Construire'}
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {full && <p className="muted">La file est pleine : {TRAINING_SLOTS} ordres au plus.</p>}
      {orders.length > 0 && (
        <ol className="orders" aria-label="Ordres en cours">
          {orders.map((order) => {
            const done = trainedBy(order, now)
            const next = order.startsAt + (done + 1) * order.each
            return (
              <li key={`${order.unit}-${order.startsAt}`}>
                <Entity kind={order.unit} showLabel />
                <span className="muted">
                  {done} / {order.count}
                </span>
                <span className="works-time">
                  {now >= order.startsAt ? (
                    <>
                      <Entity kind="time" /> {duration(next - now)}
                    </>
                  ) : (
                    'en attente'
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/**
 * Units of the village, at home and away, shown on the cards of the farm and the wall.
 *
 * @param props - Component props.
 * @param props.view - Current village view.
 * @param props.now - Current time in milliseconds.
 * @returns The garrison.
 */
function Garrison({ view, now }: { view: VillageView; now: number }) {
  const home = unitsOf(armyNow(view, now))
  const away = unitsOf(view.away)
  return (
    <section className="recruitment" aria-label="Garnison">
      <h3>Garnison</h3>
      {home.length === 0 && away.length === 0 && (
        <p className="muted">Aucune troupe : formez-en à la caserne et au chantier naval.</p>
      )}
      {home.length > 0 && (
        <p className="amounts">
          {home.map(([unit, count]) => (
            <span key={unit} title={look(unit).label}>
              <Entity kind={unit} /> {count}
            </span>
          ))}
        </p>
      )}
      {away.length > 0 && (
        <p className="muted amounts">
          En raid :
          {away.map(([unit, count]) => (
            <span key={unit} title={look(unit).label}>
              <Entity kind={unit} /> {count}
            </span>
          ))}
        </p>
      )}
    </section>
  )
}
