'use client'
import { hc } from 'hono/client'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  type Army,
  armySize,
  isLand,
  LAND_STATS,
  NAVAL_STATS,
  UNITS,
  type Unit,
  unitsOf,
} from '@/modules/realm/contracts'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { VILLAGE_CHANGED } from '@/ui/events'
import { GameWindow } from '@/ui/game-window'
import { Icon } from '@/ui/icons'
import { DROP, SPRING } from '@/ui/motion'
import { SceneHost, type SceneLoader, useSceneControls } from '@/ui/pixi/scene-host'
import { ZoomControls } from '@/ui/pixi/zoom-controls'
import { look } from '@/ui/theme'
import type { FleetApi } from './api'
import {
  type Amounts,
  type ArmyRules,
  armyError,
  type BattleReport,
  fightArmies,
  type HarborView,
  harborChannel,
  landOf,
  MAX_RAIDS_AT_SEA,
  type MapPoint,
  mapPositionOf,
  PIRATE_ISLANDS,
  type RaidError,
  type RaidStatus,
  type RaidSummary,
  type RaidView,
  shipsOf,
  type TargetsList,
  WALL_BONUS,
} from './contracts'
import styles from './fleet.module.css'
import { clock, laneOf, relax, toWorld } from './scene/sea-layout'
import type { SeaSceneHandlers, SeaSceneState } from './scene/sea-scene'

/**
 * Loads the sea map, with PixiJS, once the page is on the client.
 *
 * @param host - Element receiving the canvas.
 * @param state - First state to show.
 * @param handlers - Handlers called back by the scene.
 * @returns The live scene.
 */
const loadSea: SceneLoader<SeaSceneState, SeaSceneHandlers> = async (host, state, handlers) =>
  (await import('./scene/sea-scene')).createSeaScene(host, state, handlers)

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<FleetApi>('/api/fleet')

/** Values of the units, read by the battle forecast. */
const RULES: ArmyRules = { land: LAND_STATS, naval: NAVAL_STATS }

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
const ERRORS: Record<RaidError['code'] | 'INVALID_INPUT' | 'UNKNOWN_UNIT', string> = {
  INVALID_INPUT: 'Ordre invalide.',
  RAID_NOT_FOUND: 'Raid introuvable.',
  ALREADY_EXISTS: 'Raid déjà lancé.',
  INVALID_FLEET: 'Une flotte compte de 1 à 10 trirèmes.',
  OWN_VILLAGE: 'Vous ne pouvez pas attaquer votre propre village.',
  UNKNOWN_TARGET: "Cette cible n'existe plus.",
  TOO_MANY_RAIDS: 'Deux flottes sont déjà en mer : attendez leur retour.',
  TREASURE_TAKEN: "Vous avez déjà attaqué cette île aujourd'hui.",
  NOT_ATTACKER: "Seul l'amiral de cette flotte peut la rappeler.",
  NOT_AT_SEA: "Cette flotte n'est plus en mer.",
  ALREADY_ARRIVED: 'Trop tard : la flotte a touché terre.',
  NOT_ARRIVED: "La flotte n'est pas encore arrivée.",
  NO_SHIP: 'Il faut au moins un navire.',
  NO_ROOM: 'Pas assez de bateaux de transport pour ces troupes.',
  UNKNOWN_UNIT: 'Unité inconnue.',
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
 * Units of an army in a row, each with its icon and its number.
 *
 * @param props - Component props.
 * @param props.army - Army to show.
 * @param props.lost - Units lost, shown after the number when given.
 * @param props.empty - Text shown when the army is empty.
 * @returns The units.
 */
function ArmyText({ army, lost, empty = 'aucune' }: { army: Army; lost?: Army; empty?: string }) {
  const units = unitsOf(army)
  if (units.length === 0) return <>{empty}</>
  return (
    <span className={styles.amounts}>
      {units.map(([unit, count]) => (
        <span key={unit} title={look(unit).label}>
          <Icon kind={unit} /> {count}
          {lost && (lost[unit] ?? 0) > 0 && <s className={styles.lost}> -{lost[unit]}</s>}
        </span>
      ))}
    </span>
  )
}

/**
 * Army chooser of the war council: a stepper for each unit at home, and the room left
 * in the transport ships. A fleet needs at least one ship, and its transports carry the
 * land troops.
 *
 * @param props - Component props.
 * @param props.garrison - Units at home.
 * @param props.army - Army chosen.
 * @param props.onChange - Called with the new army.
 * @returns The army chooser.
 */
function ArmyPicker({
  garrison,
  army,
  onChange,
}: {
  garrison: Army
  army: Army
  onChange: (army: Army) => void
}) {
  const home = unitsOf(garrison)
  const troops = armySize(landOf(army, RULES))
  const room = unitsOf(army)
    .filter(([unit]) => !isLand(unit))
    .reduce((sum, [unit, count]) => sum + RULES.naval[unit].capacity * count, 0)
  /**
   * Sets the number of one unit, kept between 0 and the units at home.
   *
   * @param unit - Unit to change.
   * @param count - Number wanted.
   */
  const set = (unit: Unit, count: number) => {
    const next = { ...army, [unit]: Math.max(0, Math.min(garrison[unit] ?? 0, count)) }
    if (next[unit] === 0) delete next[unit]
    onChange(next)
  }
  if (home.length === 0) {
    return (
      <p className={styles.notice} data-error="true">
        Aucune unité au village. Formez des troupes à la caserne et des navires au chantier naval.
      </p>
    )
  }
  return (
    <fieldset className={styles.army} data-guide="army-picker">
      <legend>Votre armée</legend>
      <ul>
        {UNITS.filter((unit) => (garrison[unit] ?? 0) > 0).map((unit) => {
          const count = army[unit] ?? 0
          const available = garrison[unit] ?? 0
          return (
            <li key={unit} data-on={count > 0}>
              <Icon kind={unit} size={28} />
              <span className={styles.unitName}>
                <strong>{look(unit).label}</strong>
                <small>
                  {count} / {available}
                </small>
              </span>
              <span className={styles.stepper}>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Retirer : ${look(unit).label}`}
                  disabled={count === 0}
                  onClick={() => set(unit, count - 1)}
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  max={available}
                  value={count}
                  aria-label={`Nombre : ${look(unit).label}`}
                  data-guide={`army-${unit}`}
                  onChange={(event) => set(unit, Number(event.target.value) || 0)}
                />
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Ajouter : ${look(unit).label}`}
                  disabled={count >= available}
                  onClick={() => set(unit, count + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={count >= available}
                  onClick={() => set(unit, available)}
                >
                  Tout
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      <p className={styles.room} data-full={troops > room}>
        <Icon kind="transport" /> Troupes embarquées {troops} / {room} places
      </p>
    </fieldset>
  )
}

/**
 * Bar comparing an attack with a defense, filled in gold for the stronger side.
 *
 * @param props - Component props.
 * @param props.attack - Attack.
 * @param props.defense - Defense.
 * @param props.won - True if the attack wins.
 * @returns The bar.
 */
function Balance({ attack, defense, won }: { attack: number; defense: number; won: boolean }) {
  const scale = Math.max(attack, defense, 1) * 1.15
  return (
    <span className={styles.bar} data-win={won}>
      <span style={{ width: `${(attack / scale) * 100}%` }} />
      <i style={{ left: `${(defense / scale) * 100}%` }} />
    </span>
  )
}

/**
 * Battle forecast of the war council: the naval battle, then the land battle, with the
 * losses each side would suffer and the plunder the survivors could carry.
 *
 * @param props - Component props.
 * @param props.report - Battle computed against the known defenders.
 * @param props.caption - What the defenders are.
 * @returns The forecast.
 */
function Forecast({ report, caption }: { report: BattleReport; caption: string }) {
  return (
    <div className={styles.forecastBox} data-guide="battle-forecast">
      <table className={styles.forecast}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Bataille</th>
            <th scope="col">Attaque contre défense</th>
            <th scope="col">Issue</th>
          </tr>
        </thead>
        <tbody>
          {report.naval && (
            <tr>
              <td>
                <Icon kind="bireme" /> Navale
              </td>
              <td>
                <Balance {...report.naval} won={report.naval.won} />
              </td>
              <td className={styles.verdictCell} data-win={report.naval.won}>
                {report.naval.attack} {report.naval.won ? 'gagne' : 'perd'}
              </td>
            </tr>
          )}
          {report.land && (
            <tr>
              <td>
                <Icon kind="troops" /> Terrestre
              </td>
              <td>
                <Balance {...report.land} won={report.land.won} />
              </td>
              <td className={styles.verdictCell} data-win={report.land.won}>
                {report.land.attack} {report.land.won ? 'gagne' : 'perd'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <dl className={styles.ledger}>
        <div>
          <dt>Vos pertes</dt>
          <dd>
            <ArmyText army={report.attacker.lost} empty="aucune" />
          </dd>
        </div>
        <div>
          <dt>Pertes adverses</dt>
          <dd>
            <ArmyText army={report.defender.lost} empty="aucune" />
          </dd>
        </div>
        <div>
          <dt>Butin possible</dt>
          <dd>{report.victory ? report.capacity : 0}</dd>
        </div>
      </dl>
    </div>
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
 * Sea map, filling the screen: islands, sea lanes and fleets moving in real time. The
 * player zooms with the wheel, two fingers or the buttons, and slides the sea with the
 * mouse or a finger; the map starts on their port. The islands are buttons laid over the
 * drawing, following its camera, so they can be reached with the keyboard.
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

  const controls = useSceneControls()
  const plane = useRef<HTMLDivElement>(null)
  const handlers = useMemo(
    (): SeaSceneHandlers => ({
      onCamera: (view) => {
        if (plane.current) {
          plane.current.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
        }
      },
    }),
    [],
  )

  const atSea = scene.fleets.length
  return (
    <div className={styles.chart}>
      <SceneHost
        load={loadSea}
        state={scene}
        handlers={handlers}
        controls={controls}
        className={styles.map}
        label={`Carte des mers : ${islands.length} îles, ${atSea} flotte${atSea > 1 ? 's' : ''} en mer`}
      >
        <div className={styles.pins}>
          <div ref={plane} className={styles.plane}>
            {islands.map((island) => (
              <button
                key={`${island.kind}-${island.shapeId}`}
                type="button"
                className={styles.hotspot}
                data-kind={island.kind}
                data-guide={island.kind === 'pirates' ? 'target-pirates' : undefined}
                style={{ left: `${island.point.x}%`, top: `${island.point.y}%` }}
                disabled={!island.selection}
                aria-pressed={isTarget(island, selected)}
                aria-label={
                  island.kind === 'home'
                    ? `Votre village : ${island.name}`
                    : `Cibler ${island.name}`
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
      </SceneHost>
      <ZoomControls controls={controls} />

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

/** Key of the browser storage keeping the battle reports already closed. */
const SEEN_REPORTS = 'royaumes.seen-reports'

/** Age after which a battle report is no longer shown, even if never seen, in milliseconds. */
const REPORT_FRESH_MS = 60 * 60 * 1000

/** Number of battle reports remembered as closed. */
const SEEN_LIMIT = 50

/**
 * Key naming a battle report among those shown: the raid, and the side of the player.
 *
 * @param report - Data of the `BattleReported` event.
 * @returns The key of the report.
 */
const reportKey = (report: Record<string, unknown>) =>
  `${String(report.raidId)}:${String(report.role)}`

/**
 * Reads the keys of the battle reports already closed in this browser.
 *
 * @returns The keys, or none when the browser keeps no storage.
 */
function seenReports(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_REPORTS) ?? '[]')
  } catch {
    return []
  }
}

/**
 * Tells whether a battle report should be shown. The harbor channel sends again every
 * event of the harbor each time the screen opens: a report already closed in this
 * browser, or older than an hour, stays closed.
 *
 * @param report - Data of the `BattleReported` event.
 * @param now - Current time in milliseconds.
 * @returns True for a recent report never closed.
 */
function isNewReport(report: Record<string, unknown>, now: number): boolean {
  const at = typeof report.at === 'number' ? report.at : 0
  return now - at <= REPORT_FRESH_MS && !seenReports().includes(reportKey(report))
}

/**
 * Remembers a battle report as closed, so it is not shown again.
 *
 * @param report - Data of the `BattleReported` event.
 */
function rememberReport(report: Record<string, unknown>) {
  try {
    const seen = [...seenReports(), reportKey(report)].slice(-SEEN_LIMIT)
    localStorage.setItem(SEEN_REPORTS, JSON.stringify(seen))
  } catch {
    return
  }
}

/**
 * Full screen battle report, shown when a report reaches the harbor in real time: the
 * report drops into place, the two ships ram each other, the verdict is stamped, then
 * the plunder comes in piece by piece. It is drawn at the root of the page, above the
 * menus of the game, so no menu hides part of it.
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
    const timer = setTimeout(onClose, report.report ? 11000 : 7000)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, report.report])
  const loot = (report.loot ?? {}) as Amounts
  const battle = report.report as BattleReport | undefined
  const mine = battle ? (attacker ? battle.attacker.sent : battle.defender.present) : null
  const myLoss = battle ? (attacker ? battle.attacker.lost : battle.defender.lost) : null
  const theirs = battle ? (attacker ? battle.defender.present : battle.attacker.sent) : null
  const theirLoss = battle ? (attacker ? battle.defender.lost : battle.attacker.lost) : null
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
  return createPortal(
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
            ? `${battle ? 'Votre armée' : 'Votre flotte'} contre ${String(report.opponentName)} : `
            : `${String(report.opponentName)} a attaqué votre port : `}
          {attacker ? (
            won ? (
              <>butin {lootList}</>
            ) : (
              "l'armée est tombée."
            )
          ) : won ? (
            "l'assaut est repoussé."
          ) : (
            <>pillé {lootList}</>
          )}
        </p>
        {mine && theirs && myLoss && theirLoss && (
          <m.dl
            className={styles.casualties}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 1.2 }}
          >
            <div>
              <dt>Vos unités</dt>
              <dd>
                <ArmyText army={mine} lost={myLoss} />
              </dd>
            </div>
            <div>
              <dt>{String(report.opponentName)}</dt>
              <dd>
                <ArmyText army={theirs} lost={theirLoss} empty="aucun défenseur" />
              </dd>
            </div>
          </m.dl>
        )}
        <button type="button" onClick={onClose}>
          Fermer le rapport
        </button>
      </m.div>
    </m.div>,
    document.body,
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

  const [panel, setPanel] = useState<'council' | 'log' | 'harbor' | null>(null)

  /**
   * Targets an island, and opens the war council beside the map to prepare the raid.
   *
   * @param selection - Targeted island.
   */
  const aim = useCallback((selection: Selection) => {
    setSelected(selection)
    setPanel('council')
  }, [])

  /** Closes the open panel; closing the war council also lets go of the target. */
  const closePanel = useCallback(() => {
    setPanel((current) => {
      if (current === 'council') setSelected(null)
      return null
    })
  }, [])
  const [army, setArmy] = useState<Army>({})
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 8000)
    return () => clearTimeout(timer)
  }, [message])
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const closeReport = useCallback(() => {
    setReport((current) => {
      if (current) rememberReport(current)
      return null
    })
  }, [])
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
    if (event.type === 'BattleReported' && isNewReport(event.data, Date.now())) {
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

  /**
   * Launches a raid against the selected target, and announces the equipment spent. On
   * success the war council closes, so the fleet shows sailing on the map; a refusal is
   * told in the council, next to the button.
   */
  async function launch() {
    if (!selected) return
    setBusy(true)
    const res = await client.raids.$post({
      json: {
        target:
          selected.kind === 'village'
            ? { kind: 'village', playerId: selected.id }
            : { kind: 'pirates', islandId: selected.id },
        army,
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
          ? { text: 'Armement impossible : votre village manque de ressources.', error: true }
          : { text: `La flotte a hissé les voiles vers ${view.target.name}.`, error: false },
      )
      if (view.status !== 'cancelled') {
        setArmy({})
        closePanel()
      }
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
        : { text: 'Demi-tour ! Vos unités rentrent au village.', error: false },
    )
    if (!('error' in body)) window.dispatchEvent(new Event(VILLAGE_CHANGED))
    refresh()
  }

  const garrison = targets?.home?.garrison ?? {}
  const chosen = Object.fromEntries(
    unitsOf(army).map(([unit, count]) => [unit, Math.min(count, garrison[unit] ?? 0)]),
  ) as Army
  const refusal = armySize(chosen) === 0 ? 'EMPTY' : armyError(chosen, RULES)
  const forecast =
    refusal === null
      ? island
        ? fightArmies(chosen, island.garrison, 0, RULES)
        : village
          ? fightArmies(chosen, {}, village.wall, RULES)
          : null
      : null
  const homeTroops = armySize(landOf(garrison, RULES))
  const homeShips = armySize(shipsOf(garrison, RULES))

  const outCount = raids.filter(
    (raid) => raid.status === 'at-sea' || raid.status === 'provisioning',
  ).length

  return (
    <div className={styles.screen}>
      {targets ? (
        <SeaMap
          userId={userId}
          targets={targets}
          raids={raids}
          selected={selected}
          onSelect={aim}
        />
      ) : (
        <div className={styles.chart} aria-busy="true" />
      )}

      <div className={styles.top}>
        <header className="row">
          <h1>
            <Entity kind="fleet" /> La Flotte
          </h1>
          <span className="status" data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        </header>
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
          <button type="submit">
            <Icon kind="search" />
            <span className={styles.searchLabel}>Scruter l'horizon</span>
          </button>
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
      </div>

      <dl className={styles.figures}>
        <div>
          <dt>Troupes</dt>
          <dd>
            <Icon kind="troops" />
            <span className={styles.figureText}>{targets?.home ? homeTroops : '-'}</span>
          </dd>
        </div>
        <div>
          <dt>Navires</dt>
          <dd>
            <Icon kind="bireme" />
            <span className={styles.figureText}>{targets?.home ? homeShips : '-'}</span>
          </dd>
        </div>
        <div>
          <dt>En mer</dt>
          <dd>
            {out} / {targets?.home?.limits.maxRaids ?? MAX_RAIDS_AT_SEA}
          </dd>
        </div>
        <div>
          <dt>Arrivée</dt>
          <dd>{nextArrival === null ? '-' : clock(nextArrival - now)}</dd>
        </div>
      </dl>

      <div className={styles.alerts}>
        {message && (
          <p className={styles.notice} data-error={message.error} aria-live="polite">
            {message.text}
          </p>
        )}
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
                  {raid.attackerName} lance {raid.ships} navire{raid.ships > 1 ? 's' : ''} sur votre
                  port. Renforcez votre garnison tant qu'il est temps.
                </span>
              </div>
              <span className={styles.alarmClock}>{clock(raid.arrivesAt - now)}</span>
            </m.div>
          ))}
        </AnimatePresence>
        {targets && !targets.home && (
          <p className={styles.notice} data-error="true">
            Fondez d'abord votre village : sans port, aucune flotte ne peut appareiller.
          </p>
        )}
      </div>

      <nav className={styles.dock} aria-label="Menus de la flotte">
        <button
          type="button"
          aria-pressed={panel === 'log'}
          onClick={() => setPanel(panel === 'log' ? null : 'log')}
        >
          <Icon kind="sunk" />
          <span>Journal de bord</span>
          {outCount > 0 && <span className={styles.badge}>{outCount}</span>}
        </button>
        <button
          type="button"
          data-guide="fleet-harbor"
          aria-pressed={panel === 'harbor'}
          onClick={() => setPanel(panel === 'harbor' ? null : 'harbor')}
        >
          <Icon kind="harbor" />
          <span>Votre port</span>
        </button>
        <button
          type="button"
          data-guide="fleet-council"
          aria-pressed={panel === 'council'}
          onClick={() => setPanel(panel === 'council' ? null : 'council')}
        >
          <Icon kind="swords" />
          <span>Conseil de guerre</span>
        </button>
      </nav>

      {panel === 'council' && (
        <GameWindow label="Conseil de guerre" size="side" onClose={closePanel}>
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
                      {village ? `Rempart niveau ${village.wall} · ` : ''}traversée{' '}
                      {target.travelMinutes} min
                    </span>
                    {island && (
                      <span className="muted">
                        Trésor : <AmountsText amounts={island.treasure} />
                        {island.raidedToday && " · déjà attaquée aujourd'hui"}
                      </span>
                    )}
                    {island && (
                      <span className="muted">
                        Garnison : <ArmyText army={island.garrison} />
                      </span>
                    )}
                  </div>
                </m.div>

                <ArmyPicker garrison={garrison} army={chosen} onChange={setArmy} />

                {forecast && (
                  <Forecast
                    report={forecast}
                    caption={
                      island ? 'Contre la garnison pirate' : 'Si le village est sans défenseur'
                    }
                  />
                )}
                {refusal && refusal !== 'EMPTY' && (
                  <p className={styles.notice} data-error="true">
                    {ERRORS[refusal]}
                  </p>
                )}
                <p className="muted">
                  {island
                    ? 'Le capitaine pirate appelle sa réserve : les unités qui défendent le mieux contre les dégâts que vous lui infligez le plus souvent.'
                    : 'Les troupes du défenseur restent inconnues : la prévision ne compte que son rempart et ses habitants.'}
                </p>

                {island?.raidedToday && (
                  <p className={styles.notice} data-error="true">
                    {ERRORS.TREASURE_TAKEN} Visez une autre île, ou revenez demain.
                  </p>
                )}
                {message?.error && !island?.raidedToday && (
                  <p className={styles.notice} data-error="true" role="alert">
                    {message.text}
                  </p>
                )}
                <button
                  type="button"
                  className="primary"
                  data-guide="launch-raid"
                  disabled={busy || !targets?.home || !!island?.raidedToday || refusal !== null}
                  onClick={launch}
                >
                  Hisser les voiles
                </button>
              </div>
            ) : (
              <p className="muted">Choisissez une île sur la carte pour préparer un raid.</p>
            )}
          </section>
        </GameWindow>
      )}
      {panel === 'log' && (
        <GameWindow label="Journal de bord" size="side" onClose={closePanel}>
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
                            {raid.army ? (
                              <ArmyText army={raid.army} />
                            ) : (
                              `${raid.ships} navire${raid.ships > 1 ? 's' : ''}`
                            )}
                            {raid.tactic && ` · ${look(raid.tactic).label}`}
                            {raid.status === 'at-sea' &&
                              raid.arrivesAt > now &&
                              ` · arrivée ${new Date(raid.arrivesAt).toLocaleTimeString('fr-FR')}`}
                            {attacker &&
                              raid.returnsAt > now &&
                              ` · retour ${new Date(raid.returnsAt).toLocaleTimeString('fr-FR')}`}
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
        </GameWindow>
      )}
      {panel === 'harbor' && (
        <GameWindow label="Votre port" size="side" onClose={closePanel}>
          <section className="panel" aria-labelledby="harbor">
            <h2 id="harbor">Votre port</h2>
            {harbor && (
              <dl className={styles.ledger} data-guide="harbor-garrison">
                <div>
                  <dt>Garnison</dt>
                  <dd>
                    <ArmyText army={harbor.garrison} empty="aucune unité" />
                  </dd>
                </div>
                <div>
                  <dt>Rempart</dt>
                  <dd>
                    niveau {harbor.wall} · +{Math.round(harbor.wall * WALL_BONUS * 100)} %
                  </dd>
                </div>
              </dl>
            )}
            <p className="muted">
              Les unités restées au village le défendent : les navires d'abord en mer, puis les
              troupes à terre, renforcées par le rempart. Sans troupe, seuls les habitants
              résistent.
            </p>
          </section>
        </GameWindow>
      )}

      <AnimatePresence>
        {report && <BattleOverlay key="report" report={report} onClose={closeReport} />}
      </AnimatePresence>
    </div>
  )
}
