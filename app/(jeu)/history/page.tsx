import { ChronicleScreen } from '@/modules/chronicle/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * History page: what happened to the player in every part of the game.
 *
 * @returns The history screen, in its window.
 */
export default function HistoryPage() {
  return (
    <GameWindow label="Historique">
      <ChronicleScreen />
    </GameWindow>
  )
}
