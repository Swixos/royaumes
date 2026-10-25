'use client'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef } from 'react'
import { Icon } from './icons'

/** Address of the village, the screen every window opens over and closes back to. */
export const HOME = '/village'

/**
 * Window of the game, opened over the village like the windows of a strategy game: the
 * village stays on screen behind it, and closing the window goes back to it. On a phone
 * the window takes the whole screen between the top bar and the menu. Escape closes it,
 * and the focus moves into it when it opens.
 *
 * @param props - Component props.
 * @param props.children - Content of the window.
 * @param props.label - Name of the window, read by screen readers.
 * @param props.onClose - Called to close the window; by default, goes back to the village.
 * @param props.size - `wide` for a screen with a map, `narrow` for a card.
 * @returns The window.
 */
export function GameWindow({
  children,
  label,
  onClose,
  size = 'wide',
}: {
  children: ReactNode
  label: string
  onClose?: () => void
  size?: 'wide' | 'narrow'
}) {
  const router = useRouter()
  const panel = useRef<HTMLDivElement>(null)
  const close = onClose ?? (() => router.push(HOME))
  const latest = useRef(close)
  latest.current = close

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    /**
     * Closes the window on Escape.
     *
     * @param event - Key pressed.
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="game-window-layer" data-size={size}>
      <button
        type="button"
        className="game-window-backdrop"
        aria-label={`Fermer : ${label}`}
        tabIndex={-1}
        onClick={() => latest.current()}
      />
      <div ref={panel} className="game-window" role="dialog" aria-label={label} tabIndex={-1}>
        <button
          type="button"
          className="game-window-close"
          aria-label="Fermer la fenêtre"
          onClick={() => latest.current()}
        >
          <Icon kind="close" />
        </button>
        <div className="game-window-body">{children}</div>
      </div>
    </div>
  )
}
