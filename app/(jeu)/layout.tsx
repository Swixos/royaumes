import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentUser } from '@/bootstrap/server'
import { AppShell } from '@/ui/app-shell'

/** Rendered on every request, never ahead of time, since it depends on the session. */
export const dynamic = 'force-dynamic'

/**
 * Layout of the game area, shared by every page of the `(jeu)` group. It checks
 * on the server, before any rendering, that a player is signed in, and
 * redirects to the sign-in page otherwise.
 *
 * @param props - Layout props.
 * @param props.children - Game page content.
 * @returns The page inside the game shell.
 */
export default async function GameLayout({ children }: { children: ReactNode }) {
  const user = await currentUser(await headers())
  if (!user) redirect('/login')
  return <AppShell userName={user.name}>{children}</AppShell>
}
