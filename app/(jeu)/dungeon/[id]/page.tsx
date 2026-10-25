import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { DungeonGame } from '@/modules/dungeon/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * Expedition page. Its address holds the expedition identifier, so sharing it
 * is enough for other players to join.
 *
 * @param props - Page props.
 * @param props.params - Route parameters, holding the expedition `id`.
 * @returns The expedition screen of the signed-in player.
 */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser(await headers())
  return (
    <GameWindow label="Expédition">
      <DungeonGame gameId={id} userId={user?.id ?? ''} />
    </GameWindow>
  )
}
