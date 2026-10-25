'use client'
import { useEffect, useRef } from 'react'

/** Live scene driven by its host. */
export interface LiveScene<S> {
  /**
   * Shows a new state.
   *
   * @param state - New state.
   */
  update(state: S): void
  /**
   * Stops or restarts the animation of the scene.
   *
   * @param paused - True to stop the animation.
   */
  pause(paused: boolean): void
  /** Stops the scene and frees its resources. */
  destroy(): void
}

/**
 * Loader of a scene: it imports the scene code, then creates the scene in its element.
 *
 * @param host - Element receiving the canvas.
 * @param state - First state to show.
 * @param handlers - Handlers the scene calls back; they always reach the latest ones given
 *   to the host.
 * @returns The live scene.
 */
export type SceneLoader<S, H> = (host: HTMLElement, state: S, handlers: H) => Promise<LiveScene<S>>

/**
 * Element holding a PixiJS scene. The scene is loaded on the client only, once the element
 * is mounted, so PixiJS stays out of the server rendering and of the first bundle. The
 * canvas is a picture for screen readers, described by `label`: every action of the scene
 * must also exist as a control of the page.
 *
 * @param props - Component props.
 * @param props.load - Loader of the scene, called once.
 * @param props.state - State to show; the scene is updated when it changes.
 * @param props.handlers - Handlers the scene calls back.
 * @param props.label - Description of the picture, for screen readers.
 * @param props.className - Class of the element, which sets its size.
 * @param props.paused - True to stop the animation while the scene is hidden.
 * @returns The element holding the canvas.
 */
export function SceneHost<S, H extends object>({
  load,
  state,
  handlers,
  label,
  className,
  paused = false,
}: {
  load: SceneLoader<S, H>
  state: S
  handlers: H
  label: string
  className: string
  paused?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<LiveScene<S> | null>(null)
  const latest = useRef({ state, handlers, load, paused })
  latest.current = { state, handlers, load, paused }

  useEffect(() => {
    let alive = true
    let made: LiveScene<S> | null = null
    const element = host.current
    if (!element) return
    const relay = new Proxy({} as H, {
      get:
        (_, key) =>
        (...args: unknown[]) =>
          (latest.current.handlers[key as keyof H] as (...values: unknown[]) => unknown)(...args),
    })
    latest.current.load(element, latest.current.state, relay).then((created) => {
      if (!alive) {
        created.destroy()
        return
      }
      made = created
      scene.current = created
      created.update(latest.current.state)
      created.pause(latest.current.paused)
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
    scene.current?.pause(paused)
  }, [paused])

  return <div ref={host} className={className} role="img" aria-label={label} />
}
