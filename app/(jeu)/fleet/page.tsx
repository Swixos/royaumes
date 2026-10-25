import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { FleetScreen } from '@/modules/fleet/ui'
import { GameScreen } from '@/ui/game-window'

/**
 * Fleet page. It passes the signed-in player identifier to the component, which uses it
 * to name the real-time channel of the player's harbor and to place their village on the
 * sea map. The `(jeu)` group layout guarantees a player is signed in.
 *
 * @returns The fleet screen of the signed-in player.
 */
export default async function FleetPage() {
  const user = await currentUser(await headers())
  return (
    <GameScreen label="La Flotte">
      <FleetScreen userId={user?.id ?? ''} />
    </GameScreen>
  )
}
