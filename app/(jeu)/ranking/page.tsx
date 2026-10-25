import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { RankingScreen } from '@/modules/ranking/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * Ranking page, with the signed-in player highlighted.
 *
 * @returns The ranking screen.
 */
export default async function RankingPage() {
  const user = await currentUser(await headers())
  return (
    <GameWindow label="Classement">
      <RankingScreen userId={user?.id ?? ''} />
    </GameWindow>
  )
}
