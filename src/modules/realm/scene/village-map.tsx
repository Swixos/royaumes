'use client'
import { useEffect, useRef } from 'react'
import type { Building } from '../contracts'
import type { VillageScene, VillageSceneState } from './village-scene'

/**
 * Village scene embedded in the page. PixiJS is loaded on the client only, once the
 * element is mounted, so it stays out of the server rendering and of the first bundle.
 * The canvas is a picture for screen readers: every action of the scene also exists as a
 * control of the page.
 *
 * @param props - Component props.
 * @param props.state - State of the village to show.
 * @param props.selected - Building highlighted in the scene, or null.
 * @param props.onSelect - Called when the player picks a building in the scene.
 * @returns The element holding the canvas.
 */
export function VillageMap({
  state,
  selected,
  onSelect,
}: {
  state: VillageSceneState
  selected: Building | null
  onSelect: (building: Building) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<VillageScene | null>(null)
  const latest = useRef({ state, selected, onSelect })
  latest.current = { state, selected, onSelect }

  useEffect(() => {
    let alive = true
    let made: VillageScene | null = null
    import('./village-scene').then(async ({ createVillageScene }) => {
      const element = host.current
      if (!alive || !element) return
      const created = await createVillageScene(element, latest.current.state, {
        onSelect: (building) => latest.current.onSelect(building),
      })
      if (!alive) {
        created.destroy()
        return
      }
      made = created
      scene.current = created
      created.update(latest.current.state)
      created.select(latest.current.selected)
    })
    return () => {
      alive = false
      made?.destroy()
      scene.current = null
    }
  }, [])

  useEffect(() => {
    scene.current?.update(state)
  }, [state])

  useEffect(() => {
    scene.current?.select(selected)
  }, [selected])

  return (
    <div
      ref={host}
      className="village-map"
      role="img"
      aria-label={`Vue de ${state.name} : hôtel de ville, scierie niveau ${state.levels.sawmill}, carrière niveau ${state.levels.quarry}, mine niveau ${state.levels.mine}`}
    />
  )
}
