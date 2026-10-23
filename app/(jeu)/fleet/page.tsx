import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { FleetScreen } from '@/modules/fleet/ui'

/**
 * Fleet page. It passes the signed-in player identifier to the component, which uses it
 * to name the real-time channel of the player's harbor and to place their village on the
 * sea map. The `(jeu)` group layout guarantees a player is signed in.
 *
 * @returns The fleet screen of the signed-in player.
 */
export default async function FleetPage() {
  const user = await currentUser(await headers())
  return <FleetScreen userId={user?.id ?? ''} />
}
