'use client'
import { hc } from 'hono/client'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { VILLAGE_CHANGED } from '@/ui/events'
import { Icon } from '@/ui/icons'
import { DROP, SPRING } from '@/ui/motion'
import { SceneHost, type SceneLoader } from '@/ui/pixi/scene-host'
import { look } from '@/ui/theme'
import { useCenteredScroll } from '@/ui/use-centered-scroll'
import type { FleetApi } from './api'
import {
  type Amounts,
  BEATS,
  equipmentCost,
  fight,
  type HarborView,
  harborChannel,
  holdOf,
  MAX_RAIDS_AT_SEA,
  MAX_SHIPS,
  type MapPoint,
  mapPositionOf,
  PIRATE_ISLANDS,
  type RaidError,
  type RaidStatus,
  type RaidSummary,
  type RaidView,
  TACTICS,
  type Tactic,
  type TargetsList,
} from './contracts'
import styles from './fleet.module.css'
import { clock, laneOf, relax, toWorld } from './scene/sea-layout'
import type { SeaSceneState } from './scene/sea-scene'

/**
 * Loads the sea map, with PixiJS, once the page is on the client.
 *
 * @param host - Element receiving the canvas.
 * @param state - First state to show.
 * @returns The live scene.
 */
const loadSea: SceneLoader<SeaSceneState, object> = async (host, state) =>
  (await import('./scene/sea-scene')).createSeaScene(host, state)

/** Handlers of the sea map: the islands are picked through the buttons laid over it. */
const NO_HANDLERS = {}

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<FleetApi>('/api/fleet')

/** Possible fleet sizes, from one trireme to the largest fleet. */
const FLEET_SIZES = Array.from({ length: MAX_SHIPS }, (_, i) => i + 1)

/** Flat colors of the ships of the battle report. */
const SEA = {
  gold: '#e8cd84',
  ink: '#2a170a',
  own: '#f3e3bb',
  enemy: '#a32a1a',
}

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Vigie en approche...',
  open: 'Vigie en poste',
  reconnecting: 'Vigie perdue, reprise...',
} as const

/** Message shown to the player for each error. */
const ERRORS: Record<RaidError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Ordre invalide.',
  RAID_NOT_FOUND: 'Raid introuvable.',
  ALREADY_EXISTS: 'Raid déjà lancé.',
  INVALID_FLEET: 'Une flotte compte de 1 à 10 trirèmes.',
  OWN_VILLAGE: 'Vous ne pouvez pas attaquer votre propre village.',
  UNKNOWN_TARGET: "Cette cible n'existe plus.",
  TOO_MANY_RAIDS: 'Deux flottes sont déjà en mer : attendez leur retour.',
  TREASURE_TAKEN: "Vous avez déjà attaqué cette île aujourd'hui.",
  NOT_ATTACKER: "Seul l'amiral de cette flotte peut la rappeler.",
  NOT_AT_SEA: "Cette flotte n'est plus en mer.",
  ALREADY_ARRIVED: 'Trop tard : la flotte a touché terre.',
  NOT_ARRIVED: "La flotte n'est pas encore arrivée.",
}

/** Label of each raid state, seen by the attacker. */
const ATTACK_STATUS: Record<RaidStatus, string> = {
  provisioning: 'Armement',
  'at-sea': 'En mer',
  plundering: 'Pillage',
  returned: 'Victoire',
  sunk: 'Coulée',
  recalled: 'Rappelée',
  cancelled: 'Annulée',
  aborted: 'Abandonnée',
}

/** Label of each raid state, seen by the defender. */
const DEFENSE_STATUS: Record<RaidStatus, string> = {
  ...ATTACK_STATUS,
  'at-sea': 'En approche',
  plundering: 'Pillage en cours',
  returned: 'Village pillé',
  sunk: 'Repoussée',
  recalled: 'Demi-tour',
}

/** Target selected on the map. */
type Selection = { kind: 'village'; id: string } | { kind: 'pirates'; id: string } | null

/**
 * Shows resource amounts, such as "30 bois, 15 pierre".
 *
 * @param props - Amounts to show.
 * @returns The amounts with their icons, or "rien" when empty.
 */
function AmountsText({ amounts }: { amounts: Amounts }) {
  const entries = Object.entries(amounts).filter(([, amount]) => (amount ?? 0) > 0)
  if (entries.length === 0) return <>rien</>
  return (
    <span className={styles.amounts}>
      {entries.map(([resource, amount]) => (
        <span key={resource}>
          <Entity kind={resource} /> {amount}
        </span>
      ))}
    </span>
  )
}

/**
 * Hook giving the current time, refreshed on every animation frame while `active`.
 *
 * @param active - Whether something moves on screen.
 * @returns The current time in milliseconds.
 */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let frame = 0
    let last = 0
    const tick = (time: number) => {
      if (time - last > 50) {
        last = time
        setNow(Date.now())
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active])
  return now
}

/**
 * Flat trireme drawn on the map, heading along its lane: a hull, a mast, a square sail
 * and its oars, in solid colors.
 *
 * @param props - Component props.
 * @param props.x - Horizontal position.
 * @param props.y - Vertical position.
 * @param props.heading - Heading in degrees.
 * @param props.enemy - Whether the fleet threatens the player.
 * @param props.scale - Size factor.
 * @returns The ship.
 */
function Trireme({
  x,
  y,
  heading,
  enemy,
  scale = 1.4,
}: {
  x: number
  y: number
  heading: number
  enemy: boolean
  scale?: number
}) {
  const flip = Math.abs(heading) > 90 ? ' scale(1,-1)' : ''
  const hull = enemy ? SEA.enemy : SEA.ink
  return (
    <g transform={`translate(${x} ${y}) rotate(${heading})${flip} scale(${scale})`}>
      {[-14, -7, 0, 7, 14].map((ox) => (
        <rect
          key={ox}
          x={ox - 1}
          y={2}
          width={2}
          height={8}
          fill={hull}
          transform={`rotate(20 ${ox} 2)`}
        />
      ))}
      <path d="M-22 -4 H22 L28 -9 L24 4 H-18 Z" fill={hull} />
      <rect x={-2} y={-30} width={2.4} height={27} fill={SEA.ink} />
      <rect x={-12} y={-27} width={22} height={17} fill={enemy ? SEA.ink : SEA.own} />
      <rect x={-12} y={-21} width={22} height={4} fill={enemy ? SEA.enemy : SEA.gold} />
    </g>
  )
}

/**
 * Tactic chooser: the three tactics as cards, each naming the tactic it beats; the gold
 * highlight slides from one card to the other. It serves both the tactic of a fleet and
 * the posture of a harbor.
 *
 * @param props - Component props.
 * @param props.value - Selected tactic.
 * @param props.onChange - Called with the chosen tactic.
 * @param props.caption - Name of the choice, read by screen readers.
 * @returns The tactic chooser.
 */
function TacticPicker({
  value,
  onChange,
  caption,
}: {
  value: Tactic
  onChange: (tactic: Tactic) => void
  caption: string
}) {
  return (
    <fieldset className={styles.tactics}>
      <legend className="sr-only">{caption}</legend>
      {TACTICS.map((tactic) => (
        <button
          key={tactic}
          type="button"
          className={styles.tactic}
          aria-pressed={value === tactic}
          onClick={() => onChange(tactic)}
        >
          {value === tactic && (
            <m.span className={styles.glow} layoutId={`tactic-${caption}`} transition={SPRING} />
          )}
          <Icon kind={tactic} size={28} />
          <strong>{look(tactic).label}</strong>
          <small>bat {look(BEATS[tactic]).label.toLowerCase()}</small>
        </button>
      ))}
    </fieldset>
  )
}

/** Island drawn on the sea map. */
interface MapIsland {
  /** Selection it stands for, or null for the player's own village. */
  selection: Selection
  /** Name shown under the island. */
  name: string
  /** Position on the map. */
  point: MapPoint
  /** Kind of island, which sets its look. */
  kind: 'home' | 'village' | 'pirates'
  /** Identifier drawing its shape. */
  shapeId: string
}

/**
 * Tells whether an island is the selected target.
 *
 * @param island - Island of the map.
 * @param selected - Selected target.
 * @returns True if it is selected.
 */
const isTarget = (island: MapIsland, selected: Selection) =>
  island.selection !== null &&
  selected !== null &&
  island.selection.kind === selected.kind &&
  island.selection.id === selected.id

/**
 * Sea map: flat islands, sea lanes and fleets moving in real time. The islands are
 * buttons laid over the drawing, so they can be reached with the keyboard. On a phone the
 * map keeps a readable size and slides under the finger, starting on the player's port.
 *
 * @param props - Component props.
 * @param props.userId - Signed-in player.
 * @param props.targets - Targets and home village.
 * @param props.raids - Raids of the player.
 * @param props.selected - Selected target.
 * @param props.onSelect - Called with the target clicked.
 * @returns The sea map.
 */
function SeaMap({
  userId,
  targets,
  raids,
  selected,
  onSelect,
}: {
  userId: string
  targets: TargetsList
  raids: RaidSummary[]
  selected: Selection
  onSelect: (selection: Selection) => void
}) {
  const islands = useMemo(() => {
    const placed: MapIsland[] = [
      ...(targets.home
        ? [
            {
              selection: null,
              name: targets.home.name,
              point: targets.home.map,
              kind: 'home' as const,
              shapeId: userId,
            },
          ]
        : []),
      ...targets.villages.map((village) => ({
        selection: { kind: 'village' as const, id: village.playerId },
        name: village.name,
        point: village.map,
        kind: 'village' as const,
        shapeId: village.playerId,
      })),
      ...targets.islands.map((island) => ({
        selection: { kind: 'pirates' as const, id: island.islandId },
        name: island.name,
        point: island.map,
        kind: 'pirates' as const,
        shapeId: island.islandId,
      })),
    ]
    return relax(placed)
  }, [targets, userId])

  const scene = useMemo((): SeaSceneState => {
    const where = new Map(islands.map((island) => [island.shapeId, island.point]))
    const pointOf = (id: string) =>
      toWorld(where.get(id) ?? PIRATE_ISLANDS.find((i) => i.id === id)?.map ?? mapPositionOf(id))
    const home = pointOf(userId)
    return {
      islands: islands.map((island) => ({
        id: island.shapeId,
        kind: island.kind,
        name: island.name,
        at: toWorld(island.point),
        selected: isTarget(island, selected),
      })),
      fleets: raids
        .filter((raid) => raid.status === 'at-sea' || raid.status === 'provisioning')
        .map((raid) => ({
          id: raid.raidId,
          lane:
            raid.role === 'defender'
              ? laneOf(raid.raidId, pointOf(raid.attackerId), home)
              : laneOf(raid.raidId, home, pointOf(raid.targetId)),
          enemy: raid.role === 'defender',
          ships: raid.ships,
          sailing: raid.status === 'at-sea',
          sailedAt: raid.sailedAt,
          arrivesAt: raid.arrivesAt,
        })),
    }
  }, [islands, raids, selected, userId])

  const scroller = useRef<HTMLDivElement>(null)
  const homeShare = islands.find((island) => island.kind === 'home')?.point.x
  useCenteredScroll(scroller, homeShare === undefined ? 0.5 : homeShare / 100)

  const atSea = scene.fleets.length
  return (
    <div className={styles.chart}>
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.sea}>
          <SceneHost
            load={loadSea}
            state={scene}
            handlers={NO_HANDLERS}
            className={styles.map}
            label={`Carte des mers : ${islands.length} îles, ${atSea} flotte${atSea > 1 ? 's' : ''} en mer`}
          />

          {islands.map((island) => (
            <button
              key={`${island.kind}-${island.shapeId}`}
              type="button"
              className={styles.hotspot}
              data-kind={island.kind}
              style={{ left: `${island.point.x}%`, top: `${island.point.y}%` }}
              disabled={!island.selection}
              aria-pressed={isTarget(island, selected)}
              aria-label={
                island.kind === 'home' ? `Votre village : ${island.name}` : `Cibler ${island.name}`
              }
              onClick={() => island.selection && onSelect(island.selection)}
            >
              <Icon
                kind={
                  island.kind === 'home'
                    ? 'village'
                    : island.kind === 'pirates'
                      ? 'pirates'
                      : 'harbor'
                }
                size="68%"
              />
            </button>
          ))}
        </div>
      </div>

      <ul className={styles.legend} aria-hidden="true">
        <li>
          <Icon kind="village" /> Votre village
        </li>
        <li>
          <Icon kind="harbor" /> Autres joueurs
        </li>
        <li>
          <Icon kind="pirates" /> Pirates
        </li>
      </ul>
    </div>
  )
}

/**
 * Full screen battle report, shown when a report reaches the harbor in real time: the
 * report drops into place, the two ships ram each other, the verdict is stamped, then
 * the plunder comes in piece by piece.
 *
 * @param props - Component props.
 * @param props.report - Data of the `BattleReported` event.
 * @param props.onClose - Called to close the report.
 * @returns The battle report.
 */
function BattleOverlay({
  report,
  onClose,
}: {
  report: Record<string, unknown>
  onClose: () => void
}) {
  const won = report.won === true
  const attacker = report.role === 'attacker'
  useEffect(() => {
    const timer = setTimeout(onClose, 7000)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const loot = (report.loot ?? {}) as Amounts
  const spoils = Object.entries(loot).filter(([, amount]) => (amount ?? 0) > 0)
  const lootList = (
    <span className={styles.amounts}>
      {spoils.map(([resource, amount], index) => (
        <m.span
          key={resource}
          className={styles.lootItem}
          initial={{ opacity: 0, y: 14, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING, delay: 1 + index * 0.15 }}
        >
          <Entity kind={resource} /> {amount}
        </m.span>
      ))}
      {spoils.length === 0 && 'rien'}
    </span>
  )
  return (
    <m.div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Rapport de bataille"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <m.div
        className={styles.report}
        data-win={won}
        initial={{ y: -160, scale: 0.85, rotate: -3 }}
        animate={{ y: 0, scale: 1, rotate: 0 }}
        exit={{ y: 80, opacity: 0 }}
        transition={DROP}
      >
        <div className={styles.clash} aria-hidden="true">
          <m.svg
            className={styles.clashLeft}
            viewBox="-40 -40 80 56"
            aria-hidden="true"
            initial={{ x: '-90%' }}
            animate={{ x: ['-90%', '12%', '0%'] }}
            transition={{ duration: 0.7, times: [0, 0.75, 1], delay: 0.2 }}
          >
            <Trireme x={0} y={0} heading={0} enemy={false} scale={1} />
          </m.svg>
          <m.svg
            className={styles.clashRight}
            viewBox="-40 -40 80 56"
            aria-hidden="true"
            style={{ scaleX: -1 }}
            initial={{ x: '90%' }}
            animate={{ x: ['90%', '-12%', '0%'] }}
            transition={{ duration: 0.7, times: [0, 0.75, 1], delay: 0.2 }}
          >
            <Trireme x={0} y={0} heading={0} enemy={true} scale={1} />
          </m.svg>
          <m.span
            className={styles.shock}
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.72, ease: 'easeOut' }}
          />
        </div>
        <m.p
          className={styles.verdict}
          initial={{ scale: 2.6, opacity: 0, rotate: -14 }}
          animate={{ scale: 1, opacity: 1, rotate: -4 }}
          transition={{ type: 'spring', stiffness: 520, damping: 15, delay: 0.75 }}
        >
          {won ? 'Victoire' : 'Défaite'}
        </m.p>
        <p className={styles.spoils}>
          {attacker
            ? `Votre flotte contre ${String(report.opponentName)} : `
            : `${String(report.opponentName)} a attaqué votre port : `}
          {attacker ? (
            won ? (
              <>butin {lootList}</>
            ) : (
              'la flotte a sombré.'
            )
          ) : won ? (
            "l'assaut est repoussé."
          ) : (
            <>pillé {lootList}</>
          )}
        </p>
        <button type="button" onClick={onClose}>
          Fermer le rapport
        </button>
      </m.div>
    </m.div>
  )
}

/**
 * Fleet screen: key figures, the enemy fleet alarm, the sea map, the war council that
 * launches raids, the harbor posture and the logbook of raids.
 *
 * @param props - Component props.
 * @param props.userId - Signed-in player, naming the harbor channel.
 * @returns The fleet screen.
 */
export function FleetScreen({ userId }: { userId: string }) {
  const [targets, setTargets] = useState<TargetsList | null>(null)
  const [raids, setRaids] = useState<RaidSummary[]>([])
  const [harbor, setHarbor] = useState<HarborView | null>(null)
  const [selected, setSelected] = useState<Selection>(null)

  /**
   * Targets an island. On a phone, where the war council sits under the map, the screen
   * slides to the council so the player prepares the raid right away.
   *
   * @param selection - Targeted island.
   */
  const aim = useCallback((selection: Selection) => {
    setSelected(selection)
    if (window.matchMedia('(max-width: 960px)').matches) {
      requestAnimationFrame(() =>
        document
          .getElementById('council')
          ?.closest('section')
          ?.scrollIntoView({ behavior: 'smooth' }),
      )
    }
  }, [])
  const [ships, setShips] = useState(3)
  const [tactic, setTactic] = useState<Tactic>('ram')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const closeReport = useCallback(() => setReport(null), [])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const latest = useRef(0)

  /**
   * Reloads the targets, the raids and the harbor; on the server, reading settles the
   * fleets past their arrival and dispatches the outbox. Only the latest reload is shown:
   * a slower, older one never overwrites the result of a search.
   *
   * @returns Resolves once the three reads are received.
   */
  const refresh = useCallback(async () => {
    const call = ++latest.current
    const [t, r, h] = await Promise.all([
      client.targets.$get({ query: search ? { search } : {} }),
      client.raids.$get(),
      client.harbor.$get(),
    ])
    const [targetsBody, raidsBody, harborBody] = await Promise.all([
      t.ok ? t.json() : null,
      r.ok ? r.json() : null,
      h.ok ? h.json() : null,
    ])
    if (call !== latest.current) return
    if (targetsBody) setTargets(targetsBody)
    if (raidsBody) setRaids(raidsBody.raids)
    if (harborBody) setHarbor(harborBody)
  }, [search])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(harborChannel(userId), (event: ChannelEvent) => {
    if (event.type === 'BattleReported') {
      setReport(event.data)
      window.dispatchEvent(new Event(VILLAGE_CHANGED))
    }
    refresh()
  })

  const nextArrival = useMemo(() => {
    const times = raids.filter((raid) => raid.status === 'at-sea').map((raid) => raid.arrivesAt)
    return times.length > 0 ? Math.min(...times) : null
  }, [raids])

  useEffect(() => {
    if (nextArrival === null) return
    const timer = setTimeout(refresh, Math.max(500, nextArrival - Date.now() + 600))
    return () => clearTimeout(timer)
  }, [nextArrival, refresh])

  const now = useNow(nextArrival !== null)
  const incoming = raids.filter((raid) => raid.role === 'defender' && raid.status === 'at-sea')

  const village =
    selected?.kind === 'village'
      ? targets?.villages.find((v) => v.playerId === selected.id)
      : undefined
  const island =
    selected?.kind === 'pirates'
      ? targets?.islands.find((i) => i.islandId === selected.id)
      : undefined
  const target = village ?? island
  const out = raids.filter(
    (raid) =>
      raid.role === 'attacker' && ['provisioning', 'at-sea', 'plundering'].includes(raid.status),
  ).length

  /** Launches a raid against the selected target, and announces the equipment spent. */
  async function launch() {
    if (!selected) return
    setBusy(true)
    const res = await client.raids.$post({
      json: {
        target:
          selected.kind === 'village'
            ? { kind: 'village', playerId: selected.id }
            : { kind: 'pirates', islandId: selected.id },
        ships,
        tactic,
      },
    })
    const body = await res.json()
    setBusy(false)
    if ('error' in body) {
      setMessage({
        text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Ordre refusé.',
        error: true,
      })
    } else {
      const view = body.view as RaidView
      setMessage(
        view.status === 'cancelled'
          ? { text: 'Armement impossible : votre village manque de ressources.', error: true }
          : { text: `La flotte a hissé les voiles vers ${view.target.name}.`, error: false },
      )
      window.dispatchEvent(new Event(VILLAGE_CHANGED))
    }
    refresh()
  }

  /**
   * Recalls one of the player's fleets, and announces the equipment refunded.
   *
   * @param raidId - Raid identifier.
   */
  async function recall(raidId: string) {
    const res = await client.raids[':id'].recall.$post({ param: { id: raidId } })
    const body = await res.json()
    setMessage(
      'error' in body
        ? { text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Ordre refusé.', error: true }
        : { text: "Demi-tour ! L'équipement rentre au village.", error: false },
    )
    if (!('error' in body)) window.dispatchEvent(new Event(VILLAGE_CHANGED))
    refresh()
  }

  /**
   * Chooses the posture of the player's harbor.
   *
   * @param posture - New posture.
   */
  async function choosePosture(posture: Tactic) {
    const res = await client.harbor.posture.$put({ json: { posture } })
    if (res.ok) setHarbor(await res.json())
  }

  const cost = equipmentCost(ships)
  const hold = holdOf(ships)

  return (
    <>
      <header className="row">
        <h1>
          <Entity kind="fleet" /> La Flotte
        </h1>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </header>

      <dl className={styles.figures}>
        <div>
          <dt>Défense du port</dt>
          <dd>{targets?.home?.defense ?? '-'}</dd>
        </div>
        <div>
          <dt>Flottes en mer</dt>
          <dd>
            {out} / {MAX_RAIDS_AT_SEA}
          </dd>
        </div>
        <div>
          <dt>Posture</dt>
          <dd>
            {harbor ? (
              <>
                <Icon kind={harbor.holding} /> {look(harbor.holding).label}
              </>
            ) : (
              '-'
            )}
          </dd>
        </div>
        <div>
          <dt>Prochaine arrivée</dt>
          <dd>{nextArrival === null ? '-' : clock(nextArrival - now)}</dd>
        </div>
      </dl>

      <AnimatePresence initial={false}>
        {incoming.map((raid) => (
          <m.div
            key={raid.raidId}
            className={styles.alarm}
            role="status"
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: [0, -12, 12, -8, 8, -4, 0] }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
            transition={{ ...DROP, x: { duration: 0.6, delay: 0.25 } }}
          >
            <Icon kind="trireme" size={40} />
            <div>
              <strong>Flotte ennemie en approche</strong>
              <span>
                {raid.attackerName} lance {raid.ships} trirème{raid.ships > 1 ? 's' : ''} sur votre
                port. Changez de posture tant qu'il est temps.
              </span>
            </div>
            <span className={styles.alarmClock}>{clock(raid.arrivesAt - now)}</span>
          </m.div>
        ))}
      </AnimatePresence>

      {targets && !targets.home && (
        <p className="error">
          Fondez d'abord votre village : sans port, aucune flotte ne peut appareiller.
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.column}>
          <form
            className={styles.search}
            aria-label="Recherche de port"
            onSubmit={(event) => {
              event.preventDefault()
              const term = draft.trim()
              if (term === search) refresh()
              else setSearch(term)
            }}
          >
            <label htmlFor="harbor-search" className="sr-only">
              Rechercher un port
            </label>
            <input
              id="harbor-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Rechercher un port par son nom"
              maxLength={30}
            />
            <button type="submit">Scruter l'horizon</button>
            {search && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDraft('')
                  setSearch('')
                }}
              >
                Ports voisins
              </button>
            )}
          </form>

          {targets ? (
            <SeaMap
              userId={userId}
              targets={targets}
              raids={raids}
              selected={selected}
              onSelect={aim}
            />
          ) : (
            <div className={styles.chart} aria-busy="true">
              <div className={styles.sea} />
            </div>
          )}

          <section className="panel" aria-labelledby="logbook">
            <h2 id="logbook">Journal de bord</h2>
            {raids.length === 0 ? (
              <p className="muted">Aucun raid pour l'instant. La mer est calme.</p>
            ) : (
              <ul className={styles.logbook}>
                <AnimatePresence initial={false}>
                  {raids.map((raid) => {
                    const attacker = raid.role === 'attacker'
                    const tone =
                      raid.status === 'at-sea' || raid.status === 'provisioning'
                        ? 'sea'
                        : raid.victory === null
                          ? 'none'
                          : raid.victory === attacker
                            ? 'win'
                            : 'loss'
                    return (
                      <m.li
                        key={raid.raidId}
                        className={styles.entry}
                        data-tone={tone}
                        layout
                        initial={{ opacity: 0, x: -40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={SPRING}
                      >
                        <Icon
                          kind={
                            raid.targetKind === 'pirates'
                              ? 'pirates'
                              : attacker
                                ? 'fleet'
                                : 'harbor'
                          }
                          size={32}
                        />
                        <span>
                          <strong>
                            {attacker
                              ? `Raid contre ${raid.targetName}`
                              : `Raid de ${raid.attackerName}`}
                          </strong>
                          <span className={styles.meta}>
                            {raid.ships} trirème{raid.ships > 1 ? 's' : ''}
                            {raid.tactic && ` · ${look(raid.tactic).label}`}
                            {raid.status === 'at-sea' &&
                              raid.arrivesAt > now &&
                              ` · arrivée ${new Date(raid.arrivesAt).toLocaleTimeString('fr-FR')}`}
                            {raid.loot && (
                              <>
                                {' · '}
                                {attacker ? 'butin' : 'perte'} <AmountsText amounts={raid.loot} />
                              </>
                            )}
                          </span>
                        </span>
                        {attacker && raid.status === 'at-sea' && raid.arrivesAt > Date.now() ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => recall(raid.raidId)}
                          >
                            Rappeler
                          </button>
                        ) : (
                          <span className={styles.chip} data-tone={tone}>
                            {(attacker ? ATTACK_STATUS : DEFENSE_STATUS)[raid.status]}
                          </span>
                        )}
                      </m.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>

        <div className={styles.column}>
          <section className="panel" aria-labelledby="council">
            <h2 id="council">Conseil de guerre</h2>
            {target ? (
              <div className="stack">
                <m.div
                  key={selected ? `${selected.kind}-${selected.id}` : 'none'}
                  className={styles.target}
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={SPRING}
                >
                  <Icon kind={island ? 'pirates' : 'harbor'} size={40} />
                  <div>
                    <strong>{target.name}</strong>
                    <span className="muted">
                      Défense {target.defense} · traversée {target.travelMinutes} min
                    </span>
                    {island && (
                      <span className="muted">
                        Trésor : <AmountsText amounts={island.treasure} />
                        {island.raidedToday && " · déjà attaquée aujourd'hui"}
                      </span>
                    )}
                  </div>
                </m.div>

                <fieldset className={styles.sizes}>
                  <legend>Trirèmes</legend>
                  <div>
                    {FLEET_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={styles.size}
                        data-on={size <= ships}
                        aria-label={`${size} trirème${size > 1 ? 's' : ''}`}
                        aria-pressed={size === ships}
                        onClick={() => setShips(size)}
                      >
                        {size === ships && (
                          <m.span
                            className={styles.glow}
                            layoutId="fleet-size"
                            transition={SPRING}
                          />
                        )}
                        <span>{size}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <dl className={styles.ledger}>
                  <div>
                    <dt>Coût</dt>
                    <dd>
                      <AmountsText amounts={cost} />
                    </dd>
                  </div>
                  <div>
                    <dt>Cales</dt>
                    <dd>
                      <AmountsText amounts={hold} />
                    </dd>
                  </div>
                </dl>

                <TacticPicker value={tactic} onChange={setTactic} caption="Votre tactique" />

                <table className={styles.forecast}>
                  <caption className="sr-only">Prévision de bataille</caption>
                  <thead>
                    <tr>
                      <th scope="col">Si le défenseur tient</th>
                      <th scope="col">Attaque contre défense</th>
                      <th scope="col">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TACTICS.map((posture) => {
                      const battle = fight(ships, tactic, posture, target.defense)
                      const scale = Math.max(battle.attack, battle.defense) * 1.15
                      return (
                        <tr key={posture}>
                          <td>
                            <Icon kind={posture} /> {look(posture).label}
                          </td>
                          <td>
                            <span className={styles.bar} data-win={battle.victory}>
                              <span style={{ width: `${(battle.attack / scale) * 100}%` }} />
                              <i style={{ left: `${(battle.defense / scale) * 100}%` }} />
                            </span>
                          </td>
                          <td className={styles.verdictCell} data-win={battle.victory}>
                            {battle.attack} {battle.victory ? 'gagne' : 'perd'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="muted">
                  {island
                    ? 'Le capitaine pirate pare la tactique que vous employez le plus contre lui.'
                    : 'Selon la posture que tiendra le défenseur à votre arrivée.'}
                </p>

                <button
                  type="button"
                  className="primary"
                  disabled={busy || !targets?.home}
                  onClick={launch}
                >
                  Hisser les voiles
                </button>
              </div>
            ) : (
              <p className="muted">Choisissez une île sur la carte pour préparer un raid.</p>
            )}
            {message && (
              <p className={message.error ? 'error' : 'ok'} aria-live="polite">
                {message.text}
              </p>
            )}
          </section>

          <section className="panel" aria-labelledby="harbor">
            <h2 id="harbor">Votre port</h2>
            {harbor && (
              <TacticPicker
                value={harbor.holding}
                onChange={choosePosture}
                caption="Posture du port"
              />
            )}
            <p className="muted">
              Un village sans posture choisie défend en blocus. Chaque amélioration de bâtiment
              ajoute 5 à sa défense.
            </p>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {report && <BattleOverlay key="report" report={report} onClose={closeReport} />}
      </AnimatePresence>
    </>
  )
}
