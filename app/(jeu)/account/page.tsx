import { AccountScreen } from '@/ui/account-screen'
import { GameWindow } from '@/ui/game-window'

/**
 * "My data" page. Access is restricted to signed-in players by the game layout.
 *
 * @returns The account screen.
 */
export default function AccountPage() {
  return (
    <GameWindow label="Mes données">
      <AccountScreen />
    </GameWindow>
  )
}
