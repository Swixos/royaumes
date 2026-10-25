/**
 * Stage shared by the scenes of the game: a PixiJS application filling its element, and a
 * world of fixed size scaled to cover it.
 *
 * @packageDocumentation
 */
import { Application, Container, Graphics } from 'pixi.js'
import { DISPLAY, PALETTE } from './drawing'

/** Stage of a scene, ready to receive its layers. */
export interface Stage {
  /** PixiJS application, with its ticker and its renderer. */
  app: Application
  /** Container of the world, scaled to the element. */
  world: Container
  /** True when the system asks for less motion: the scene keeps still. */
  calm: boolean
  /** Scale of the world on screen, updated on resize. */
  scale(): number
  /**
   * Stops or restarts the animation, to spare the device while the scene is hidden.
   *
   * @param paused - True to stop the animation.
   */
  pause(paused: boolean): void
  /** Stops the application and frees its resources. */
  destroy(): void
}

/**
 * Creates the stage of a scene in an element of the page. The world keeps its proportions
 * and covers the element, centered; the fonts of the plaques are loaded first. A finger
 * sliding on the canvas still scrolls the page, so a scene never traps a phone user.
 *
 * @param host - Element receiving the canvas; its size is the size of the scene.
 * @param width - Width of the world, in scene units.
 * @param height - Height of the world, in scene units.
 * @returns The stage.
 */
export async function createStage(
  host: HTMLElement,
  width: number,
  height: number,
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
  app.renderer.events.autoPreventDefault = false
  app.canvas.style.touchAction = 'pan-x pan-y'

  const world = new Container()
  app.stage.addChild(world)
  let scale = 1

  /** Scales the world to cover the canvas, centered. */
  function fitWorld() {
    scale = Math.max(app.screen.width / width, app.screen.height / height)
    world.scale.set(scale)
    world.position.set(
      (app.screen.width - width * scale) / 2,
      (app.screen.height - height * scale) / 2,
    )
  }
  fitWorld()
  app.renderer.on('resize', fitWorld)

  return {
    app,
    world,
    calm: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    scale: () => scale,
    pause: (paused) => (paused ? app.ticker.stop() : app.ticker.start()),
    destroy: () => app.destroy({ removeView: true }, { children: true }),
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
