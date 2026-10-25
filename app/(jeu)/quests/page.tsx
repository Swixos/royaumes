import { QuestsScreen } from '@/modules/tutorial/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * Quests page: the tutorial of the player, told by their advisor.
 *
 * @returns The quests screen, in its window.
 */
export default function QuestsPage() {
  return (
    <GameWindow label="Quêtes">
      <QuestsScreen />
    </GameWindow>
  )
}
