'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Countdown to a deadline. Once the deadline is reached, `onExpired` is called
 * every second until the deadline changes, so the call is repeated if the server
 * has not noticed it yet. The callback is kept in a ref so that a new callback on
 * each render does not restart the timer.
 *
 * @param deadline - Deadline in milliseconds, or `null` when there is none.
 * @param onExpired - Called every second once the deadline is reached.
 * @returns The remaining seconds, or `null` when there is no deadline.
 */
export function useCountdown(deadline: number | null, onExpired: () => void): number | null {
  const [now, setNow] = useState(() => Date.now())

  const handler = useRef(onExpired)
  handler.current = onExpired

  useEffect(() => {
    if (deadline === null) return
    setNow(Date.now())
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) handler.current()
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}
