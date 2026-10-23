'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { Icon } from '@/ui/icons'
import { look } from '@/ui/theme'
import type { FleetApi } from './api'
import {
  type Amounts,
  BEATS,
  equipmentCost,
  fight,
  type HarborView,
  harborChannel,
  hash,
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

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<FleetApi>('/api/fleet')

/** Width of the sea map, in SVG units. */
const MAP_W = 1000
/** Height of the sea map, in SVG units. */
const MAP_H = 625

/** Positions of the lines of the map grid, every 125 units. */
const GRID = { rows: [125, 250, 375, 500], columns: [125, 250, 375, 500, 625, 750, 875] }
/** Possible fleet sizes, from one trireme to the largest fleet. */
const FLEET_SIZES = Array.from({ length: MAX_SHIPS }, (_, i) => i + 1)

/** Flat colors of the sea map. */
const SEA = {
  water: '#2b6f97',
  shallow: '#3a82ac',
  grid: '#33789f',
  sand: '#e8d3a2',
  grass: '#7baf5c',
  rock: '#4a4f5a',
  rockTop: '#6a707c',
  gold: '#e8a93b',
  label: '#fbf9f4',
  ink: '#1b2333',
  own: '#fbf9f4',
  enemy: '#c93c32',
  lane: '#d6e2ee',
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
 * Converts a map position, in percent, into SVG coordinates.
 *
 * @param point - Position in percent.
 * @returns The SVG coordinates.
 */
const toSvg = (point: MapPoint) => ({ x: (point.x / 100) * MAP_W, y: (point.y / 100) * MAP_H })

/**
 * Formats a duration as minutes and seconds.
 *
 * @param ms - Duration in milliseconds.
 * @returns The duration, such as "02:31".
 */
function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Builds the outline of an island: a closed, smooth blob whose shape is drawn from the
 * island identifier, so it never changes.
 *
 * @param id - Identifier of the island or of the village owner.
 * @param cx - Horizontal center.
 * @param cy - Vertical center.
 * @param radius - Mean radius.
 * @returns The SVG path.
 */
function islandPath(id: string, cx: number, cy: number, radius: number) {
  const seed = hash(id)
  const count = 9
  const points = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    const wobble = 0.72 + (((seed >>> (i * 3)) & 7) / 7) * 0.5
    return {
      x: cx + Math.cos(angle) * radius * wobble,
      y: cy + Math.sin(angle) * radius * wobble * 0.8,
    }
  })
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  const start = mid(points[count - 1], points[0])
  let d = `M${start.x.toFixed(1)} ${start.y.toFixed(1)}`
  for (let i = 0; i < count; i++) {
    const end = mid(points[i], points[(i + 1) % count])
    d += ` Q${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
  }
  return `${d} Z`
}

/** Sea lane of a fleet: a curved route between two points. */
interface Lane {
  /** Departure point. */
  from: { x: number; y: number }
  /** Control point of the curve. */
  bend: { x: number; y: number }
  /** Arrival point. */
  to: { x: number; y: number }
}

/**
 * Builds the curved sea lane of a fleet, bent to one side drawn from the raid identifier.
 *
 * @param raidId - Raid identifier.
 * @param from - Departure point.
 * @param to - Arrival point.
 * @returns The lane.
 */
function laneOf(
  raidId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Lane {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const side = hash(raidId) % 2 === 0 ? 1 : -1
  return {
    from,
    to,
    bend: { x: (from.x + to.x) / 2 - dy * 0.22 * side, y: (from.y + to.y) / 2 + dx * 0.22 * side },
  }
}

/**
 * Finds the point and heading of a fleet along its lane.
 *
 * @param lane - Sea lane.
 * @param t - Progress, from 0 to 1.
 * @returns The point and the heading in degrees.
 */
function along({ from, bend, to }: Lane, t: number) {
  const u = 1 - t
  const x = u * u * from.x + 2 * u * t * bend.x + t * t * to.x
  const y = u * u * from.y + 2 * u * t * bend.y + t * t * to.y
  const tx = 2 * u * (bend.x - from.x) + 2 * t * (to.x - bend.x)
  const ty = 2 * u * (bend.y - from.y) + 2 * t * (to.y - bend.y)
  return { x, y, heading: (Math.atan2(ty, tx) * 180) / Math.PI }
}

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
 * Tactic chooser: the three tactics as flat cards, each naming the tactic it beats. It
 * serves both the tactic of a fleet and the posture of a harbor.
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
 * Moves the islands of the players apart, so that no two islands overlap on the map.
 * Pirate islands never move; the others are pushed away from each other, always the same
 * way for the same islands.
 *
 * @param islands - Islands at their drawn position.
 * @returns The islands at their final position.
 */
function relax(islands: MapIsland[]): MapIsland[] {
  const points = islands.map((island) => ({
    ...toSvg(island.point),
    fixed: island.kind === 'pirates',
  }))
  const gap = 120
  for (let round = 0; round < 60; round++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        const dx = b.x - a.x || 0.5
        const dy = b.y - a.y || 0.5
        const distance = Math.hypot(dx, dy)
        if (distance >= gap) continue
        const push = (gap - distance) / (a.fixed || b.fixed ? 1 : 2)
        const ux = dx / distance
        const uy = dy / distance
        if (!a.fixed) {
          a.x -= ux * push
          a.y -= uy * push
        }
        if (!b.fixed) {
          b.x += ux * push
          b.y += uy * push
        }
      }
    }
    for (const point of points) {
      point.x = Math.min(MAP_W - 70, Math.max(70, point.x))
      point.y = Math.min(MAP_H - 70, Math.max(60, point.y))
    }
  }
  return islands.map((island, i) => ({
    ...island,
    point: { x: (points[i].x / MAP_W) * 100, y: (points[i].y / MAP_H) * 100 },
  }))
}

/**
 * Sea map: flat islands, sea lanes and fleets moving in real time. The islands are
 * buttons laid over the drawing, so they can be reached with the keyboard.
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
  const moving = raids.filter((raid) => raid.status === 'at-sea' || raid.status === 'provisioning')
  const now = useNow(moving.length > 0)

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
  const islands = relax(placed)
  const where = new Map(islands.map((island) => [island.shapeId, island.point]))

  /**
   * Tells whether an island is the selected target.
   *
   * @param island - Island of the map.
   * @returns True if it is selected.
   */
  const isSelected = (island: MapIsland) =>
    island.selection !== null &&
    selected !== null &&
    island.selection.kind === selected.kind &&
    island.selection.id === selected.id

  /**
   * Finds where a raid sails from and to.
   *
   * @param raid - Raid at sea.
   * @returns The lane in SVG coordinates.
   */
  const laneFor = (raid: RaidSummary) => {
    const pointOf = (id: string) =>
      where.get(id) ?? PIRATE_ISLANDS.find((i) => i.id === id)?.map ?? mapPositionOf(id)
    const home = toSvg(pointOf(userId))
    if (raid.role === 'defender') return laneOf(raid.raidId, toSvg(pointOf(raid.attackerId)), home)
    return laneOf(raid.raidId, home, toSvg(pointOf(raid.targetId)))
  }

  return (
    <div className={styles.sea}>
      <svg className={styles.map} viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
        <rect width={MAP_W} height={MAP_H} fill={SEA.water} />
        {GRID.rows.map((y) => (
          <rect key={`h${y}`} x={0} y={y} width={MAP_W} height={1.5} fill={SEA.grid} />
        ))}
        {GRID.columns.map((x) => (
          <rect key={`v${x}`} x={x} y={0} width={1.5} height={MAP_H} fill={SEA.grid} />
        ))}

        <g transform="translate(70 560)">
          <circle r={34} fill={SEA.shallow} />
          <path d="M0 -30 L7 0 L0 30 L-7 0 Z" fill={SEA.label} />
          <path d="M0 -30 L7 0 L-7 0 Z" fill={SEA.enemy} />
          <text y={-38} textAnchor="middle" className={styles.compass}>
            N
          </text>
        </g>

        {islands.map((island) => {
          const { x, y } = toSvg(island.point)
          const radius = island.kind === 'pirates' ? 44 : 36
          const top = island.kind === 'pirates' ? SEA.rockTop : SEA.grass
          const base = island.kind === 'pirates' ? SEA.rock : SEA.sand
          return (
            <g key={`${island.kind}-${island.shapeId}`}>
              <path d={islandPath(island.shapeId, x, y + 4, radius + 14)} fill={SEA.shallow} />
              <path d={islandPath(island.shapeId, x, y, radius)} fill={base} />
              <path d={islandPath(island.shapeId, x, y - 4, radius * 0.72)} fill={top} />
              {island.kind === 'home' && (
                <circle
                  cx={x}
                  cy={y}
                  r={radius + 20}
                  fill="none"
                  stroke={SEA.gold}
                  strokeWidth={4}
                />
              )}
              {isSelected(island) && (
                <circle
                  cx={x}
                  cy={y}
                  r={radius + 22}
                  fill="none"
                  stroke={SEA.label}
                  strokeWidth={4}
                  strokeDasharray="14 10"
                />
              )}
              <text className={styles.islandLabel} x={x} y={y + radius + 30} textAnchor="middle">
                {island.name}
              </text>
            </g>
          )
        })}

        {moving.map((raid) => {
          const lane = laneFor(raid)
          const enemy = raid.role === 'defender'
          const span = raid.arrivesAt - raid.sailedAt
          const t =
            raid.status === 'at-sea' && span > 0
              ? Math.min(1, Math.max(0, (now - raid.sailedAt) / span))
              : 0
          const ship = along(lane, t)
          const d = `M${lane.from.x} ${lane.from.y} Q${lane.bend.x} ${lane.bend.y} ${lane.to.x} ${lane.to.y}`
          const color = enemy ? SEA.enemy : SEA.lane
          const label =
            raid.status === 'at-sea'
              ? `${raid.ships} navire${raid.ships > 1 ? 's' : ''} · ${clock(raid.arrivesAt - now)}`
              : 'Armement'
          return (
            <g key={raid.raidId}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeDasharray="2 12"
                strokeLinecap="round"
              />
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={5}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${t} 1`}
              />
              <circle
                cx={lane.to.x}
                cy={lane.to.y}
                r={60}
                fill="none"
                stroke={color}
                strokeWidth={3}
              />
              <Trireme x={ship.x} y={ship.y} heading={ship.heading} enemy={enemy} />
              <g transform={`translate(${ship.x} ${ship.y - 62})`}>
                <rect
                  x={-58}
                  y={-15}
                  width={116}
                  height={26}
                  rx={13}
                  fill={enemy ? SEA.enemy : SEA.ink}
                />
                <text className={styles.eta} y={4} textAnchor="middle">
                  {label}
                </text>
              </g>
            </g>
          )
        })}
      </svg>

      {islands.map((island) => (
        <button
          key={`${island.kind}-${island.shapeId}`}
          type="button"
          className={styles.hotspot}
          data-kind={island.kind}
          style={{ left: `${island.point.x}%`, top: `${island.point.y}%` }}
          disabled={!island.selection}
          aria-pressed={isSelected(island)}
          aria-label={
            island.kind === 'home' ? `Votre village : ${island.name}` : `Cibler ${island.name}`
          }
          onClick={() => island.selection && onSelect(island.selection)}
        >
          <Icon
            kind={
              island.kind === 'home' ? 'village' : island.kind === 'pirates' ? 'pirates' : 'harbor'
            }
            size="68%"
          />
        </button>
      ))}

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
 * Full screen battle report, shown when a report reaches the harbor in real time: two
 * flat ships meet, then the verdict and the plunder.
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
  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Rapport de bataille"
    >
      <div className={styles.report} data-win={won}>
        <div className={styles.clash} aria-hidden="true">
          <svg className={styles.clashLeft} viewBox="-40 -40 80 56" aria-hidden="true">
            <Trireme x={0} y={0} heading={0} enemy={false} scale={1} />
          </svg>
          <svg className={styles.clashRight} viewBox="-40 -40 80 56" aria-hidden="true">
            <Trireme x={0} y={0} heading={0} enemy={true} scale={1} />
          </svg>
        </div>
        <p className={styles.verdict}>{won ? 'Victoire' : 'Défaite'}</p>
        <p className={styles.spoils}>
          {attacker
            ? `Votre flotte contre ${String(report.opponentName)} : `
            : `${String(report.opponentName)} a attaqué votre port : `}
          {attacker ? (
            won ? (
              <>
                butin <AmountsText amounts={loot} />
              </>
            ) : (
              'la flotte a sombré.'
            )
          ) : won ? (
            "l'assaut est repoussé."
          ) : (
            <>
              pillé <AmountsText amounts={loot} />
            </>
          )}
        </p>
        <button type="button" onClick={onClose}>
          Fermer le rapport
        </button>
      </div>
    </div>
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
    if (event.type === 'BattleReported') setReport(event.data)
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

  /** Launches a raid against the selected target. */
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
    }
    refresh()
  }

  /**
   * Recalls one of the player's fleets.
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

      {incoming.map((raid) => (
        <div key={raid.raidId} className={styles.alarm} role="status">
          <Icon kind="trireme" size={40} />
          <div>
            <strong>Flotte ennemie en approche</strong>
            <span>
              {raid.attackerName} lance {raid.ships} trirème{raid.ships > 1 ? 's' : ''} sur votre
              port. Changez de posture tant qu'il est temps.
            </span>
          </div>
          <span className={styles.alarmClock}>{clock(raid.arrivesAt - now)}</span>
        </div>
      ))}

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
              onSelect={setSelected}
            />
          ) : (
            <div className={styles.sea} aria-busy="true" />
          )}

          <section className="panel" aria-labelledby="logbook">
            <h2 id="logbook">Journal de bord</h2>
            {raids.length === 0 ? (
              <p className="muted">Aucun raid pour l'instant. La mer est calme.</p>
            ) : (
              <ul className={styles.logbook}>
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
                    <li key={raid.raidId} className={styles.entry} data-tone={tone}>
                      <Icon
                        kind={
                          raid.targetKind === 'pirates' ? 'pirates' : attacker ? 'fleet' : 'harbor'
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
                        <button type="button" className="ghost" onClick={() => recall(raid.raidId)}>
                          Rappeler
                        </button>
                      ) : (
                        <span className={styles.chip} data-tone={tone}>
                          {(attacker ? ATTACK_STATUS : DEFENSE_STATUS)[raid.status]}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className={styles.column}>
          <section className="panel" aria-labelledby="council">
            <h2 id="council">Conseil de guerre</h2>
            {target ? (
              <div className="stack">
                <div className={styles.target}>
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
                </div>

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
                        {size}
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

      {report && <BattleOverlay report={report} onClose={closeReport} />}
    </>
  )
}
