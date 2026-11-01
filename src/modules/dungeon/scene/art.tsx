'use client'
import { m } from 'motion/react'
import { Icon } from '@/ui/icons'
import styles from '../dungeon.module.css'

/**
 * Wall torch of the dungeon: an iron sconce and a flame that flickers, with the halo of
 * light it throws on the stones.
 *
 * @param props - Component props.
 * @param props.side - Side of the screen the torch hangs on.
 * @returns The torch.
 */
export function Torch({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={styles.torch} data-side={side} aria-hidden="true">
      <span className={styles.halo} />
      <svg viewBox="0 0 40 90" className={styles.torchArt} aria-hidden="true">
        <g className={styles.flame}>
          <path d="M20 4 C30 18 32 28 26 38 C24 42 16 42 14 38 C8 28 10 18 20 4 Z" fill="#f08a24" />
          <path
            d="M20 14 C26 24 26 31 23 36 C21 39 19 39 17 36 C14 31 14 24 20 14 Z"
            fill="#ffd36b"
          />
          <path d="M20 24 C22 29 22 33 20 36 C18 33 18 29 20 24 Z" fill="#fff4c2" />
        </g>
        <path d="M11 40 H29 L25 52 H15 Z" fill="#3b2b1e" />
        <rect x="17" y="52" width="6" height="30" rx="2" fill="#5a3b22" />
        <rect x="9" y="58" width="22" height="4" rx="2" fill="#2a1f17" />
      </svg>
    </div>
  )
}

/**
 * Embers drifting up from the torches, drawn at fixed places so the picture never changes
 * between two renders.
 *
 * @returns The embers.
 */
export function Embers() {
  return (
    <div className={styles.embers} aria-hidden="true">
      {[8, 14, 22, 78, 84, 91, 47, 63].map((left, index) => (
        <span
          key={left}
          style={{ left: `${left}%`, animationDelay: `${index * 0.7}s` }}
          className={styles.ember}
        />
      ))}
    </div>
  )
}

/**
 * Arched double door of the next room, studded with iron. Its two leaves swing open when
 * `open` becomes true.
 *
 * @param props - Component props.
 * @param props.open - True while the door opens.
 * @param props.boss - True for the door of the last room, marked with a skull.
 * @returns The door.
 */
export function Door({ open, boss }: { open: boolean; boss: boolean }) {
  const swing = { duration: 0.9, ease: [0.3, 0.1, 0.2, 1] as const }
  return (
    <div className={styles.doorFrame} aria-hidden="true">
      <div className={styles.doorGlow} data-open={open} />
      <svg viewBox="0 0 200 240" className={styles.doorArch} aria-hidden="true">
        <path d="M10 240 V100 A90 90 0 0 1 190 100 V240 Z" fill="#14100c" />
        <path
          d="M10 240 V100 A90 90 0 0 1 190 100 V240"
          fill="none"
          stroke="#4a3d31"
          strokeWidth="14"
        />
        {[30, 60, 100, 140, 170].map((x) => (
          <rect key={x} x={x - 9} y={x === 100 ? 2 : 22} width="18" height="12" fill="#5d4e40" />
        ))}
      </svg>
      <div className={styles.leaves}>
        {(['left', 'right'] as const).map((side) => (
          <m.svg
            key={side}
            viewBox="0 0 90 220"
            className={styles.leaf}
            data-side={side}
            initial={false}
            animate={{ rotateY: open ? (side === 'left' ? -105 : 105) : 0 }}
            transition={swing}
          >
            <path
              d={
                side === 'left'
                  ? 'M0 220 V90 A90 90 0 0 1 90 2 V220 Z'
                  : 'M90 220 V90 A90 90 0 0 0 0 2 V220 Z'
              }
              fill="#6b4426"
            />
            {[30, 60].map((x) => (
              <rect key={x} x={x - 2} y="10" width="4" height="210" fill="#5a3820" />
            ))}
            {[70, 160].map((y) => (
              <rect key={y} x="0" y={y} width="90" height="10" fill="#2f2620" />
            ))}
            {[10, 45, 80].flatMap((x) =>
              [75, 165].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#bfa77a" />),
            )}
            <circle
              cx={side === 'left' ? 78 : 12}
              cy="128"
              r="7"
              fill="none"
              stroke="#bfa77a"
              strokeWidth="3"
            />
          </m.svg>
        ))}
      </div>
      {boss && (
        <span className={styles.doorSkull}>
          <Icon kind="boss" size={44} color="#e9d9b4" />
        </span>
      )}
    </div>
  )
}
