'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { authClient } from '@/platform/auth/client'
import { Entity } from './entity'

/** Navigation links: every module added to the game gets an entry here. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/ranking', kind: 'ranking', label: 'Classement' },
  { href: '/market', kind: 'market', label: 'Marché' },
  { href: '/tavern', kind: 'tavern', label: 'Taverne' },
  { href: '/fleet', kind: 'fleet', label: 'Flotte' },
]

/**
 * Game area shell: navigation, player name and sign-out.
 *
 * @param props - Component props.
 * @param props.userName - Name of the signed-in player.
 * @param props.children - Page content.
 * @returns The navigation bar followed by the page.
 */
export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname()

  /**
   * Deletes the session on the server, then fully reloads the sign-in page so
   * no state of the previous session stays in the browser.
   */
  async function signOut() {
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
          >
            <Entity kind={item.kind} /> {item.label}
          </Link>
        ))}
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {userName}
        </span>
        <Link href="/account" aria-current={pathname === '/account' ? 'page' : undefined}>
          Mes données
        </Link>
        <button className="link" type="button" onClick={signOut}>
          Déconnexion
        </button>
      </nav>
      {children}
    </>
  )
}
