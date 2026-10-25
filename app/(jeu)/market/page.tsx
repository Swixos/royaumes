import { MarketScreen } from '@/modules/market/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * Market page. Access is already restricted to signed-in players by the game layout.
 *
 * @returns The market screen.
 */
export default function MarketPage() {
  return (
    <GameWindow label="Marché">
      <MarketScreen />
    </GameWindow>
  )
}
