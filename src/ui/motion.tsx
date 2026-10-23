'use client'
import {
  animate,
  domMax,
  LazyMotion,
  MotionConfig,
  m,
  useMotionValue,
  useTransform,
} from 'motion/react'
import { type ReactNode, useEffect, useRef } from 'react'

/** Spring of the game: quick, with a short rebound, like a piece set down on a board. */
export const SPRING = { type: 'spring', stiffness: 420, damping: 26 } as const

/** Softer spring, for windows and banners that drop into place. */
export const DROP = { type: 'spring', stiffness: 260, damping: 20 } as const

/**
 * Motion of the game: loads the animation features once for the whole interface, and
 * follows the "reduce motion" setting of the player's system.
 *
 * @param props - Component props.
 * @param props.children - Animated interface.
 * @returns The interface, with its animation features.
 */
export function GameMotion({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

/**
 * Number that rolls to its new value when it jumps, as the counters of a strategy game.
 * A change of one unit, such as the production of a second, is shown at once.
 *
 * @param props - Component props.
 * @param props.value - Number to show.
 * @param props.onJump - Called when the number jumps by more than one unit.
 * @returns The rolling number.
 */
export function RollingNumber({
  value,
  onJump,
}: {
  value: number
  onJump?: (gain: number) => void
}) {
  const motionValue = useMotionValue(value)
  const shown = useTransform(motionValue, (v) => Math.floor(v))
  const previous = useRef(value)

  useEffect(() => {
    const gap = value - previous.current
    previous.current = value
    if (Math.abs(gap) < 2) {
      motionValue.set(value)
      return
    }
    onJump?.(gap)
    const controls = animate(motionValue, value, { duration: 0.8, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, motionValue, onJump])

  return <m.span>{shown}</m.span>
}
