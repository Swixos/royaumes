import { DungeonLobby } from '@/modules/dungeon/ui'
import { GameWindow } from '@/ui/game-window'

/**
 * Dungeon page: open expeditions and opening a new one.
 *
 * @returns The dungeon lobby.
 */
export default function DungeonPage() {
  return (
    <GameWindow label="Donjon">
      <DungeonLobby />
    </GameWindow>
  )
}
