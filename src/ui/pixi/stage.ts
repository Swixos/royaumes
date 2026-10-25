/**
 * Stage shared by the scenes of the game: a PixiJS application filling its element, a
 * world of fixed size, and the camera through which the player looks at it.
 *
 * @packageDocumentation
 */
import { Application, Container, Graphics } from 'pixi.js'
import { DISPLAY, PALETTE } from './drawing'
import { clampView, type Insets, scaleRange, type View, viewOn, zoomAround } from './view'

/** Camera of a scene: the player zooms with the wheel or two fingers, and slides the world. */
export interface Camera {
  /**
   * Current view of the world.
   *
   * @returns The view.
   */
  view(): View
  /**
   * Zooms around the middle of the screen.
   *
   * @param factor - Zoom factor: above 1 to zoom in, below 1 to zoom out.
   */
  zoomBy(factor: number): void
  /** Comes back to the starting view, on the home point of the scene. */
  reset(): void
  /**
   * Tells whether the gesture under way moved the world, so a tap at its end is not a
   * click on a building.
   *
   * @returns True if the world moved since the finger or the button went down.
   */
  dragged(): boolean
  /**
   * Calls back on every move of the camera, to keep elements of the page over the world.
   *
   * @param listener - Called with the new view.
   */
  onChange(listener: (view: View) => void): void
}

/** Stage of a scene, ready to receive its layers. */
export interface Stage {
  /** PixiJS application, with its ticker and its renderer. */
  app: Application
  /** Container of the world, moved and scaled by the camera. */
  world: Container
  /** Camera of the scene. */
  camera: Camera
  /** True when the system asks for less motion: the scene keeps still. */
  calm: boolean
  /**
   * Stops or restarts the animation, to spare the device while the scene is hidden.
   *
   * @param paused - True to stop the animation.
   */
  pause(paused: boolean): void
  /** Stops the application, forgets the gestures of the camera and frees its resources. */
  destroy(): void
}

/** Frames per second of a scene: smooth enough for its life, and light on a phone battery. */
const MAX_FPS = 30

/** Distance a finger or the mouse travels before a press becomes a slide, in pixels. */
const DRAG_THRESHOLD = 6

/**
 * Creates the stage of a scene in an element of the page, with its camera. The scene starts
 * on its home point, at the scale that fills the element; the player then zooms with the
 * wheel or with two fingers, and slides the world with the mouse or one finger. The menus
 * laid over the scene are declared by the custom properties `--menu-top`, `--menu-right`,
 * `--menu-bottom` and `--menu-left` of the element, in pixels: the world may slide out from
 * under them. The fonts of the plaques are loaded first.
 *
 * @param host - Element receiving the canvas, and the gestures of the player.
 * @param width - Width of the world, in scene units.
 * @param height - Height of the world, in scene units.
 * @param home - Point of the world shown first; the middle of the world by default.
 * @returns The stage.
 */
export async function createStage(
  host: HTMLElement,
  width: number,
  height: number,
  home: { x: number; y: number } = { x: width / 2, y: height / 2 },
): Promise<Stage> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    antialias: true,
    backgroundColor: PALETTE.sea,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  })
  await document.fonts?.load(`700 20px ${DISPLAY}`).catch(() => undefined)
  host.appendChild(app.canvas)
  app.ticker.maxFPS = MAX_FPS
  host.style.touchAction = 'none'
  app.canvas.style.touchAction = 'none'

  const world = new Container()
  app.stage.addChild(world)
  const size = { width, height }
  const listeners: Array<(view: View) => void> = []
  const screen = () => ({ width: app.screen.width, height: app.screen.height })

  /**
   * Reads the margins covered by menus, from the custom properties of the element.
   *
   * @returns The margins, in pixels.
   */
  const readInsets = (): Insets => {
    const style = getComputedStyle(host)
    /**
     * Reads one margin.
     *
     * @param side - Side of the screen.
     * @returns The margin, 0 when not declared.
     */
    const read = (side: string) => Number.parseFloat(style.getPropertyValue(`--menu-${side}`)) || 0
    return { top: read('top'), right: read('right'), bottom: read('bottom'), left: read('left') }
  }
  let insets = readInsets()

  /**
   * Starting view: the home point in the middle of the space left free by the menus.
   *
   * @returns The view.
   */
  const homeView = (): View => {
    const start = viewOn(home, scaleRange(screen(), size).cover, screen())
    return {
      ...start,
      x: start.x + (insets.left - insets.right) / 2,
      y: start.y + (insets.top - insets.bottom) / 2,
    }
  }
  let view: View = clampView(homeView(), screen(), size, insets)

  /**
   * Moves the camera, within its limits.
   *
   * @param next - View asked for.
   */
  function apply(next: View) {
    view = clampView(next, screen(), size, insets)
    world.scale.set(view.scale)
    world.position.set(view.x, view.y)
    for (const listener of listeners) listener(view)
  }
  apply(view)

  app.renderer.on('resize', () => {
    insets = readInsets()
    apply(view)
  })

  const gestures = new AbortController()
  const { signal } = gestures
  const pointers = new Map<number, { x: number; y: number }>()
  let travelled = 0
  let moved = false

  /**
   * Position of an event in the element.
   *
   * @param event - Pointer or wheel event.
   * @returns The position, in pixels.
   */
  const at = (event: { clientX: number; clientY: number }) => {
    const box = host.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  /**
   * Middle and spread of the pointers on the element.
   *
   * @returns The middle point and the distance between the first two pointers.
   */
  const spread = () => {
    const [a, b] = [...pointers.values()]
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      span: Math.hypot(a.x - b.x, a.y - b.y),
    }
  }

  host.addEventListener(
    'pointerdown',
    (event) => {
      if (pointers.size === 0) {
        travelled = 0
        moved = false
      }
      pointers.set(event.pointerId, at(event))
    },
    { signal },
  )

  host.addEventListener(
    'pointermove',
    (event) => {
      const before = pointers.get(event.pointerId)
      if (!before) return
      const now = at(event)
      if (pointers.size >= 2) {
        const old = spread()
        pointers.set(event.pointerId, now)
        const next = spread()
        moved = true
        const zoomed = zoomAround(view, old.span > 0 ? next.span / old.span : 1, next.mid)
        apply({
          ...zoomed,
          x: zoomed.x + next.mid.x - old.mid.x,
          y: zoomed.y + next.mid.y - old.mid.y,
        })
        return
      }
      pointers.set(event.pointerId, now)
      travelled += Math.hypot(now.x - before.x, now.y - before.y)
      if (!moved && travelled < DRAG_THRESHOLD) return
      if (!moved) host.setPointerCapture(event.pointerId)
      moved = true
      apply({ ...view, x: view.x + now.x - before.x, y: view.y + now.y - before.y })
    },
    { signal },
  )

  /**
   * Forgets a pointer lifted or lost.
   *
   * @param event - Pointer event.
   */
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
  }
  host.addEventListener('pointerup', release, { signal })
  host.addEventListener('pointercancel', release, { signal })

  host.addEventListener(
    'click',
    (event) => {
      if (!moved) return
      event.stopPropagation()
      event.preventDefault()
    },
    { capture: true, signal },
  )

  host.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      apply(zoomAround(view, Math.exp(-event.deltaY * 0.0015), at(event)))
    },
    { passive: false, signal },
  )

  const camera: Camera = {
    view: () => view,
    zoomBy: (factor) =>
      apply(zoomAround(view, factor, { x: app.screen.width / 2, y: app.screen.height / 2 })),
    reset: () => {
      insets = readInsets()
      apply(homeView())
    },
    dragged: () => moved,
    onChange: (listener) => {
      listeners.push(listener)
      listener(view)
    },
  }

  return {
    app,
    world,
    camera,
    calm: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    pause: (paused) => (paused ? app.ticker.stop() : app.ticker.start()),
    destroy: () => {
      gestures.abort()
      listeners.length = 0
      app.destroy({ removeView: true }, { children: true })
    },
  }
}

/** A wave drawn on the sea, drifting with the wind. */
export interface Wave {
  view: Graphics
  speed: number
  phase: number
}

/**
 * Scatters small waves on the sea of a scene.
 *
 * @param layer - Layer receiving the waves.
 * @param count - Number of waves.
 * @param width - Width of the world.
 * @param height - Height of the world.
 * @param random - Generator placing the waves.
 * @returns The waves, to move with `driftWaves`.
 */
export function scatterWaves(
  layer: Container,
  count: number,
  width: number,
  height: number,
  random: () => number,
): Wave[] {
  return Array.from({ length: count }, () => {
    const view = new Graphics()
    view.moveTo(-14, 0).quadraticCurveTo(-7, -6, 0, 0).quadraticCurveTo(7, -6, 14, 0)
    view.stroke({ width: 2.5, color: random() > 0.5 ? PALETTE.wave : PALETTE.deep, cap: 'round' })
    view.position.set(random() * width, random() * height)
    layer.addChild(view)
    return { view, speed: 4 + random() * 6, phase: random() * 6 }
  })
}

/**
 * Moves the waves with the wind, and makes them shimmer.
 *
 * @param waves - Waves of the scene.
 * @param width - Width of the world, where the waves wrap around.
 * @param time - Time since the scene started, in seconds.
 * @param dt - Time since the last frame, in seconds.
 */
export function driftWaves(waves: Wave[], width: number, time: number, dt: number) {
  for (const wave of waves) {
    wave.view.x += wave.speed * dt
    if (wave.view.x > width + 20) wave.view.x = -20
    wave.view.alpha = 0.55 + 0.45 * Math.sin(time * 1.4 + wave.phase)
  }
}
