import { Icon } from './icons'
import { look } from './theme'

/**
 * Renders a game entity (resource, building...) from the theme: its icon in its color.
 * The icon is hidden from screen readers, which read the label instead.
 *
 * @param props - Component props.
 * @param props.kind - Entity identifier in the theme.
 * @param props.showLabel - Whether to display the label next to the icon.
 * @param props.plain - Whether to draw the icon in the current text color.
 * @returns The entity icon with its label.
 */
export function Entity({
  kind,
  showLabel = false,
  plain = false,
}: {
  kind: string
  showLabel?: boolean
  plain?: boolean
}) {
  const { label, color } = look(kind)
  return (
    <span className="entity" title={label}>
      <Icon kind={kind} color={plain ? 'currentColor' : color} />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
