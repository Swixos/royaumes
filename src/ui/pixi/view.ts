/**
 * Rules of the camera of a scene: how far it zooms, and where it may go. This file holds
 * no rendering library, so the rules are tested without a browser.
 *
 * @packageDocumentation
 */

/** A size, in pixels or in world units. */
export interface Size {
  width: number
  height: number
}

/** Position of the camera: the world is scaled by `scale`, then moved by `x` and `y`. */
export interface View {
  /** Pixels per world unit. */
  scale: number
  /** Horizontal position of the world origin on screen, in pixels. */
  x: number
  /** Vertical position of the world origin on screen, in pixels. */
  y: number
}

/** Margins of the screen covered by menus, which the world may slide out from under. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/** No margin: the whole screen shows the world. */
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/** Furthest the camera zooms in, as a multiple of the scale covering the screen. */
export const MAX_ZOOM = 3

/**
 * Smallest and largest scales of a world on a screen: from the whole world in view to three
 * times the scale that fills the screen.
 *
 * @param screen - Size of the screen, in pixels.
 * @param world - Size of the world, in world units.
 * @returns The smallest and largest scales.
 */
export function scaleRange(screen: Size, world: Size) {
  const contain = Math.min(screen.width / world.width, screen.height / world.height)
  const cover = Math.max(screen.width / world.width, screen.height / world.height)
  return { min: contain, cover, max: cover * MAX_ZOOM }
}

/**
 * Keeps a view within its limits: the scale within its range, and the world over the
 * screen. The menus laid over the edges of the screen are margins the world may slide out
 * from under, so nothing stays hidden behind them. Along an axis where the world is smaller
 * than the space between the margins, it is centered in that space.
 *
 * @param view - View to check.
 * @param screen - Size of the screen, in pixels.
 * @param world - Size of the world, in world units.
 * @param insets - Margins of the screen covered by menus.
 * @returns The view within its limits.
 */
export function clampView(view: View, screen: Size, world: Size, insets: Insets = NO_INSETS): View {
  const { min, max } = scaleRange(screen, world)
  const scale = Math.min(max, Math.max(min, view.scale))
  /**
   * Keeps one axis of the world over the screen, between its margins.
   *
   * @param position - Position of the world origin on this axis.
   * @param span - Size of the screen on this axis.
   * @param extent - Size of the world on this axis, in pixels.
   * @param start - Margin at the start of the axis.
   * @param end - Margin at the end of the axis.
   * @returns The position within its limits.
   */
  const clampAxis = (position: number, span: number, extent: number, start: number, end: number) =>
    extent <= span - start - end
      ? start + (span - start - end - extent) / 2
      : Math.min(start, Math.max(span - end - extent, position))
  return {
    scale,
    x: clampAxis(view.x, screen.width, world.width * scale, insets.left, insets.right),
    y: clampAxis(view.y, screen.height, world.height * scale, insets.top, insets.bottom),
  }
}

/**
 * Zooms a view around a point of the screen, which stays under the cursor or the fingers.
 *
 * @param view - Current view.
 * @param factor - Zoom factor: above 1 to zoom in, below 1 to zoom out.
 * @param around - Point of the screen kept in place, in pixels.
 * @returns The zoomed view, not yet clamped.
 */
export function zoomAround(view: View, factor: number, around: { x: number; y: number }): View {
  const scale = view.scale * factor
  return {
    scale,
    x: around.x - ((around.x - view.x) * scale) / view.scale,
    y: around.y - ((around.y - view.y) * scale) / view.scale,
  }
}

/**
 * View showing a point of the world in the middle of the screen, at a given scale.
 *
 * @param point - Point of the world to show, in world units.
 * @param scale - Scale of the view.
 * @param screen - Size of the screen, in pixels.
 * @returns The view, not yet clamped.
 */
export function viewOn(point: { x: number; y: number }, scale: number, screen: Size): View {
  return { scale, x: screen.width / 2 - point.x * scale, y: screen.height / 2 - point.y * scale }
}
