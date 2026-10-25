'use client'
import { type SceneControls, SceneHost, type SceneLoader } from '@/ui/pixi/scene-host'
import type { VillageSceneHandlers, VillageSceneState } from './village-scene'

/**
 * Loads the village scene, with PixiJS, once the page is on the client.
 *
 * @param host - Element receiving the canvas.
 * @param state - First state to show.
 * @param handlers - Handlers called back by the scene.
 * @returns The live scene.
 */
const loadVillage: SceneLoader<VillageSceneState, VillageSceneHandlers> = async (
  host,
  state,
  handlers,
) => (await import('./village-scene')).createVillageScene(host, state, handlers)

/**
 * Village scene embedded in the page. The canvas is a picture for screen readers: every
 * action of the scene also exists as a control of the page.
 *
 * @param props - Component props.
 * @param props.state - State of the village to show, with the highlighted building.
 * @param props.handlers - Handlers called back when the player acts on the scene.
 * @param props.paused - True while a window covers the village.
 * @param props.controls - Camera buttons of the scene.
 * @returns The element holding the canvas.
 */
export function VillageMap({
  state,
  handlers,
  paused,
  controls,
}: {
  state: VillageSceneState
  handlers: VillageSceneHandlers
  paused: boolean
  controls: SceneControls
}) {
  const { levels } = state
  return (
    <SceneHost
      load={loadVillage}
      state={state}
      handlers={handlers}
      paused={paused}
      controls={controls}
      className="village-map"
      label={`Vue de ${state.name} : hôtel de ville, scierie niveau ${levels.sawmill}, carrière niveau ${levels.quarry}, mine niveau ${levels.mine}`}
    />
  )
}
