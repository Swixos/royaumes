'use client'
import { hc } from 'hono/client'
import { AnimatePresence, m } from 'motion/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Entity } from '@/ui/entity'
import { TUTORIAL_CHANGED, TUTORIAL_INTRO, VILLAGE_CHANGED } from '@/ui/events'
import { Icon } from '@/ui/icons'
import { DROP, SPRING } from '@/ui/motion'
import { look } from '@/ui/theme'
import type { TutorialApi } from './api'
import type { Amounts, QuestView, TutorialView } from './contracts'
import styles from './tutorial.module.css'

/** Typed HTTP client, inferred from the Hono sub-app of the module. */
const client = hc<TutorialApi>('/api/tutorial')

/** Name of the advisor who tells the quests. */
const ADVISOR = 'Ysolde'

/** Address of the village, the only screen where the quest card shows. */
const HOME = '/village'

/** Address of the quests window. */
const QUESTS_PATH = '/quests'

/** Interval between two reads of the tutorial, in milliseconds. */
const RELOAD_MS = 8_000

/** Name of each building with its article, as the advisor says it. */
const THE: Record<string, string> = {
  senate: 'le Sénat',
  sawmill: 'la Scierie',
  quarry: 'la Carrière',
  mine: 'la Mine',
  warehouse: 'l’Entrepôt',
  wall: 'le Rempart',
  shipyard: 'le Chantier naval',
}

/** One step of the guide: an element of the page to point at, and what to do with it. */
interface Step {
  /** Value of the `data-guide` attribute of the element. */
  target: string
  /** Hint shown next to the element. */
  hint: string
  /** Hint shown in the middle of the screen while the element is out of view, if any. */
  away?: string
}

/**
 * Steps of the guide for a quest, from the first screen to open to the last button to
 * touch. The guide points at the deepest step visible on screen, so it moves forward
 * with the player.
 *
 * @param quest - Quest under way.
 * @returns The steps, in order.
 */
function stepsOf(quest: QuestView): Step[] {
  if (quest.building) {
    return [
      { target: 'nav-village', hint: 'Revenez au village' },
      {
        target: `building-${quest.building}`,
        hint: `Touchez ${THE[quest.building] ?? look(quest.building).label}`,
      },
      { target: `upgrade-${quest.building}`, hint: 'Lancez le chantier' },
    ]
  }
  switch (quest.id) {
    case 'offer':
      return [
        { target: 'nav-market', hint: 'Ouvrez le Marché' },
        { target: 'publish-offer', hint: 'Choisissez un échange, puis publiez' },
      ]
    case 'expedition':
      return [
        { target: 'nav-dungeon', hint: 'Ouvrez le Donjon' },
        { target: 'open-expedition', hint: 'Ouvrez une expédition' },
      ]
    case 'expedition-won':
      return [{ target: 'nav-dungeon', hint: 'Menez une expédition jusqu’à la victoire' }]
    case 'posture':
      return [
        { target: 'nav-fleet', hint: 'Ouvrez la Flotte' },
        { target: 'fleet-harbor', hint: 'Ouvrez Votre port' },
        { target: 'posture', hint: 'Choisissez une posture' },
      ]
    case 'pirate-raid':
    case 'naval-victory':
      return [
        { target: 'nav-fleet', hint: 'Ouvrez la Flotte' },
        {
          target: 'target-pirates',
          hint: quest.id === 'pirate-raid' ? 'Touchez une île pirate' : 'Visez une île plus faible',
          away: 'Faites glisser la carte jusqu’à une île pirate, au drapeau noir',
        },
        { target: 'launch-raid', hint: 'Hissez les voiles' },
      ]
    default:
      return []
  }
}

/**
 * Tells whether an element shows on screen and is not covered: its middle point is in
 * the window, and the element found there is the element itself or one of its children.
 *
 * @param element - Element to check.
 * @returns True if the player can see and touch it.
 */
function onScreen(element: Element): boolean {
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return false
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false
  const hit = document.elementFromPoint(x, y)
  return !!hit && (element === hit || element.contains(hit))
}

/**
 * Reads the tutorial of the player, and reads it again on a timer, when the window comes
 * back to the front, and whenever the village or the tutorial changes.
 *
 * @returns The view of the tutorial, null before it is read, and a function to read it again.
 */
function useTutorial() {
  const [view, setView] = useState<TutorialView | null>(null)
  const reload = useCallback(async () => {
    const res = await client.index.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])
  useEffect(() => {
    reload()
    const timer = setInterval(reload, RELOAD_MS)
    for (const name of ['focus', VILLAGE_CHANGED, TUTORIAL_CHANGED]) {
      window.addEventListener(name, reload)
    }
    return () => {
      clearInterval(timer)
      for (const name of ['focus', VILLAGE_CHANGED, TUTORIAL_CHANGED]) {
        window.removeEventListener(name, reload)
      }
    }
  }, [reload])
  return { view, reload }
}

/**
 * Claims the reward of a quest, then announces the change of the village and of the
 * tutorial to the other screens.
 *
 * @param questId - Quest whose reward is claimed.
 * @returns The reward paid, or null if the claim was refused.
 */
async function claimReward(questId: string): Promise<Amounts | null> {
  const res = await client.quests[':id'].claim.$post({ param: { id: questId } })
  if (!res.ok) return null
  const body = await res.json()
  window.dispatchEvent(new Event(VILLAGE_CHANGED))
  window.dispatchEvent(new Event(TUTORIAL_CHANGED))
  return 'reward' in body ? (body.reward as Amounts) : {}
}

/**
 * Sends a command to the guide of the tutorial, then announces the change.
 *
 * @param command - Command to send.
 * @returns Resolves once the command is recorded.
 */
async function command(command: 'start' | 'pause' | 'resume') {
  await client[command].$post()
  window.dispatchEvent(new Event(TUTORIAL_CHANGED))
}

/**
 * Medallion of the advisor.
 *
 * @param props - Component props.
 * @param props.size - `large` for the introduction, `small` otherwise.
 * @returns The medallion.
 */
function Advisor({ size = 'small' }: { size?: 'small' | 'large' }) {
  return (
    <span className={styles.advisor} data-size={size} aria-hidden="true">
      <Icon kind="advisor" />
    </span>
  )
}

/**
 * Resources of a reward, each with its icon.
 *
 * @param props - Component props.
 * @param props.reward - Resources of the reward.
 * @returns The list of the resources.
 */
function Reward({ reward }: { reward: Amounts }) {
  return (
    <span className={styles.reward}>
      {(['wood', 'stone', 'gold'] as const)
        .filter((resource) => (reward[resource] ?? 0) > 0)
        .map((resource) => (
          <span key={resource} className={styles.amount}>
            <Entity kind={resource} /> {reward[resource]}
          </span>
        ))}
    </span>
  )
}

/**
 * Bar of the progress on the goal of a quest.
 *
 * @param props - Component props.
 * @param props.quest - Quest shown.
 * @returns The bar, with its caption.
 */
function GoalBar({ quest }: { quest: QuestView }) {
  const { current, target, done, pending } = quest.progress
  const caption = done
    ? 'Objectif atteint'
    : pending
      ? 'Chantier en cours…'
      : quest.building
        ? `Niveau ${current} / ${target}`
        : 'À accomplir'
  return (
    <span className={styles.goal}>
      <span
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={current}
        aria-label={quest.task}
      >
        <m.span
          className={styles.fill}
          initial={false}
          animate={{ width: `${(Math.min(current, target) / target) * 100}%` }}
          transition={SPRING}
          data-done={done}
        />
      </span>
      <small>{caption}</small>
    </span>
  )
}

/** Pages of the introduction told by the advisor. */
const INTRO = [
  {
    title: 'Bienvenue, seigneur !',
    text: `Je suis ${ADVISOR}, votre conseillère. Votre village n'est encore qu'un hameau au bord de la mer : ensemble, nous allons en faire un royaume.`,
    icon: 'village',
  },
  {
    title: 'Les ressources',
    text: 'Le bois, la pierre et l’or arrivent chaque minute de la scierie, de la carrière et de la mine. Vos réserves s’affichent en haut de l’écran ; l’entrepôt fixe leur plafond.',
    icon: 'wood',
  },
  {
    title: 'Les bâtiments',
    text: 'Touchez un bâtiment dans le village ou dans la barre des bâtiments pour l’agrandir. Deux chantiers avancent en même temps, et le Sénat les accélère.',
    icon: 'build',
  },
  {
    title: 'Le royaume',
    text: 'Le Donjon, la Flotte, le Marché, la Taverne, le Classement et l’Historique s’ouvrent en fenêtres par-dessus le village. Vous ne le quittez jamais.',
    icon: 'fleet',
  },
  {
    title: 'Vos quêtes',
    text: 'Je vous confierai des quêtes, chacune payée en ressources. Suivez la lumière dorée : elle montre où toucher. Vous retrouverez vos quêtes en me touchant.',
    icon: 'chest',
  },
]

/**
 * Introduction of the tutorial: the advisor presents the game in a few pages.
 *
 * @param props - Component props.
 * @param props.onStart - Called to start the tutorial.
 * @param props.onLater - Called to leave the introduction for later.
 * @returns The introduction, laid over the whole page.
 */
function Intro({ onStart, onLater }: { onStart: () => void; onLater: () => void }) {
  const [page, setPage] = useState(0)
  const last = page === INTRO.length - 1
  const { title, text, icon } = INTRO[page]
  return createPortal(
    <m.div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <m.div
        className={styles.intro}
        initial={{ y: 60, scale: 0.92 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={DROP}
      >
        <div className={styles.introHead}>
          <Advisor size="large" />
          <div>
            <p className={styles.speaker}>{ADVISOR}, conseillère du royaume</p>
            <AnimatePresence mode="wait">
              <m.h2
                key={title}
                id="intro-title"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <Entity kind={icon} /> {title}
              </m.h2>
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence mode="wait">
          <m.p
            key={page}
            className={styles.speech}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {text}
          </m.p>
        </AnimatePresence>
        <div className={styles.dots} aria-hidden="true">
          {INTRO.map((item, index) => (
            <span key={item.title} data-on={index === page} />
          ))}
        </div>
        <div className={styles.introActions}>
          <button type="button" className="ghost" onClick={onLater}>
            Plus tard
          </button>
          {page > 0 && (
            <button type="button" className="ghost" onClick={() => setPage(page - 1)}>
              Précédent
            </button>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => (last ? onStart() : setPage(page + 1))}
          >
            {last ? 'Commencer' : 'Suivant'}
          </button>
        </div>
      </m.div>
    </m.div>,
    document.body,
  )
}

/**
 * Golden light around the element the player should touch next, with a hint beside it.
 * It follows the element while the page moves, and lets every touch through. The bubble
 * stays inside the screen, and its arrow always points at the element. A step hidden
 * further down a window, or aside in the building bar, is scrolled into view once.
 *
 * @param props - Component props.
 * @param props.steps - Steps of the quest under way.
 * @param props.pathname - Address of the current page.
 * @returns The light, or nothing when no step shows on screen.
 */
function Spotlight({ steps, pathname }: { steps: Step[]; pathname: string }) {
  const [spot, setSpot] = useState<{ box: DOMRect | null; hint: string } | null>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = tip.current
    if (!element || !spot) return
    const next = { width: element.offsetWidth, height: element.offsetHeight }
    setSize((current) =>
      current.width === next.width && current.height === next.height ? current : next,
    )
  }, [spot])

  useEffect(() => {
    let key: string | null = null
    const scrolled = new Set<string>()
    /** Looks for the deepest step on screen, and moves the light onto it. */
    const look = () => {
      let found: { box: DOMRect | null; hint: string } | null = null
      let away: string | null = null
      for (let i = steps.length - 1; i >= 0 && !found; i--) {
        const step = steps[i]
        if (step.target.startsWith('nav-') && pathname.startsWith(`/${step.target.slice(4)}`)) {
          continue
        }
        const all = [...document.querySelectorAll(`[data-guide="${step.target}"]`)]
        const element = all.find(onScreen) ?? all[0]
        if (element && onScreen(element)) {
          found = { box: element.getBoundingClientRect(), hint: step.hint }
        } else if (element && step.away && away === null) {
          away = step.away
        } else if (
          element &&
          !scrolled.has(step.target) &&
          element.closest('.game-window-body, .village-bar')
        ) {
          scrolled.add(step.target)
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
        }
      }
      if (away !== null && (!found || found.hint !== away)) {
        const deeper = steps.findIndex((step) => step.away === away)
        const shown = steps.findIndex((step) => step.hint === found?.hint)
        if (!found || shown < deeper) found = { box: null, hint: away }
      }
      const box = found?.box
      const next = found
        ? `${box ? `${Math.round(box.left)}:${Math.round(box.top)}:${Math.round(box.width)}:${Math.round(box.height)}` : 'away'}:${found.hint}`
        : ''
      if (next === key) return
      key = next
      setSpot(found)
    }
    look()
    const timer = setInterval(look, 250)
    return () => clearInterval(timer)
  }, [steps, pathname])

  if (!spot) return null
  const { box, hint } = spot
  if (!box) {
    return createPortal(
      <m.div
        className={styles.tip}
        data-side="free"
        role="status"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ left: '50%', top: '58%' }}
      >
        <Icon kind="advisor" /> {hint}
      </m.div>,
      document.body,
    )
  }
  const below = box.top < 150
  const center = box.left + box.width / 2
  const margin = 8
  const left = Math.min(
    Math.max(center - size.width / 2, margin),
    window.innerWidth - size.width - margin,
  )
  const arrow = Math.min(Math.max(center - left, 16), Math.max(16, size.width - 16))
  const top = below ? box.bottom + 16 : box.top - 16 - size.height
  return createPortal(
    <>
      <m.div
        className={styles.ring}
        aria-hidden="true"
        initial={false}
        animate={{
          left: box.left - 6,
          top: box.top - 6,
          width: box.width + 12,
          height: box.height + 12,
        }}
        transition={SPRING}
      />
      <m.div
        ref={tip}
        className={styles.tip}
        data-side={below ? 'below' : 'above'}
        role="status"
        initial={false}
        animate={{ left, top, opacity: size.width > 0 ? 1 : 0 }}
        transition={SPRING}
        style={{ '--arrow': `${arrow}px` } as CSSProperties}
      >
        <Icon kind="advisor" /> {hint}
      </m.div>
    </>,
    document.body,
  )
}

/**
 * Message celebrating a reward paid, with its resources.
 *
 * @param props - Component props.
 * @param props.reward - Resources paid.
 * @param props.title - Title of the quest completed.
 * @returns The message.
 */
function RewardToast({ reward, title }: { reward: Amounts; title: string }) {
  return createPortal(
    <m.div
      className={styles.toast}
      role="status"
      initial={{ y: -80, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={DROP}
    >
      <m.span
        className={styles.toastChest}
        initial={{ rotate: -20, scale: 0.4 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ ...SPRING, delay: 0.15 }}
      >
        <Entity kind="chest" />
      </m.span>
      <span>
        <strong>Quête accomplie : {title}</strong>
        <Reward reward={reward} />
      </span>
    </m.div>,
    document.body,
  )
}

/**
 * Guide of the tutorial, present on every screen of the game: the introduction of the
 * advisor, and the golden light showing where to touch. On the village, the advisor
 * medallion shows the card of the quest under way with its reward, or opens the quests
 * window when the guide is paused.
 *
 * @returns The guide.
 */
export function TutorialGuide() {
  const pathname = usePathname()
  const { view, reload } = useTutorial()
  const [hasVillage, setHasVillage] = useState(false)
  const [intro, setIntro] = useState(false)
  const introSeen = useRef(false)
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches,
  )
  const [toast, setToast] = useState<{ reward: Amounts; title: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    /** Tells whether the village is founded, from its building bar. */
    const check = () => setHasVillage(!!document.querySelector('[data-guide^="building-"]'))
    check()
    const timer = setInterval(check, 1_000)
    const showIntro = () => setIntro(true)
    window.addEventListener(TUTORIAL_INTRO, showIntro)
    return () => {
      clearInterval(timer)
      window.removeEventListener(TUTORIAL_INTRO, showIntro)
    }
  }, [])

  useEffect(() => {
    if (view && hasVillage && !view.started && !view.paused && !introSeen.current) {
      introSeen.current = true
      setIntro(true)
    }
  }, [view, hasVillage])

  const quest = view?.quests.find((item) => item.id === view.current) ?? null
  const ready = quest?.status === 'ready'
  useEffect(() => {
    if (ready) setOpen(true)
  }, [ready])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4_000)
    return () => clearTimeout(timer)
  }, [toast])

  const steps = useMemo(() => {
    return quest && quest.status === 'active' && !quest.progress.pending ? stepsOf(quest) : []
  }, [quest])

  /** Claims the reward of the quest under way. */
  const claim = async () => {
    if (!quest) return
    setBusy(true)
    const reward = await claimReward(quest.id)
    setBusy(false)
    if (reward) setToast({ reward, title: quest.title })
    reload()
  }

  if (!view || !hasVillage) return null
  const guiding = view.started && !view.paused && quest !== null
  const index = quest ? view.quests.indexOf(quest) + 1 : view.quests.length
  const chapter = view.chapters.find((item) => item.id === quest?.chapter)

  return (
    <>
      <AnimatePresence>
        {intro && (
          <Intro
            key="intro"
            onStart={async () => {
              setIntro(false)
              await command(view.paused ? 'resume' : 'start')
            }}
            onLater={async () => {
              setIntro(false)
              if (!view.started) await command('pause')
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <RewardToast key="toast" {...toast} />}</AnimatePresence>
      {guiding && pathname !== QUESTS_PATH && <Spotlight steps={steps} pathname={pathname} />}
      {pathname === HOME && (
        <div className={styles.dock} data-open={guiding && open}>
          {guiding ? (
            <button
              type="button"
              className={styles.medallion}
              data-ready={ready}
              aria-expanded={open}
              aria-label={`Quête en cours : ${quest?.title}`}
              onClick={() => setOpen(!open)}
            >
              <Advisor />
              {ready && <span className={styles.badge}>!</span>}
            </button>
          ) : (
            <Link href={QUESTS_PATH} className={styles.medallion} aria-label="Quêtes">
              <Advisor />
            </Link>
          )}
          <AnimatePresence mode="wait">
            {guiding && open && quest && (
              <m.section
                key={quest.id}
                className={styles.card}
                aria-label="Quête en cours"
                data-ready={ready}
                initial={{ opacity: 0, x: -20, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.96 }}
                transition={SPRING}
              >
                <p className={styles.kicker}>
                  Quête {index} / {view.quests.length}
                  {chapter && ` · ${chapter.title}`}
                </p>
                <h2 className={styles.title}>{quest.title}</h2>
                <p className={styles.task}>{quest.task}</p>
                <GoalBar quest={quest} />
                <div className={styles.cardFoot}>
                  <Reward reward={quest.reward} />
                  {ready ? (
                    <button type="button" className="primary" disabled={busy} onClick={claim}>
                      <Icon kind="chest" /> Récompense
                    </button>
                  ) : (
                    <Link href={QUESTS_PATH} className={styles.more}>
                      Détails
                    </Link>
                  )}
                </div>
              </m.section>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  )
}

/** French label of the status of a quest. */
const STATUS_LABELS = {
  claimed: 'Terminée',
  ready: 'Récompense à réclamer',
  active: 'En cours',
  locked: 'À venir',
} as const

/** Icon of the status of a quest. */
const STATUS_ICONS = {
  claimed: 'done',
  ready: 'sparkle',
  active: 'quest',
  locked: 'locked',
} as const

/**
 * Quests window: the advisor tells the quest under way, every chapter lists its quests
 * with their goal and their reward, and the guide can be paused, resumed or introduced
 * again.
 *
 * @returns The quests of the player.
 */
export function QuestsScreen() {
  const { view, reload } = useTutorial()
  const [toast, setToast] = useState<{ reward: Amounts; title: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4_000)
    return () => clearTimeout(timer)
  }, [toast])

  if (!view) return <p className="muted">Chargement des quêtes...</p>
  const current = view.quests.find((quest) => quest.id === view.current) ?? null
  const share = view.claimed / view.quests.length

  /**
   * Claims the reward of a quest.
   *
   * @param quest - Quest whose reward is claimed.
   */
  const claim = async (quest: QuestView) => {
    setBusy(quest.id)
    const reward = await claimReward(quest.id)
    setBusy(null)
    if (reward) setToast({ reward, title: quest.title })
    reload()
  }

  return (
    <>
      <h1>
        <Entity kind="quest" /> Quêtes
      </h1>
      <AnimatePresence>{toast && <RewardToast key="toast" {...toast} />}</AnimatePresence>
      <section className={styles.council} aria-label={`${ADVISOR}, conseillère du royaume`}>
        <Advisor size="large" />
        <div className={styles.bubble}>
          <p className={styles.speaker}>{ADVISOR}, conseillère du royaume</p>
          <p>
            {current
              ? current.advice
              : 'Toutes les quêtes sont accomplies : le royaume est à vous, seigneur.'}
          </p>
          <div className={styles.total}>
            <span className={styles.bar}>
              <span className={styles.fill} style={{ width: `${share * 100}%` }} data-done />
            </span>
            <small>
              {view.claimed} / {view.quests.length} quêtes accomplies
            </small>
          </div>
          <div className={styles.controls}>
            {!view.started || view.paused ? (
              <button
                type="button"
                className="primary"
                onClick={() => command(view.started ? 'resume' : 'start')}
              >
                {view.started ? 'Reprendre le guide' : 'Commencer le tutoriel'}
              </button>
            ) : (
              <button type="button" className="ghost" onClick={() => command('pause')}>
                Mettre le guide en pause
              </button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => window.dispatchEvent(new Event(TUTORIAL_INTRO))}
            >
              Revoir l’introduction
            </button>
          </div>
        </div>
      </section>
      {view.chapters.map((chapter) => {
        const quests = view.quests.filter((quest) => quest.chapter === chapter.id)
        const done = quests.filter((quest) => quest.status === 'claimed').length
        return (
          <section key={chapter.id} className="panel" aria-labelledby={`chapter-${chapter.id}`}>
            <h2 id={`chapter-${chapter.id}`}>
              <Entity kind={chapter.icon} /> {chapter.title}{' '}
              <small className={styles.count}>
                {done} / {quests.length}
              </small>
            </h2>
            <ol className={styles.list}>
              {quests.map((quest) => (
                <li key={quest.id} className={styles.quest} data-status={quest.status}>
                  <span className={styles.status} title={STATUS_LABELS[quest.status]}>
                    <Entity kind={STATUS_ICONS[quest.status]} />
                  </span>
                  <span className={styles.questText}>
                    <strong>{quest.title}</strong>
                    <span>{quest.task}</span>
                    {(quest.status === 'active' || quest.status === 'ready') && (
                      <GoalBar quest={quest} />
                    )}
                  </span>
                  <span className={styles.questSide}>
                    <Reward reward={quest.reward} />
                    {quest.status === 'ready' ? (
                      <button
                        type="button"
                        className="primary"
                        disabled={busy === quest.id}
                        onClick={() => claim(quest)}
                      >
                        <Icon kind="chest" /> Réclamer
                      </button>
                    ) : (
                      <small className={styles.state}>{STATUS_LABELS[quest.status]}</small>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </>
  )
}
