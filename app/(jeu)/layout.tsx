import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentUser } from '@/bootstrap/server'
import { VillageScreen } from '@/modules/realm/ui'
import { TutorialGuide } from '@/modules/tutorial/ui'
import { AppShell } from '@/ui/app-shell'

/** Rendered on every request, never ahead of time, since it depends on the session. */
export const dynamic = 'force-dynamic'

/**
 * Layout of the game area, shared by every page of the `(jeu)` group. It checks
 * on the server, before any rendering, that a player is signed in, and
 * redirects to the sign-in page otherwise. The village is drawn here, once: it stays on
 * screen while the player moves between pages, and each page opens its window over it.
 *
 * @param props - Layout props.
 * @param props.children - Window of the current page, if any.
 * @returns The village, the window and the tutorial guide, inside the game shell.
 */
export default async function GameLayout({ children }: { children: ReactNode }) {
  const user = await currentUser(await headers())
  if (!user) redirect('/login')
  return (
    <AppShell
      userName={user.name}
      world={<VillageScreen userId={user.id} />}
      guide={<TutorialGuide />}
    >
      {children}
    </AppShell>
  )
}
