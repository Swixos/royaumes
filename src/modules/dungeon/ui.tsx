'use client'
import { hc } from 'hono/client'
import { AnimatePresence, m } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useChannel } from '@/platform/realtime/use-channel'
import { Icon } from '@/ui/icons'
import { DROP, SPRING } from '@/ui/motion'
import { useCountdown } from '@/ui/use-countdown'
import type { DungeonApi } from './api'
import {
  type Action,
  BOSSES,
  CLASSES,
  DIFFICULTIES,
  type Difficulty,
  type Effect,
  EXPLORE_MS,
  type GameError,
  type GameView,
  gameChannel,
  HERO_CLASSES,
  type HeroClass,
  type HeroView,
  type IntentView,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
  ROUND_MS,
  type Room,
  SKILL_COOLDOWN,
  SKILLS,
} from './contracts'
import styles from './dungeon.module.css'
import { Door, Embers, Torch } from './scene/art'

/** Typed HTTP client inferred from the dungeon Hono sub-app. */
const client = hc<DungeonApi>('/api/dungeon')

/** Errors the API can return: domain errors and the validation error. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message shown to the player for each error. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  GAME_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  NOT_YOUR_TURN: "Ce n'est pas votre tour.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
  SKILL_NOT_READY: 'Votre compétence se recharge encore.',
}

/** Words of each difficulty level: its name and what awaits the heroes. */
const LEVELS: Record<Difficulty, { name: string; text: string }> = {
  easy: {
    name: 'Facile',
    text: 'Un troll garde la dernière salle. Les monstres frappent au hasard.',
  },
  hard: {
    name: 'Difficile',
    text: 'Une liche règne au fond. Les monstres frappent plus fort et s’acharnent sur les plus faibles.',
  },
}

/** Label shown for each state of the real-time connection. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel',
  reconnecting: 'Reconnexion...',
} as const

/** Words of each kind of room, as the heroes discover it. */
const ROOMS: Record<Room['kind'], { title: string; icon: string }> = {
  empty: { title: 'Salle vide', icon: 'web' },
  treasure: { title: 'Trésor', icon: 'chest' },
  shrine: { title: 'Sanctuaire', icon: 'shrine' },
  monsters: { title: 'Salle nettoyée', icon: 'swords' },
}

/** Color of the drawings of the heroes, light on the dark stones. */
const HERO_INK = '#efdcb4'

/** Color of the drawings of the monsters. */
const MONSTER_INK = '#f2b7a8'

/** Time between two blows of the replay of a round, in milliseconds. */
const STEP_MS = 520

/** Largest value of each statistic among the classes, which fills a bar. */
const STAT_TOPS = { hp: 40, attack: 8, heal: 10, critical: 0.3 }

/**
 * Builds the displayed name of a monster, numbered when the room holds several
 * of the same kind.
 *
 * @param monster - Monster to name.
 * @param monsters - Monsters of the room.
 * @returns The displayed name.
 */
function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/**
 * Describes an action as the player chose it.
 *
 * @param action - Chosen action.
 * @param nameOf - Resolves a fighter identifier to its name.
 * @param hero - Hero choosing, whose skill names the skill action.
 * @returns The description shown to the player.
 */
function describeAction(action: Action, nameOf: (id: string) => string, hero?: HeroView) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  if (action.type === 'skill') return hero?.skill ? SKILLS[hero.skill].name : 'sa compétence'
  return 'se défendre'
}

/**
 * Describes an effect of the last round, as told by the chronicle of the fight.
 *
 * @param effect - Damage or heal.
 * @param nameOf - Resolves a fighter identifier to its name.
 * @returns The description shown to the player.
 */
function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  const source = nameOf(effect.source)
  const target = nameOf(effect.target)
  if (effect.kind === 'heal') {
    return effect.skill === 'prayer'
      ? `${source} prie : ${target} récupère ${effect.amount} PV`
      : `${source} soigne ${target} de ${effect.amount} PV`
  }
  if (effect.skill === 'volley')
    return `Une flèche de ${source} touche ${target} : ${effect.amount} dégâts`
  if (effect.critical)
    return `${source} porte un coup critique à ${target} : ${effect.amount} dégâts`
  return `${source} frappe ${target} : ${effect.amount} dégâts`
}

/**
 * Portrait of a fighter: its drawing in a round frame.
 *
 * @param props - Component props.
 * @param props.kind - Class of a hero, or kind of a monster.
 * @param props.ink - Color of the drawing.
 * @returns The portrait.
 */
function Portrait({ kind, ink = HERO_INK }: { kind: string; ink?: string }) {
  return (
    <span className={styles.portrait}>
      <Icon kind={kind} color={ink} />
    </span>
  )
}

/**
 * Round countdown, drawn as a ring emptying itself.
 *
 * @param props - Component props.
 * @param props.remaining - Seconds left, or null without deadline.
 * @param props.total - Seconds of a full turn.
 * @returns The countdown, or nothing without deadline.
 */
function Clock({ remaining, total }: { remaining: number | null; total: number }) {
  if (remaining === null) return null
  const radius = 22
  const length = 2 * Math.PI * radius
  const share = Math.min(1, remaining / total)
  const urgent = remaining <= 5
  return (
    <div className={styles.clock} data-urgent={urgent} title="Temps restant">
      <svg viewBox="0 0 54 54" aria-hidden="true">
        <circle
          cx="27"
          cy="27"
          r={radius}
          fill="rgba(0,0,0,0.45)"
          stroke="#3d332a"
          strokeWidth="4"
        />
        <circle
          cx="27"
          cy="27"
          r={radius}
          fill="none"
          stroke={urgent ? '#ff6b4d' : '#ffd36b'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - share)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <strong>{remaining}</strong>
    </div>
  )
}

/**
 * Class chooser: the three classes as cards, with their statistics and their skill.
 *
 * @param props - Component props.
 * @param props.value - Chosen class.
 * @param props.onChange - Called with the class picked.
 * @returns The class chooser.
 */
function ClassPicker({
  value,
  onChange,
}: {
  value: HeroClass
  onChange: (heroClass: HeroClass) => void
}) {
  return (
    <fieldset className={styles.classes}>
      <legend className="sr-only">Classe du héros</legend>
      {HERO_CLASSES.map((kind) => {
        const spec = CLASSES[kind]
        const skill = SKILLS[spec.skill]
        const stats: Array<[string, number]> = [
          ['PV', spec.hp / STAT_TOPS.hp],
          ['Attaque', spec.attack / STAT_TOPS.attack],
          ['Soin', spec.heal / STAT_TOPS.heal],
          ['Critique', spec.critical / STAT_TOPS.critical],
        ]
        return (
          <button
            key={kind}
            type="button"
            className={styles.classCard}
            aria-pressed={value === kind}
            data-guide={`class-${kind}`}
            onClick={() => onChange(kind)}
          >
            <Portrait kind={kind} />
            <strong>{spec.name}</strong>
            <span className={styles.stats}>
              {stats.map(([label, share]) => (
                <span key={label}>
                  <span>{label}</span>
                  <i style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
              ))}
            </span>
            <span className={styles.skillTag}>
              <Icon kind={spec.skill} /> {skill.name}
            </span>
            <p>{skill.text}</p>
          </button>
        )
      })}
    </fieldset>
  )
}

/**
 * Dark stones, torches and embers framing every screen of the dungeon.
 *
 * @param props - Component props.
 * @param props.children - Content of the screen.
 * @returns The dungeon frame.
 */
function Depths({ children }: { children: ReactNode }) {
  return (
    <div className={styles.dungeon}>
      <Torch side="left" />
      <Torch side="right" />
      <Embers />
      {children}
    </div>
  )
}

/**
 * Dungeon home screen: the class of the hero, the difficulty, opening an expedition, and
 * the expeditions waiting for heroes.
 *
 * @returns The lobby screen.
 */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [heroClass, setHeroClass] = useState<HeroClass>('warrior')
  const [busy, setBusy] = useState(false)

  /** Reloads the list of open expeditions. */
  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Opens a new expedition with the chosen hero, and goes to its page. */
  async function open() {
    setBusy(true)
    const res = await client.games.$post({ json: { difficulty, heroClass } })
    if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
    else setBusy(false)
  }

  return (
    <Depths>
      <header className={styles.top}>
        <h1 className={styles.title}>
          <Icon kind="dungeon" /> Les Profondeurs <small>Donjon</small>
        </h1>
      </header>

      <section className={styles.panel} aria-labelledby="hero-choice">
        <h2 id="hero-choice">Choisissez votre héros</h2>
        <ClassPicker value={heroClass} onChange={setHeroClass} />
      </section>

      <section className={styles.panel} aria-labelledby="peril">
        <h2 id="peril">Choisissez le péril</h2>
        <div className={styles.levels}>
          {DIFFICULTIES.map((level) => (
            <button
              key={level}
              type="button"
              className={styles.level}
              data-tone={level}
              aria-pressed={difficulty === level}
              onClick={() => setDifficulty(level)}
            >
              <Icon kind={BOSSES[level]} color={MONSTER_INK} />
              <span>
                <strong>{LEVELS[level].name}</strong>
                <span>{LEVELS[level].text}</span>
              </span>
            </button>
          ))}
        </div>
        <div className={styles.cta}>
          <button
            type="button"
            className={styles.big}
            data-guide="open-expedition"
            disabled={busy}
            onClick={open}
          >
            Ouvrir une expédition
          </button>
        </div>
      </section>

      <section className={styles.panel} aria-label="Expéditions ouvertes">
        <div className={styles.arenaHead}>
          <h2>Expéditions ouvertes</h2>
          <button className="link" type="button" onClick={refresh}>
            Actualiser
          </button>
        </div>
        {games?.length === 0 && (
          <p className="muted">Aucune expédition n'attend de héros pour le moment.</p>
        )}
        <ul className={styles.games}>
          {games?.map((game) => (
            <li key={game.gameId}>
              <span>
                Expédition de <strong>{game.hostName}</strong>{' '}
                <span className="muted">
                  {game.heroCount} / {MAX_HEROES} héros
                </span>
              </span>
              <Link href={`/dungeon/${game.gameId}`}>Rejoindre</Link>
            </li>
          ))}
        </ul>
      </section>
    </Depths>
  )
}

/**
 * Replay of the last round: its blows played one after the other, so the players see who
 * strikes whom. The first round read when the screen opens is shown at once, without replay.
 *
 * @param lastRound - Last resolved round of the view.
 * @returns The number of blows played so far, their total, and the blow under way.
 */
function useReplay(lastRound: GameView['lastRound'] | undefined) {
  const total = lastRound?.effects.length ?? 0
  const key = lastRound?.round ?? 0
  const [step, setStep] = useState(total)
  const seen = useRef<number | null>(null)
  const effects = useRef<Effect[]>([])
  effects.current = lastRound?.effects ?? []

  useEffect(() => {
    if (seen.current === null || key === seen.current || key === 0) {
      seen.current = key
      setStep(effects.current.length)
      return
    }
    seen.current = key
    setStep(0)
    let played = 0
    const timer = setInterval(() => {
      played += 1
      setStep(played)
      if (played >= effects.current.length) clearInterval(timer)
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [key])

  const shown = Math.min(step, total)
  return {
    step: shown,
    total,
    playing: shown < total,
    current: shown > 0 ? (lastRound?.effects[shown - 1] ?? null) : null,
  }
}

/**
 * Hit points shown during the replay: the final hit points, before the blows still to play.
 *
 * @param fighter - Fighter with its final and maximum hit points.
 * @param pending - Effects not played yet.
 * @returns The hit points to show now.
 */
function shownHp(fighter: { id: string; hp: number; maxHp: number }, pending: Effect[]) {
  let hp = fighter.hp
  for (const effect of pending) {
    if (effect.target !== fighter.id) continue
    hp += effect.kind === 'damage' ? effect.amount : -effect.amount
  }
  return Math.max(0, Math.min(fighter.maxHp, hp))
}

/**
 * Card of a fighter in the arena: its portrait, its name, its hit points, the blow it
 * takes or deals during the replay, and what it announces or awaits.
 *
 * @param props - Component props.
 * @param props.id - Identifier of the fighter.
 * @param props.name - Displayed name.
 * @param props.kind - Class of the hero, or kind of the monster, drawing its portrait.
 * @param props.hp - Hit points to show.
 * @param props.maxHp - Maximum hit points.
 * @param props.monster - True for a monster.
 * @param props.boss - True for the guardian of the last room.
 * @param props.me - True for the hero of the viewer.
 * @param props.pickable - True while the viewer may pick this fighter as target.
 * @param props.onPick - Called when the fighter is picked.
 * @param props.current - Blow under way in the replay.
 * @param props.step - Number of the blow under way, which restarts the animations.
 * @param props.children - Badges laid over the card.
 * @param props.detail - Line under the hit points.
 * @param props.threat - True when a monster announced it will strike this hero.
 * @returns The card.
 */
function Fighter({
  id,
  name,
  kind,
  hp,
  maxHp,
  monster = false,
  boss = false,
  me = false,
  pickable = false,
  onPick,
  current,
  step,
  children,
  detail,
  threat = false,
}: {
  id: string
  name: string
  kind: string
  hp: number
  maxHp: number
  monster?: boolean
  boss?: boolean
  me?: boolean
  pickable?: boolean
  onPick?: () => void
  current: Effect | null
  step: number
  children?: ReactNode
  detail?: ReactNode
  threat?: boolean
}) {
  const struck = current?.target === id
  const striking = current?.source === id && current.kind === 'damage'
  const shake = struck && current?.kind === 'damage'
  const lunge = monster ? 16 : -16
  const body = (
    <>
      {children}
      <Portrait kind={kind} ink={monster ? MONSTER_INK : HERO_INK} />
      <strong>{name}</strong>
      <span className={styles.hp} data-low={hp / maxHp < 0.35}>
        <span style={{ width: `${(hp / maxHp) * 100}%` }} />
        <em>
          {hp} / {maxHp}
        </em>
      </span>
      {detail && <small>{detail}</small>}
      <AnimatePresence>
        {struck && current && (
          <m.span
            key={step}
            className={styles.float}
            data-kind={current.kind === 'heal' ? 'heal' : current.critical ? 'crit' : 'damage'}
            initial={{ opacity: 0, x: '-50%', y: 10, scale: 0.6 }}
            animate={{ opacity: 1, x: '-50%', y: -26, scale: 1 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.45 }}
          >
            {current.kind === 'heal' ? '+' : '-'}
            {current.amount}
            {current.kind === 'damage' && current.critical && <small>Critique</small>}
          </m.span>
        )}
      </AnimatePresence>
    </>
  )
  const motionProps = {
    animate: shake
      ? { x: [0, -9, 9, -6, 6, 0] }
      : striking
        ? { y: [0, lunge, 0], scale: [1, 1.06, 1] }
        : { x: 0, y: 0, scale: 1 },
    transition: { duration: 0.38 },
  }
  const data = {
    'data-monster': monster,
    'data-boss': boss,
    'data-down': hp <= 0,
    'data-me': me,
    'data-pickable': pickable,
    'data-threat': threat && hp > 0,
  }
  return pickable ? (
    <m.button
      key={striking || struck ? `${id}-${step}` : id}
      type="button"
      className={styles.fighter}
      aria-label={`Cibler ${name}`}
      onClick={onPick}
      {...data}
      {...motionProps}
    >
      {body}
    </m.button>
  ) : (
    <m.div
      key={striking || struck ? `${id}-${step}` : id}
      className={styles.fighter}
      {...data}
      {...motionProps}
    >
      {body}
    </m.div>
  )
}

/**
 * Card telling what the heroes found in the room they stand in.
 *
 * @param props - Component props.
 * @param props.view - View of the expedition.
 * @returns The card.
 */
function RoomReveal({ view }: { view: GameView }) {
  const room = view.currentRoom
  if (!room) {
    return (
      <m.div
        className={styles.reveal}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Portrait kind="torch" ink="#ffd36b" />
        <h3>L'entrée des Profondeurs</h3>
        <p>
          Les torches crépitent. Derrière la porte, {view.roomCount} salles et leur gardien vous
          attendent.
        </p>
      </m.div>
    )
  }
  const words = ROOMS[room.kind]
  return (
    <m.div
      key={view.room}
      className={styles.reveal}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={DROP}
    >
      <Portrait kind={words.icon} ink={room.kind === 'shrine' ? '#ffd36b' : HERO_INK} />
      <h3>{words.title}</h3>
      {room.kind === 'treasure' && (
        <>
          <m.span
            className={styles.gain}
            initial={{ scale: 2.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.25 }}
          >
            + {room.gold} or
          </m.span>
          <p>Un coffre oublié, plein de pièces anciennes.</p>
        </>
      )}
      {room.kind === 'shrine' && (
        <>
          <m.span
            className={styles.gain}
            data-kind="heal"
            initial={{ scale: 2.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.25 }}
          >
            + {room.heal} PV
          </m.span>
          <p>Une flamme sacrée referme les plaies de chaque héros debout.</p>
        </>
      )}
      {room.kind === 'empty' && <p>Des toiles, de la poussière... et un silence inquiétant.</p>}
      {room.kind === 'monsters' && <p>Les monstres gisent au sol. La voie est libre.</p>}
    </m.div>
  )
}

/**
 * Path of the rooms of the dungeon: the rooms opened, with what they held, the room of the
 * heroes, and the rooms still unknown, up to the lair of the guardian.
 *
 * @param props - Component props.
 * @param props.view - View of the expedition.
 * @returns The map.
 */
function RoomMap({ view }: { view: GameView }) {
  return (
    <ol className={styles.map} aria-label="Carte du donjon">
      {Array.from({ length: view.roomCount }, (_, place) => ({ number: place + 1 })).map(
        ({ number }) => {
          const index = number - 1
          const kind = view.visited[index]
          const boss = index === view.roomCount - 1
          const state = index === view.room ? 'here' : index < view.room ? 'done' : 'next'
          const fighting = index === view.room && view.phase === 'combat'
          const icon = boss ? 'boss' : fighting ? 'swords' : kind ? ROOMS[kind].icon : null
          return (
            <li key={number} data-state={state} data-boss={boss}>
              <span className={styles.node}>{icon ? <Icon kind={icon} /> : '?'}</span>
              <small>
                {boss
                  ? 'Gardien'
                  : fighting
                    ? 'Combat'
                    : kind
                      ? ROOMS[kind].title
                      : `Salle ${number}`}
              </small>
            </li>
          )
        },
      )}
    </ol>
  )
}

/**
 * Party of the expedition before it starts: the four places, filled with the heroes or
 * waiting for one.
 *
 * @param props - Component props.
 * @param props.view - View of the expedition.
 * @returns The places of the party.
 */
function Party({ view }: { view: GameView }) {
  return (
    <div className={styles.slots}>
      {Array.from({ length: MAX_HEROES }, (_, place) => ({ place, hero: view.heroes[place] })).map(
        ({ place, hero }) => {
          if (!hero) {
            return (
              <div key={`free-${place}`} className={styles.slot} data-empty="true">
                <strong>Place libre</strong>
                <small>En attente d'un héros</small>
              </div>
            )
          }
          return (
            <m.div
              key={hero.id}
              className={styles.slot}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={SPRING}
            >
              <Portrait kind={hero.heroClass ?? (hero.companion ? 'companion' : 'hero')} />
              <strong>{hero.name}</strong>
              <small>
                {hero.heroClass ? CLASSES[hero.heroClass].name : 'Héros'}
                {hero.companion && ' · compagnon'}
              </small>
              {hero.id === view.hostId && <small className={styles.host}>Hôte</small>}
            </m.div>
          )
        },
      )}
    </div>
  )
}

/**
 * Screen of the end of an expedition: the verdict, the gold counted up, and the way back.
 *
 * @param props - Component props.
 * @param props.view - View of the expedition, won or lost.
 * @returns The end screen, drawn above the game.
 */
function EndScreen({ view }: { view: GameView }) {
  const won = view.phase === 'won'
  const [gold, setGold] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const share = Math.min(1, (time - start) / 1400)
      setGold(Math.round(view.loot * share))
      if (share < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [view.loot])
  return createPortal(
    <m.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <m.div
        className={styles.end}
        data-won={won}
        role="dialog"
        aria-label={won ? 'Victoire' : 'Défaite'}
        initial={{ y: -120, scale: 0.85 }}
        animate={{ y: 0, scale: 1 }}
        transition={DROP}
      >
        <Portrait kind={won ? 'chest' : 'boss'} ink={won ? '#ffd36b' : MONSTER_INK} />
        <m.h2
          initial={{ scale: 2.4, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: -3 }}
          transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.3 }}
        >
          {won ? 'Victoire' : 'Défaite'}
        </m.h2>
        <p>
          {won
            ? 'Le gardien des Profondeurs est tombé. Le groupe remonte, chargé de trésors.'
            : 'Les ténèbres ont eu raison du groupe. Seul l’or ramassé remonte à la surface.'}
        </p>
        <span className={styles.gain}>
          <Icon kind="gold" color="#ffd36b" /> {gold} or
        </span>
        <Link href="/dungeon">Retour aux Profondeurs</Link>
      </m.div>
    </m.div>,
    document.body,
  )
}

/** Way of choosing the target of an action. */
type Mode = 'attack' | 'heal' | null

/**
 * Expedition screen: the party in the lobby, then the rooms one after the other, with the
 * door to push and the fights in the arena. Members listen to the discreet expedition
 * channel and reread their view on each notification; their countdown sends the deadline
 * command, and the server decides.
 *
 * @param props - Component props.
 * @param props.gameId - Expedition identifier.
 * @param props.userId - Signed-in player.
 * @returns The expedition screen.
 */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [heroClass, setHeroClass] = useState<HeroClass>('ranger')
  const [mode, setMode] = useState<Mode>(null)
  const [opening, setOpening] = useState(false)
  const [copied, setCopied] = useState(false)
  const param = { id: gameId }

  /** Rereads the player's view of the expedition. */
  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)
  const replay = useReplay(view?.lastRound)

  /**
   * Applies an API response: shows the error and rereads the view, or stores the new view.
   *
   * @param body - Response body.
   */
  function handle(body: { view: GameView } | { error: ApiError }) {
    setMode(null)
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  /** Adds a companion to the expedition, as host. */
  const addCompanion = async () =>
    handle(await (await client.games[':id'].companion.$post({ param })).json())
  /** Joins the expedition with the chosen class. */
  const join = async () =>
    handle(await (await client.games[':id'].join.$post({ param, json: { heroClass } })).json())
  /** Starts the expedition, as host. */
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  /** Pushes the next door: the leaves swing open, then the room is revealed. */
  async function openDoor() {
    setOpening(true)
    await new Promise((resolve) => setTimeout(resolve, 750))
    handle(await (await client.games[':id'].door.$post({ param })).json())
    setOpening(false)
  }
  /**
   * Chooses an action for the round shown on screen.
   *
   * @param action - Chosen action.
   */
  const act = useCallback(
    async (action: Action) => {
      if (!view) return
      const res = await client.games[':id'].action.$post({
        param: { id: gameId },
        json: { round: view.round, action },
      })
      const body = await res.json()
      setMode(null)
      if ('error' in body) {
        setError(ERRORS[body.error.code])
        refresh()
      } else {
        setError(null)
        setView(body.view)
      }
    },
    [view, gameId, refresh],
  )

  /** Copies the address of the expedition, to invite other players. */
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  /** Sends the deadline command; the server checks whether the round is really due. */
  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])
  const remaining = useCountdown(
    view?.isMember && (view.phase === 'combat' || view.phase === 'exploring')
      ? view.deadline
      : null,
    checkDeadline,
  )

  const me = view?.heroes.find((hero) => hero.id === userId)
  const canAct = !!view && view.phase === 'combat' && !!me && me.hp > 0 && !me.action
  const monstersUp = view?.monsters.filter((monster) => monster.hp > 0) ?? []

  /**
   * Starts an attack: at once against the only monster standing, otherwise by picking one.
   */
  const attack = useCallback(() => {
    if (monstersUp.length === 1) act({ type: 'attack', target: monstersUp[0].id })
    else setMode((current) => (current === 'attack' ? null : 'attack'))
  }, [monstersUp, act])

  useEffect(() => {
    if (!canAct) return
    /**
     * Plays the keyboard shortcuts of the actions: 1 to 4, and Escape to cancel a target.
     *
     * @param event - Key pressed.
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === '1') attack()
      if (event.key === '2') act({ type: 'defend' })
      if (event.key === '3') setMode((current) => (current === 'heal' ? null : 'heal'))
      if (event.key === '4' && me?.skillWait === 0) act({ type: 'skill' })
      if (event.key === 'Escape') setMode(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAct, attack, act, me?.skillWait])

  const header = (
    <header className={styles.top}>
      <h1 className={styles.title}>
        <Icon kind="dungeon" /> Les Profondeurs
        {view && <small>Expédition</small>}
      </h1>
      {view && (
        <div className={styles.badges}>
          <span className={styles.pill} data-tone={view.difficulty}>
            <Icon kind={BOSSES[view.difficulty]} /> {LEVELS[view.difficulty].name}
          </span>
          <span className={styles.pill} data-tone="gold">
            <Icon kind="gold" /> {view.loot} or
          </span>
          {view.isMember && (
            <span className={styles.pill} title="Connexion en temps réel">
              {STATUS_LABELS[status]}
            </span>
          )}
        </div>
      )}
    </header>
  )

  if (view === undefined) return <Depths>{header}</Depths>
  if (view === null) {
    return (
      <Depths>
        {header}
        <p className={styles.error}>{ERRORS.GAME_NOT_FOUND}</p>
        <Link href="/dungeon">Retour au Donjon</Link>
      </Depths>
    )
  }

  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((mon) => mon.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }
  const pending = view.lastRound?.effects.slice(replay.step) ?? []
  const inArena = view.phase === 'combat' || (replay.playing && view.monsters.length > 0)
  const threats = (heroId: string) =>
    Object.values(view.intents).filter((intent: IntentView) => intent.target === heroId).length
  const bossRoom = view.room === view.roomCount - 1
  const players = view.heroes.filter((hero) => !hero.companion && hero.hp > 0)
  const callout = replay.current?.skill ? SKILLS[replay.current.skill].name : null
  const told = (view.lastRound?.effects ?? [])
    .slice(0, replay.step)
    .map((effect, order) => ({ effect, order }))

  const heroCards = (pickable: boolean) =>
    view.heroes.map((hero) => {
      const wait = hero.skillWait
      const count = view.phase === 'combat' ? threats(hero.id) : 0
      return (
        <Fighter
          key={hero.id}
          id={hero.id}
          name={hero.name}
          kind={hero.heroClass ?? (hero.companion ? 'companion' : 'hero')}
          hp={shownHp(hero, pending)}
          maxHp={hero.maxHp}
          me={hero.id === userId}
          pickable={pickable && hero.hp > 0}
          onPick={() => act({ type: 'heal', target: hero.id })}
          current={replay.current}
          step={replay.step}
          threat={count > 0}
          detail={
            hero.skill ? (
              <span className={styles.cooldown} data-ready={wait === 0}>
                <Icon kind={hero.skill} />
                {wait === 0 ? SKILLS[hero.skill].name : `${SKILLS[hero.skill].name} · ${wait}`}
              </span>
            ) : hero.companion ? (
              'Compagnon'
            ) : undefined
          }
        >
          {view.phase === 'combat' && hero.ready && hero.hp > 0 && (
            <span className={styles.ready} title="Prêt">
              <Icon kind="done" />
            </span>
          )}
          {count > 0 && hero.hp > 0 && (
            <span className={styles.threat} title="Visé par des monstres">
              <Icon kind="target" /> {count}
            </span>
          )}
        </Fighter>
      )
    })

  return (
    <Depths>
      {header}
      {view.phase !== 'lobby' && <RoomMap view={view} />}

      {view.phase === 'lobby' && (
        <div className={styles.stage}>
          <section className={styles.panel} aria-label="Groupe">
            <h2>Le groupe</h2>
            <Party view={view} />
            {!view.isMember && view.heroes.length < MAX_HEROES && (
              <>
                <h3 style={{ marginTop: 16 }}>Votre héros</h3>
                <ClassPicker value={heroClass} onChange={setHeroClass} />
              </>
            )}
            <div className={styles.actions}>
              {!view.isMember && view.heroes.length < MAX_HEROES && (
                <button type="button" className={styles.big} onClick={join}>
                  Rejoindre l'expédition
                </button>
              )}
              {view.isHost && view.heroes.length < MAX_HEROES && (
                <button type="button" onClick={addCompanion}>
                  <Icon kind="companion" /> Ajouter un compagnon
                </button>
              )}
              {view.isMember && (
                <button type="button" className="ghost" onClick={share}>
                  {copied ? 'Adresse copiée' : 'Inviter des joueurs'}
                </button>
              )}
              {view.isHost && (
                <button type="button" className={styles.big} onClick={start}>
                  Entrer dans le donjon
                </button>
              )}
            </div>
            {view.isMember && !view.isHost && (
              <p className={styles.hint}>En attente du lancement par l'hôte.</p>
            )}
          </section>
        </div>
      )}

      {view.phase === 'exploring' && !inArena && (
        <div className={styles.stage}>
          <section className={styles.panel} aria-label="Exploration">
            <div className={styles.explore}>
              <RoomReveal view={view} />
              <div className={styles.reveal}>
                <Door open={opening} boss={view.room + 1 === view.roomCount - 1} />
                {view.turnHeroId === userId ? (
                  <button
                    type="button"
                    className={styles.big}
                    disabled={opening}
                    onClick={openDoor}
                  >
                    {view.room + 1 === view.roomCount - 1
                      ? 'Affronter le gardien'
                      : 'Pousser la porte'}
                  </button>
                ) : (
                  <p className={styles.hint}>
                    {nameOf(view.turnHeroId ?? '')} s'apprête à pousser la porte.
                  </p>
                )}
                <Clock remaining={remaining} total={EXPLORE_MS / 1000} />
              </div>
            </div>
          </section>
          <div className={styles.row}>{heroCards(false)}</div>
        </div>
      )}

      {inArena && (
        <div className={styles.stage}>
          <section className={styles.arena} aria-label="Combat">
            <div className={styles.arenaHead}>
              <span className={styles.round}>
                {bossRoom ? 'Antre du gardien' : `Salle ${view.room + 1}`} · manche {view.round}
              </span>
              {view.phase === 'combat' && <Clock remaining={remaining} total={ROUND_MS / 1000} />}
            </div>
            <div className={styles.row}>
              {view.monsters.map((monster) => {
                const intent = view.phase === 'combat' ? view.intents[monster.id] : undefined
                return (
                  <Fighter
                    key={monster.id}
                    id={monster.id}
                    name={monsterName(monster, view.monsters)}
                    kind={monster.kind}
                    hp={shownHp(monster, pending)}
                    maxHp={monster.maxHp}
                    monster
                    boss={bossRoom}
                    pickable={canAct && mode === 'attack' && monster.hp > 0}
                    onPick={() => act({ type: 'attack', target: monster.id })}
                    current={replay.current}
                    step={replay.step}
                    detail={`Attaque ${monster.attack}`}
                  >
                    {intent && monster.hp > 0 && !replay.playing && (
                      <span className={styles.intent} title="Attaque annoncée">
                        <Icon kind="target" /> {nameOf(intent.target)} · {intent.min}-{intent.max}
                      </span>
                    )}
                  </Fighter>
                )
              })}
            </div>
            <div className={styles.versus}>
              <span />
            </div>
            <div className={styles.row}>{heroCards(canAct && mode === 'heal')}</div>
            <AnimatePresence>
              {callout && (
                <m.div
                  key={`${callout}-${view.lastRound?.round}`}
                  className={styles.callout}
                  initial={{ opacity: 0, x: '-50%', scale: 1.6 }}
                  animate={{ opacity: 1, x: '-50%', scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                >
                  {callout} !
                </m.div>
              )}
            </AnimatePresence>
          </section>

          {view.phase === 'combat' && me && me.hp > 0 && !me.action && (
            <section className={styles.panel} aria-label="Vos actions">
              {mode && (
                <p className={styles.hint}>
                  {mode === 'attack'
                    ? 'Choisissez le monstre à frapper.'
                    : 'Choisissez le héros à soigner.'}{' '}
                  Échap pour annuler.
                </p>
              )}
              <div className={styles.bar}>
                <button
                  type="button"
                  className={styles.move}
                  aria-pressed={mode === 'attack'}
                  onClick={attack}
                >
                  <kbd>1</kbd>
                  <Icon kind="attack" color="#ff8a6b" />
                  <strong>Attaquer</strong>
                  <small>
                    {Math.max(1, me.attack - 2)} à {me.attack + 2} dégâts
                    {me.critical > 0 && ` · ${Math.round(me.critical * 100)} % critique`}
                  </small>
                </button>
                <button
                  type="button"
                  className={styles.move}
                  onClick={() => act({ type: 'defend' })}
                >
                  <kbd>2</kbd>
                  <Icon kind="defense" color="#cbbda4" />
                  <strong>Se défendre</strong>
                  <small>Divise par deux les coups reçus</small>
                </button>
                <button
                  type="button"
                  className={styles.move}
                  aria-pressed={mode === 'heal'}
                  onClick={() => setMode((current) => (current === 'heal' ? null : 'heal'))}
                >
                  <kbd>3</kbd>
                  <Icon kind="potion" color="#6fcf6a" />
                  <strong>Soigner</strong>
                  <small>Rend {me.heal} PV à un héros</small>
                </button>
                <button
                  type="button"
                  className={styles.move}
                  data-skill="true"
                  data-guide="skill-action"
                  disabled={me.skillWait !== 0}
                  onClick={() => act({ type: 'skill' })}
                >
                  <kbd>4</kbd>
                  <Icon kind={me.skill ?? 'sparkle'} color="#8fb8ff" />
                  <strong>{me.skill ? SKILLS[me.skill].name : 'Compétence'}</strong>
                  <small>
                    {!me.skill
                      ? 'Aucune compétence'
                      : me.skillWait === 0
                        ? SKILLS[me.skill].text
                        : `Prête dans ${me.skillWait} manche${(me.skillWait ?? 0) > 1 ? 's' : ''} (recharge ${SKILL_COOLDOWN})`}
                  </small>
                </button>
              </div>
            </section>
          )}
          {view.phase === 'combat' && me?.action && (
            <div className={styles.wait}>
              <span>
                Votre choix : <strong>{describeAction(me.action, nameOf, me)}</strong>. En attente
                des autres héros
              </span>
              <span className={styles.dots}>
                {players.map((hero) => (
                  <i key={hero.id} data-on={hero.ready} title={hero.name} />
                ))}
              </span>
            </div>
          )}
          {view.phase === 'combat' && me && me.hp <= 0 && (
            <div className={styles.wait}>
              Votre héros est à terre. Le reste du groupe poursuit le combat.
            </div>
          )}
        </div>
      )}

      {view.lastRound && view.lastRound.effects.length > 0 && view.phase !== 'lobby' && (
        <section className={styles.panel} aria-label="Chronique du combat">
          <h3>Manche {view.lastRound.round}</h3>
          <ul className={styles.log}>
            {told.map(({ effect, order }) => (
              <m.li
                key={order}
                data-kind={
                  effect.kind === 'heal'
                    ? 'heal'
                    : effect.kind === 'damage' && effect.critical
                      ? 'crit'
                      : view.heroes.some((hero) => hero.id === effect.target)
                        ? 'hurt'
                        : 'hit'
                }
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
              >
                {describeEffect(effect, nameOf)}
              </m.li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {(view.phase === 'won' || view.phase === 'lost') && !replay.playing && (
        <EndScreen view={view} />
      )}
    </Depths>
  )
}
