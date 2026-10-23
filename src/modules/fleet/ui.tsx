'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { FleetApi } from './api'
import {
  type Amounts,
  equipmentCost,
  fight,
  type HarborView,
  harborChannel,
  hash,
  holdOf,
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

/** Heights of the horizontal lines of the map grid. */
const GRID_ROWS = Array.from({ length: 9 }, (_, i) => (i + 1) * 62.5)
/** Positions of the vertical lines of the map grid. */
const GRID_COLUMNS = Array.from({ length: 15 }, (_, i) => (i + 1) * 62.5)
/** Possible fleet sizes, from one trireme to the largest fleet. */
const FLEET_SIZES = Array.from({ length: MAX_SHIPS }, (_, i) => i + 1)

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
 * @returns The amounts with their icons, or a dash when empty.
 */
function AmountsText({ amounts }: { amounts: Amounts }) {
  const entries = Object.entries(amounts).filter(([, amount]) => (amount ?? 0) > 0)
  if (entries.length === 0) return <>rien</>
  return (
    <>
      {entries.map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
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
 * Trireme drawn on the map, heading along its lane.
 *
 * @param props - Component props.
 * @param props.x - Horizontal position.
 * @param props.y - Vertical position.
 * @param props.heading - Heading in degrees.
 * @param props.enemy - Whether the fleet threatens the player.
 * @returns The ship.
 */
function Trireme({
  x,
  y,
  heading,
  enemy,
}: {
  x: number
  y: number
  heading: number
  enemy: boolean
}) {
  const flip = Math.abs(heading) > 90 ? ' scale(1,-1)' : ''
  const hull = enemy ? '#ff5a6a' : '#f2c14e'
  return (
    <g
      className={styles.ship}
      data-enemy={enemy}
      transform={`translate(${x} ${y}) rotate(${heading})${flip} scale(1.5)`}
    >
      <path
        d="M-22 -2 Q0 10 22 -2 L28 -7 L-24 -5 Z"
        fill={hull}
        stroke="#1b1203"
        strokeWidth="1.2"
      />
      {[-14, -7, 0, 7, 14].map((ox) => (
        <line key={ox} x1={ox} y1={3} x2={ox - 4} y2={10} stroke={hull} strokeWidth="1.4" />
      ))}
      <line x1={-2} y1={-6} x2={-2} y2={-30} stroke="#e8dcc0" strokeWidth="1.6" />
      <path
        d="M-1 -29 Q14 -19 -1 -9 Z"
        fill={enemy ? '#2a0710' : '#f3e6c8'}
        stroke={hull}
        strokeWidth="1"
      />
    </g>
  )
}

/**
 * Tactic triangle: the three tactics, each arrow pointing from a tactic to the one it
 * beats. It serves both the choice of the fleet tactic and of the harbor posture.
 *
 * @param props - Component props.
 * @param props.value - Selected tactic.
 * @param props.onChange - Called with the chosen tactic.
 * @param props.caption - Text shown at the center of the triangle.
 * @returns The tactic triangle.
 */
function TacticWheel({
  value,
  onChange,
  caption,
}: {
  value: Tactic
  onChange: (tactic: Tactic) => void
  caption: string
}) {
  const id = useId().replace(/:/g, '')
  const nodes: Record<Tactic, { x: number; y: number }> = {
    board: { x: 150, y: 52 },
    ram: { x: 252, y: 212 },
    blockade: { x: 48, y: 212 },
  }
  const arrows: [Tactic, Tactic][] = [
    ['board', 'ram'],
    ['ram', 'blockade'],
    ['blockade', 'board'],
  ]
  /**
   * Shortens a segment so it starts and ends at the edge of the nodes.
   *
   * @param a - Start node.
   * @param b - End node.
   * @returns The SVG coordinates of the arrow.
   */
  const shorten = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const k = 44 / len
    return {
      x1: a.x + (b.x - a.x) * k,
      y1: a.y + (b.y - a.y) * k,
      x2: b.x - (b.x - a.x) * k,
      y2: b.y - (b.y - a.y) * k,
    }
  }
  return (
    <fieldset className={styles.wheel}>
      <legend className="sr-only">{caption}</legend>
      <svg viewBox="0 0 300 268" aria-hidden="true">
        <defs>
          <marker
            id={`${id}-head`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 Z" fill="#f2c14e" />
          </marker>
          <filter id={`${id}-glow`}>
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {arrows.map(([from, to]) => (
          <line
            key={from}
            className={styles.arrow}
            markerEnd={`url(#${id}-head)`}
            {...shorten(nodes[from], nodes[to])}
          />
        ))}
        <text className={styles.wheelCaption} x="150" y="160" textAnchor="middle">
          {caption}
        </text>
        <text className={styles.wheelCaption} x="150" y="178" textAnchor="middle">
          la flèche bat
        </text>
        {TACTICS.map((tactic) => (
          <circle
            key={tactic}
            className={styles.nodeRing}
            data-on={value === tactic}
            cx={nodes[tactic].x}
            cy={nodes[tactic].y}
            r="36"
            filter={value === tactic ? `url(#${id}-glow)` : undefined}
          />
        ))}
      </svg>
      {TACTICS.map((tactic) => (
        <button
          key={tactic}
          type="button"
          aria-pressed={value === tactic}
          className={styles.node}
          data-on={value === tactic}
          style={{
            left: `${(nodes[tactic].x / 300) * 100}%`,
            top: `${(nodes[tactic].y / 268) * 100}%`,
          }}
          onClick={() => onChange(tactic)}
        >
          <span className={styles.nodeGlyph}>{look(tactic).glyph}</span>
          <span className={styles.nodeLabel}>{look(tactic).label}</span>
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
 * Sea map: islands, sea lanes and fleets moving in real time.
 *
 * @param props - Component props.
 * @param props.userId - Signed-in player.
 * @param props.targets - Targets and home village.
 * @param props.raids - Raids of the player.
 * @param props.selected - Selected target.
 * @param props.onSelect - Called with the target clicked.
 * @returns The animated sea map.
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
        <defs>
          <radialGradient id="sand" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#f6e2a8" />
            <stop offset="45%" stopColor="#7fbf6a" />
            <stop offset="100%" stopColor="#2f6b45" />
          </radialGradient>
          <radialGradient id="cursed" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#4a3a3a" />
            <stop offset="60%" stopColor="#2a1618" />
            <stop offset="100%" stopColor="#120708" />
          </radialGradient>
          <radialGradient id="crown" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fff2c4" />
            <stop offset="50%" stopColor="#d9a441" />
            <stop offset="100%" stopColor="#6b4a12" />
          </radialGradient>
          <linearGradient id="wake" x1="0" x2="1">
            <stop offset="0%" stopColor="#9fe7ff" stopOpacity="0" />
            <stop offset="100%" stopColor="#9fe7ff" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="wakeEnemy" x1="0" x2="1">
            <stop offset="0%" stopColor="#ff3b4e" stopOpacity="0" />
            <stop offset="100%" stopColor="#ff3b4e" stopOpacity="0.95" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {GRID_ROWS.map((y) => (
          <line key={`h${y}`} className={styles.gridLine} x1={0} x2={MAP_W} y1={y} y2={y} />
        ))}
        {GRID_COLUMNS.map((x) => (
          <line key={`v${x}`} className={styles.gridLine} y1={0} y2={MAP_H} x1={x} x2={x} />
        ))}

        <g className={styles.compass}>
          <circle cx="90" cy="535" r="52" fill="none" stroke="#f2c14e" strokeOpacity="0.5" />
          <circle
            cx="90"
            cy="535"
            r="40"
            fill="none"
            stroke="#f2c14e"
            strokeOpacity="0.3"
            strokeDasharray="2 6"
          />
          <path d="M90 478 L98 535 L90 592 L82 535 Z" fill="#f2c14e" fillOpacity="0.7" />
          <path d="M33 535 L90 527 L147 535 L90 543 Z" fill="#9fe7ff" fillOpacity="0.5" />
          <text x="90" y="472" textAnchor="middle" fill="#f2c14e" fontSize="14">
            N
          </text>
        </g>

        {islands.map((island) => {
          const { x, y } = toSvg(island.point)
          const radius = island.kind === 'pirates' ? 44 : 36
          const isSelected =
            island.selection !== null &&
            selected !== null &&
            island.selection.kind === selected.kind &&
            island.selection.id === selected.id
          const fill =
            island.kind === 'home'
              ? 'url(#crown)'
              : island.kind === 'pirates'
                ? 'url(#cursed)'
                : 'url(#sand)'
          return (
            <g
              key={`${island.kind}-${island.shapeId}`}
              className={styles.island}
              data-selected={isSelected}
            >
              <path className={styles.shore} d={islandPath(island.shapeId, x, y, radius + 10)} />
              <path
                d={islandPath(island.shapeId, x, y, radius)}
                fill={fill}
                stroke="#0b2236"
                strokeWidth="2"
              />
              {island.kind === 'pirates' && (
                <circle className={styles.pirateAura} cx={x} cy={y} r={radius + 6} />
              )}
              {island.kind === 'home' && (
                <circle className={styles.homeHalo} cx={x} cy={y} r={radius + 16} />
              )}
              {isSelected && <circle className={styles.reticle} cx={x} cy={y} r={radius + 24} />}
              <text className={styles.islandLabel} x={x} y={y + radius + 28} textAnchor="middle">
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
          return (
            <g key={raid.raidId}>
              <path className={styles.lane} data-enemy={enemy} d={d} />
              <path
                className={styles.wake}
                data-enemy={enemy}
                d={d}
                pathLength={1}
                strokeDasharray={`${t} 1`}
              />
              {enemy && <circle className={styles.sonar} cx={ship.x} cy={ship.y} r={22} />}
              <Trireme x={ship.x} y={ship.y} heading={ship.heading} enemy={enemy} />
              <text className={styles.eta} x={ship.x} y={ship.y - 38} textAnchor="middle">
                {raid.status === 'at-sea'
                  ? `${raid.ships} × ${look('trireme').glyph} ${clock(raid.arrivesAt - now)}`
                  : 'Armement...'}
              </text>
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
          aria-pressed={
            island.selection !== null &&
            selected !== null &&
            island.selection.kind === selected.kind &&
            island.selection.id === selected.id
          }
          aria-label={
            island.kind === 'home' ? `Votre village : ${island.name}` : `Cibler ${island.name}`
          }
          onClick={() => island.selection && onSelect(island.selection)}
        >
          {
            look(
              island.kind === 'home' ? 'village' : island.kind === 'pirates' ? 'pirates' : 'harbor',
            ).glyph
          }
        </button>
      ))}
      <div className={styles.legend}>
        <span>{look('village').glyph} votre village</span>
        <span>{look('harbor').glyph} autres joueurs</span>
        <span>{look('pirates').glyph} pirates</span>
      </div>
    </div>
  )
}

/**
 * Full screen battle report, shown when a report reaches the harbor in real time.
 *
 * @param props - Component props.
 * @param props.report - Data of the `BattleReported` event.
 * @param props.onClose - Called to close the report.
 * @returns The battle overlay.
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
      <button
        type="button"
        className={styles.overlayClose}
        onClick={onClose}
        aria-label="Fermer le rapport"
      />
      <div className={styles.overlayContent}>
        <div className={styles.clash}>
          <svg
            className={`${styles.clashShip} ${styles.clashLeft}`}
            viewBox="-40 -48 80 70"
            aria-hidden="true"
          >
            <Trireme x={0} y={0} heading={0} enemy={false} />
          </svg>
          <svg
            className={`${styles.clashShip} ${styles.clashRight}`}
            viewBox="-40 -48 80 70"
            aria-hidden="true"
          >
            <Trireme x={0} y={0} heading={0} enemy={true} />
          </svg>
          <span className={styles.shock} />
          <span className={styles.shock} />
          <div className={styles.verdictBig} data-win={won}>
            {won ? 'Victoire' : 'Défaite'}
          </div>
        </div>
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
        <p className={styles.hint}>Cliquez pour fermer</p>
      </div>
    </div>
  )
}

/**
 * Fleet screen: the sea map, the war council that launches raids, the harbor posture,
 * the enemy fleet alarm and the logbook of raids.
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

  /**
   * Reloads the targets, the raids and the harbor; on the server, reading settles the
   * fleets past their arrival and dispatches the outbox.
   *
   * @returns Resolves once the three reads are received.
   */
  const refresh = useCallback(async () => {
    const [t, r, h] = await Promise.all([
      client.targets.$get(),
      client.raids.$get(),
      client.harbor.$get(),
    ])
    if (t.ok) setTargets(await t.json())
    if (r.ok) setRaids((await r.json()).raids)
    if (h.ok) setHarbor(await h.json())
  }, [])

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

  const now = useNow(raids.some((raid) => raid.role === 'defender' && raid.status === 'at-sea'))
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
    <div className={styles.screen}>
      <div className={styles.backdrop} aria-hidden="true" />
      <header className={styles.hero}>
        <svg className={styles.heroArt} viewBox="0 0 400 220" aria-hidden="true">
          <g className={styles.bob}>
            <path
              d="M70 140 Q200 190 330 140 L350 125 L60 128 Z"
              fill="#f2c14e"
              stroke="#1b1203"
              strokeWidth="3"
            />
            <path d="M200 128 L200 20" stroke="#f3e6c8" strokeWidth="5" />
            <path d="M206 26 Q290 70 206 120 Z" fill="#f3e6c8" stroke="#f2c14e" strokeWidth="2" />
            <path
              d="M194 40 Q130 80 194 118 Z"
              fill="#e8dcc0"
              stroke="#f2c14e"
              strokeWidth="2"
              opacity="0.85"
            />
            <path d="M352 124 L392 116" stroke="#f2c14e" strokeWidth="6" strokeLinecap="round" />
          </g>
          <path className={styles.swell} d="M-40 170 Q20 150 80 170 T200 170 T320 170 T440 170" />
          <path className={styles.swell} d="M-40 192 Q20 172 80 192 T200 192 T320 192 T440 192" />
        </svg>
        <h1 className={styles.title}>
          <Entity kind="fleet" /> La Flotte
        </h1>
        <p className={styles.subtitle}>
          Armez vos trirèmes, lisez la posture de l'adversaire, et frappez là où il ne vous attend
          pas. Les îles pirates se souviennent de vos assauts.
        </p>
        <div className={styles.stats}>
          <span className={styles.stat}>
            Défense du port<strong>{targets?.home?.defense ?? '-'}</strong>
          </span>
          <span className={styles.stat}>
            Flottes en mer<strong>{out} / 2</strong>
          </span>
          <span className={styles.stat}>
            Posture
            <strong>
              {harbor ? `${look(harbor.holding).glyph} ${look(harbor.holding).label}` : '-'}
            </strong>
          </span>
          <span className={`${styles.stat} ${styles.live}`} data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        </div>
      </header>

      {incoming.map((raid) => (
        <div key={raid.raidId} className={styles.alarm} role="status">
          <strong>Flotte ennemie en approche</strong>
          <span className={styles.alarmLine}>
            {raid.attackerName} lance {raid.ships} trirème{raid.ships > 1 ? 's' : ''} sur votre
            port. Impact dans {clock(raid.arrivesAt - now)}. Changez de posture tant qu'il est
            temps.
          </span>
        </div>
      ))}

      {!targets?.home && targets && (
        <p className={styles.message} data-error="true">
          Fondez d'abord votre village : sans port, aucune flotte ne peut appareiller.
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
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

          <section className={styles.panel} aria-labelledby="logbook">
            <h2 id="logbook">Journal de bord</h2>
            {raids.length === 0 ? (
              <p className={styles.muted}>
                Aucun raid pour l'instant. La mer est calme... pour combien de temps ?
              </p>
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
                      <span className={styles.entryGlyph}>
                        {raid.targetKind === 'pirates'
                          ? look('pirates').glyph
                          : attacker
                            ? look('fleet').glyph
                            : look('harbor').glyph}
                      </span>
                      <span>
                        <span className={styles.entryTitle}>
                          {attacker
                            ? `Raid contre ${raid.targetName}`
                            : `Raid de ${raid.attackerName}`}
                        </span>
                        <br />
                        <span className={styles.entryMeta}>
                          {raid.ships} × {look('trireme').glyph}
                          {raid.tactic &&
                            ` · ${look(raid.tactic).glyph} ${look(raid.tactic).label}`}
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
                          className={styles.recall}
                          onClick={() => recall(raid.raidId)}
                        >
                          Rappeler
                        </button>
                      ) : (
                        <span className={styles.chip}>
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

        <div className={styles.side}>
          <section className={styles.panel} aria-labelledby="council">
            <h2 id="council">Conseil de guerre</h2>
            {target ? (
              <>
                <div className={styles.targetCard}>
                  <span className={styles.targetName}>
                    {island ? look('pirates').glyph : look('harbor').glyph} {target.name}
                  </span>
                  <span className={styles.muted}>
                    Défense {target.defense} · traversée {target.travelMinutes} min
                  </span>
                  {island && (
                    <span className={styles.muted}>
                      Trésor : <AmountsText amounts={island.treasure} />
                      {island.raidedToday && " · déjà attaquée aujourd'hui"}
                    </span>
                  )}
                </div>

                <fieldset className={styles.fleetRow}>
                  <legend className="sr-only">Nombre de trirèmes</legend>
                  {FLEET_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={styles.hull}
                      data-on={size <= ships}
                      aria-label={`${size} trirème${size > 1 ? 's' : ''}`}
                      aria-pressed={size === ships}
                      onClick={() => setShips(size)}
                    >
                      {look('trireme').glyph}
                    </button>
                  ))}
                </fieldset>
                <div className={styles.ledger}>
                  <span>
                    Coût : <AmountsText amounts={cost} />
                  </span>
                  <span>
                    Cales : <AmountsText amounts={hold} />
                  </span>
                </div>

                <TacticWheel value={tactic} onChange={setTactic} caption="Votre tactique" />

                <div className={styles.forecast}>
                  {TACTICS.map((posture) => {
                    const battle = fight(ships, tactic, posture, target.defense)
                    const scale = Math.max(battle.attack, battle.defense) * 1.15
                    return (
                      <div key={posture} className={styles.odds}>
                        <span>
                          {look(posture).glyph} {look(posture).label}
                        </span>
                        <span className={styles.bar} data-win={battle.victory}>
                          <span style={{ width: `${(battle.attack / scale) * 100}%` }} />
                          <i style={{ left: `${(battle.defense / scale) * 100}%` }} />
                        </span>
                        <span className={styles.verdict} data-win={battle.victory}>
                          {battle.attack} {battle.victory ? 'gagne' : 'perd'}
                        </span>
                      </div>
                    )
                  })}
                  <span className={styles.muted}>
                    {island
                      ? 'Le capitaine pirate pare la tactique que vous employez le plus contre lui.'
                      : 'Selon la posture que tiendra le défenseur à votre arrivée.'}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.launch}
                  disabled={busy || !targets?.home}
                  onClick={launch}
                >
                  Hisser les voiles
                </button>
              </>
            ) : (
              <p className={styles.muted}>Choisissez une île sur la carte pour préparer un raid.</p>
            )}
            {message && (
              <p className={styles.message} data-error={message.error} aria-live="polite">
                {message.text}
              </p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="harbor">
            <h2 id="harbor">
              <Entity kind="harbor" /> Votre port
            </h2>
            {harbor && (
              <TacticWheel
                value={harbor.holding}
                onChange={choosePosture}
                caption="Posture du port"
              />
            )}
            <p className={styles.muted}>
              Un village sans posture choisie défend en blocus. Chaque amélioration de bâtiment
              ajoute 5 à sa défense.
            </p>
          </section>
        </div>
      </div>

      {report && <BattleOverlay report={report} onClose={closeReport} />}
    </div>
  )
}
