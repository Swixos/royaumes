import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { TavernScreen } from '@/modules/tavern/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * Tavern page, where the signed-in player's messages are highlighted.
 *
 * @returns The tavern screen.
 */
export default async function TavernPage() {
  const user = await currentUser(await headers())
  return (
    <GameWindow label="Taverne">
      <TavernScreen userId={user?.id ?? ''} />
    </GameWindow>
  )
}
