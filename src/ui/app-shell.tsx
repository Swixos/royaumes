'use client'
import { hc } from 'hono/client'
import { AnimatePresence, m, useAnimate } from 'motion/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { RealmApi } from '@/modules/realm'
import { RESOURCES, type Resource, stockAt, type VillageView } from '@/modules/realm/contracts'
import { authClient } from '@/platform/auth/client'
import { Entity } from './entity'
import { VILLAGE_CHANGED } from './events'
import { HOME } from './game-window'
import { Icon } from './icons'
import { GameMotion, RollingNumber, SPRING } from './motion'

/** Navigation links: every module added to the game gets an entry here. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/fleet', kind: 'fleet', label: 'Flotte' },
  { href: '/market', kind: 'market', label: 'Marché' },
  { href: '/tavern', kind: 'tavern', label: 'Taverne' },
  { href: '/ranking', kind: 'ranking', label: 'Classement' },
  { href: '/history', kind: 'history', label: 'Historique' },
]

/** Typed HTTP client of the village, read by the resource bar. */
const realm = hc<RealmApi>('/api/realm')

/** Interval between two reads of the village by the resource bar, in milliseconds. */
const RELOAD_MS = 15_000

/**
 * Resource bar of the top of the screen, as in a strategy game: the stock of the player's
 * village, counted every second from its production, and read again from the server
 * every fifteen seconds, when the window comes back to the front, and as soon as a screen
 * announces a change of the village.
 *
 * @returns The resource counters, or nothing before the village is founded.
 */
function ResourceBar() {
  const [view, setView] = useState<VillageView | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    /** Reads the village again. */
    const load = async () => {
      const res = await realm.village.$get()
      if (res.ok && alive) setView((await res.json()).view)
    }
    load()
    const reload = setInterval(load, RELOAD_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    window.addEventListener('focus', load)
    window.addEventListener(VILLAGE_CHANGED, load)
    return () => {
      alive = false
      clearInterval(reload)
      clearInterval(tick)
      window.removeEventListener('focus', load)
      window.removeEventListener(VILLAGE_CHANGED, load)
    }
  }, [])

  if (!view) return null
  const stock = stockAt(view, now)
  return (
    <ul className="resources" aria-label="Ressources du village">
      {RESOURCES.map((resource) => (
        <ResourceCounter
          key={resource}
          resource={resource}
          amount={Math.floor(stock[resource])}
          rate={view.ratesPerMinute[resource]}
          full={stock[resource] >= view.capacity}
        />
      ))}
    </ul>
  )
}

/**
 * Counter of one resource: its number rolls when it jumps, and a gain makes the medallion
 * bounce while the amount gained floats away, as in a strategy game.
 *
 * @param props - Component props.
 * @param props.resource - Resource shown.
 * @param props.amount - Current stock.
 * @param props.rate - Production per minute.
 * @param props.full - True when the warehouse is full for this resource.
 * @returns The counter.
 */
function ResourceCounter({
  resource,
  amount,
  rate,
  full,
}: {
  resource: Resource
  amount: number
  rate: number
  full: boolean
}) {
  const [badge, animateBadge] = useAnimate()
  const [gains, setGains] = useState<{ id: number; gain: number }[]>([])
  const counter = useRef(0)

  const onJump = useCallback(
    (gap: number) => {
      if (gap <= 0) return
      animateBadge(badge.current, { scale: [1, 1.35, 1], rotate: [0, -10, 0] }, { duration: 0.5 })
      const id = ++counter.current
      setGains((current) => [...current, { id, gain: gap }])
      setTimeout(() => setGains((current) => current.filter((g) => g.id !== id)), 1400)
    },
    [animateBadge, badge],
  )

  return (
    <li data-full={full} title={full ? 'Entrepôt plein' : undefined}>
      <span ref={badge} className="resource-badge">
        <Entity kind={resource} />
      </span>
      <strong>
        <RollingNumber value={amount} onJump={onJump} />
      </strong>
      <small>+{rate}/min</small>
      <AnimatePresence>
        {gains.map((g) => (
          <m.span
            key={g.id}
            className="resource-gain"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: -22 }}
            exit={{ opacity: 0, y: -34 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            +{g.gain}
          </m.span>
        ))}
      </AnimatePresence>
    </li>
  )
}

/**
 * Game area shell, on a single screen as in a strategy game: the top bar (coat of arms,
 * resources, player), the game menu, and the village, which fills the screen and stays
 * there. Each page opens its window over the village; while a window is open, the village
 * behind it is inert, so the keyboard and screen readers stay in the window.
 *
 * @param props - Component props.
 * @param props.userName - Name of the signed-in player.
 * @param props.world - Village, drawn under every window.
 * @param props.guide - Guide of the tutorial, laid over every screen.
 * @param props.children - Window of the current page, if any.
 * @returns The game screen.
 */
export function AppShell({
  userName,
  world,
  guide,
  children,
}: {
  userName: string
  world: ReactNode
  guide?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const windowOpen = pathname !== HOME

  /**
   * Deletes the session on the server, then fully reloads the sign-in page so
   * no state of the previous session stays in the browser.
   */
  async function signOut() {
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <GameMotion>
      <div className="game">
        <header className="hud">
          <Link href="/village" className="crest">
            <span className="crest-badge">
              <Icon kind="brand" />
            </span>
            <span className="crest-name hud-label">Royaumes</span>
          </Link>
          <ResourceBar />
          <div className="player">
            <span className="player-name hud-label">
              <Icon kind="hero" /> {userName}
            </span>
            <Link
              href="/account"
              className="hud-button"
              aria-current={pathname === '/account' ? 'page' : undefined}
            >
              <Icon kind="account" /> <span className="hud-label">Mes données</span>
            </Link>
            <button className="hud-button" type="button" onClick={signOut}>
              <Icon kind="logout" /> <span className="hud-label">Déconnexion</span>
            </button>
          </div>
        </header>
        <nav className="menu" aria-label="Navigation principale">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="menu-item"
              data-guide={`nav-${item.kind}`}
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            >
              <m.span
                className="menu-badge"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.9, y: 1 }}
                transition={SPRING}
              >
                <Icon kind={item.kind} />
              </m.span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <main className="world" inert={windowOpen}>
          {world}
          <footer className="credits">
            Icônes : <a href="https://game-icons.net">Game Icons</a>, par Lorc, Delapouite et leurs
            contributeurs, sous licence{' '}
            <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>.
          </footer>
        </main>
        <div className="window-host">{children}</div>
        {guide}
      </div>
    </GameMotion>
  )
}
