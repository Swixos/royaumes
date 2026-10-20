import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { VillageScreen } from '@/modules/realm/ui'

/**
 * Village page. It passes the signed-in player identifier to the component,
 * which uses it to name the village real-time channel. The `(jeu)` group
 * layout guarantees a player is signed in.
 *
 * @returns The village screen of the signed-in player.
 */
export default async function VillagePage() {
  const user = await currentUser(await headers())
  return <VillageScreen userId={user?.id ?? ''} />
}
