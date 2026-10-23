import { GAME_ICONS } from './game-icons'

/**
 * Draws an icon of the game, from the Game Icons set (`game-icons.ts`). Inside another SVG,
 * the icon is placed with `x`, `y` and `size`; in HTML, it takes the size of the text. Its
 * color is the current text color, unless one is given.
 *
 * @param props - Component props.
 * @param props.kind - Entity or interface element.
 * @param props.size - Width and height, in the units of the parent; 1em by default.
 * @param props.color - Fill color; the current text color by default.
 * @param props.x - Horizontal position inside a parent SVG.
 * @param props.y - Vertical position inside a parent SVG.
 * @returns The icon, hidden from screen readers.
 */
export function Icon({
  kind,
  size = '1em',
  color = 'currentColor',
  x,
  y,
}: {
  kind: string
  size?: number | string
  color?: string
  x?: number
  y?: number
}) {
  const paths = GAME_ICONS[kind] ?? GAME_ICONS.compass
  return (
    <svg
      className="icon"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      x={x}
      y={y}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d.slice(0, 32)} d={d} fill={color} />
      ))}
    </svg>
  )
}
