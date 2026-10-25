'use client'
import { type RefObject, useEffect } from 'react'

/**
 * Scrolls a horizontal scroller so a point of its content stands in the middle of the
 * screen, once on mount and whenever that point changes. On a wide screen the content fits
 * and nothing scrolls; on a phone, the player starts on what matters, and slides the map
 * with a finger to see the rest.
 *
 * @param scroller - Element scrolling horizontally.
 * @param share - Horizontal position of the point, as a share of the content width, from 0
 *   to 1; null to leave the scroll as it is.
 */
export function useCenteredScroll(scroller: RefObject<HTMLElement | null>, share: number | null) {
  useEffect(() => {
    const element = scroller.current
    if (!element || share === null) return
    element.scrollLeft = share * element.scrollWidth - element.clientWidth / 2
  }, [scroller, share])
}
