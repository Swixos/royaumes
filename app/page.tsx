import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentUser } from '@/bootstrap/server'

/** Evaluated on every request, since the redirect depends on the session. */
export const dynamic = 'force-dynamic'

/**
 * Home page: sends a signed-in player to the village, anyone else to sign-in.
 *
 * @returns Never returns; always redirects.
 */
export default async function Home() {
  const user = await currentUser(await headers())
  redirect(user ? '/village' : '/login')
}
