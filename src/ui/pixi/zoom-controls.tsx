'use client'
import { Icon } from '../icons'
import type { SceneControls } from './scene-host'

/**
 * Camera buttons of a scene: zoom in, zoom out and come back to the starting view. They
 * repeat the wheel and the two-finger gesture for players who use neither.
 *
 * @param props - Component props.
 * @param props.controls - Camera of the scene.
 * @returns The buttons.
 */
export function ZoomControls({ controls }: { controls: SceneControls }) {
  return (
    <fieldset className="zoom-controls">
      <legend className="sr-only">Caméra</legend>
      <button type="button" aria-label="Zoomer" onClick={controls.zoomIn}>
        +
      </button>
      <button type="button" aria-label="Dézoomer" onClick={controls.zoomOut}>
        −
      </button>
      <button type="button" aria-label="Recentrer la vue" onClick={controls.recenter}>
        <Icon kind="compass" />
      </button>
    </fieldset>
  )
}
